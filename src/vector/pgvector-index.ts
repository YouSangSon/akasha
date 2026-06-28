// pgvector adapter implementing the VectorIndex port.
//
// All pgvector-specific concerns live here:
//   - The VectorFilter → SQL WHERE dialect translation (mirrors buildQdrantMust logic)
//   - Parameterized multi-row upsert with programmatic placeholder construction
//   - Score conversion: pgvector <=> is cosine DISTANCE; Qdrant returns cosine
//     SIMILARITY. We emit `1 - (embedding <=> $vec::vector)` so consumers
//     (rankResults etc.) see the same similarity semantics as the Qdrant path.
//   - BIGINT memory_record_id is returned as a string by node-postgres — convert
//     back to Number so payload parity with the Qdrant path is maintained.
//
// Nothing outside this file should reference pgvector SQL syntax.
//
// ── Production hardening notes ──────────────────────────────────────────────
//
// MULTI-TENANT RECALL (HIGH 1):
//   HNSW returns the global top-ef_search candidates, then filters by org. A
//   small tenant's rows may never appear in the global top-ef_search, yielding
//   0 results. Two mitigations applied:
//   (a) Composite BTree indexes on (organization_id, scope_type, scope_id/key)
//       so the planner can do an exact filtered scan for selective tenants.
//   (b) `SET LOCAL hnsw.iterative_scan = 'strict_order'` inside a transaction
//       before each ANN query (pgvector 0.8+), so the HNSW scan continues until
//       limit rows pass the WHERE predicate, regardless of ef_search.
//       Tune HNSW_EF_SEARCH (default 200) for the throughput/recall tradeoff.
//
// BATCH BIND-PARAM CAP (HIGH 2):
//   Postgres caps bind params at 65535. Each row needs 8 params, so >8191 rows
//   in a single INSERT overflows. upsert() chunks into UPSERT_BATCH_ROWS rows
//   per INSERT and wraps all batches in one transaction.
//
// EXTENSION PREREQUISITE (HIGH 3):
//   ensureCollection() no longer runs CREATE EXTENSION — that requires superuser
//   and fails on managed Postgres (RDS, Cloud SQL, Supabase). Instead it checks
//   pg_extension and throws a clear operator-facing error if the extension is
//   absent. The Docker image (pgvector/pgvector:pg16) ships with the extension
//   pre-installed; a DB admin only needs `CREATE EXTENSION vector;` once on
//   managed hosts.
//
// DIMENSION MISMATCH GUARD (MEDIUM 4):
//   After table creation, ensureCollection() reads the actual column dimension
//   from pg_attribute and throws early if it ≠ the configured `dimensions`.
//   This surfaces mismatches at startup rather than as a cryptic upsert error.
//
// EMPTY EMBEDDING GUARD (LOW 5):
//   upsert() validates that every point's vector is non-empty before building
//   SQL — an empty embedding would produce "[]"::vector which pgvector rejects,
//   aborting the entire batch without a useful error message.
//
import type { PgPool } from "../db/connection.js";
import type {
  VectorDeleteOptions,
  VectorFilter,
  VectorHit,
  VectorIndex,
  VectorPoint,
} from "./vector-index.js";
import { assertOptionalVectorOrganizationId } from "./organization-id.js";

// Max rows per INSERT batch — 14 params/row × 4000 = 56000 < 65535 cap.
const UPSERT_BATCH_ROWS = 4000;

// ef_search value used for iterative HNSW scanning. Higher values improve
// recall for small/selective tenants at the cost of more candidates scanned.
// Tune down if p99 query latency becomes a concern at high table cardinality.
const HNSW_EF_SEARCH = 200;

export type CreatePgVectorIndexOptions = {
  tableName?: string;
};

export function createPgVectorIndex(
  pool: PgPool,
  options: CreatePgVectorIndexOptions = {},
): VectorIndex {
  // tableName is a trusted-caller constant (table names can't be parameterized
  // in SQL; callers supply either the production default or an isolated test table).
  const tableName = options.tableName ?? "memory_vectors";

  return {
    async ensureCollection(dimensions: number): Promise<void> {
      // HIGH 3: Do NOT create the extension — requires superuser, fails on managed
      // Postgres (RDS, Cloud SQL, Supabase). Check it exists and guide the operator.
      const extCheck = await pool.query<{ exists: number }>(
        "SELECT 1 AS exists FROM pg_extension WHERE extname = 'vector'",
      );
      if (extCheck.rows.length === 0) {
        throw new Error(
          "The pgvector extension is required but not installed. " +
          "Have a database admin run: CREATE EXTENSION vector; " +
          "(On the Docker image pgvector/pgvector:pg16 this is done once with " +
          "`psql -U postgres -c \"CREATE EXTENSION IF NOT EXISTS vector;\"`. " +
          "On RDS/Cloud SQL/Supabase, use the managed extension panel or a " +
          "superuser migration.)",
        );
      }

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          point_id            TEXT        PRIMARY KEY,
          memory_record_id    BIGINT,
          organization_id     TEXT        NOT NULL,
          scope_type          TEXT,
          scope_id            TEXT,
          project_key         TEXT,
          kind                TEXT,
          durability          TEXT,
          title               TEXT,
          summary             TEXT,
          tags                JSONB       NOT NULL DEFAULT '[]'::jsonb,
          updated_at          TEXT,
          embedding_version   TEXT,
          embedding           vector(${dimensions})
        )
      `);

      await pool.query(`
        ALTER TABLE ${tableName}
          ADD COLUMN IF NOT EXISTS durability TEXT,
          ADD COLUMN IF NOT EXISTS title TEXT,
          ADD COLUMN IF NOT EXISTS summary TEXT,
          ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb,
          ADD COLUMN IF NOT EXISTS updated_at TEXT,
          ADD COLUMN IF NOT EXISTS embedding_version TEXT
      `);

      // HNSW index for cosine similarity — preferred over IVFFlat for recall
      // without training; tolerates small tables well (no min-row requirement).
      await pool.query(`
        CREATE INDEX IF NOT EXISTS ${tableName}_embedding_hnsw_idx
        ON ${tableName} USING hnsw (embedding vector_cosine_ops)
      `);

      // HIGH 1(a): Composite BTree indexes so the planner can do an exact
      // filtered scan for selective tenants instead of relying on HNSW post-filter.
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_${tableName}_org_scope
        ON ${tableName} (organization_id, scope_type, scope_id)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_${tableName}_org_project
        ON ${tableName} (organization_id, scope_type, project_key)
      `);

      // MEDIUM 4: Verify the stored column dimension matches the configured one.
      // CREATE TABLE IF NOT EXISTS is a no-op if the table exists with a different
      // vector(N) — catch the mismatch here rather than at first upsert.
      // For pgvector, atttypmod stores the dimension directly (confirmed empirically:
      // `SELECT atttypmod FROM pg_attribute WHERE attname='embedding'` on a
      // vector(3) column returns 3).
      const dimResult = await pool.query<{ actual_dim: number }>(
        `SELECT atttypmod AS actual_dim
         FROM pg_attribute
         WHERE attrelid = $1::regclass AND attname = 'embedding'`,
        [`${tableName}`],
      );
      if (dimResult.rows.length > 0) {
        const actualDim = dimResult.rows[0].actual_dim;
        if (actualDim !== dimensions) {
          throw new Error(
            `Dimension mismatch on table "${tableName}": ` +
            `column stores vector(${actualDim}) but configured dimensions=${dimensions}. ` +
            "Drop and recreate the table (or run a reindex migration) before starting.",
          );
        }
      }
    },

    async upsert(points: VectorPoint[]): Promise<void> {
      if (points.length === 0) return;

      // LOW 5: Validate embeddings before building SQL — an empty vector produces
      // "[]"::vector which pgvector rejects and aborts the entire batch.
      for (const point of points) {
        if (point.vector.length === 0) {
          throw new Error(
            `upsert: point "${point.id}" has an empty embedding vector. ` +
            "Ensure the embedding step produced a valid vector before calling upsert.",
          );
        }
      }

      // HIGH 2: Chunk into batches of UPSERT_BATCH_ROWS to stay under the
      // Postgres 65535 bind-param ceiling (8 params/row × 8000 = 64000).
      // All batches run inside a single transaction for atomicity.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        for (let batchStart = 0; batchStart < points.length; batchStart += UPSERT_BATCH_ROWS) {
          const batch = points.slice(batchStart, batchStart + UPSERT_BATCH_ROWS);

          // Build INSERT ... ON CONFLICT DO UPDATE for this batch.
          // Each row contributes 8 placeholders (point_id, memory_record_id,
          // organization_id, scope_type, scope_id, project_key, kind, embedding).
          // The embedding placeholder is cast to vector to prevent node-postgres
          // from serialising a JS array as a Postgres array literal, which pgvector
          // rejects. We pass the embedding as a JSON-style string "[x,y,z]".
          const valueClauses: string[] = [];
          const params: unknown[] = [];

          for (const point of batch) {
            const base = params.length;
            valueClauses.push(
              `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}::jsonb, $${base + 12}, $${base + 13}, $${base + 14}::vector)`,
            );
            const payload = point.payload;
            params.push(
              point.id,
              payload.memory_record_id ?? null,
              payload.organization_id ?? "",
              payload.scope_type ?? null,
              payload.scope_id ?? null,
              payload.project_key ?? null,
              payload.kind ?? null,
              payload.durability ?? null,
              payload.title ?? null,
              payload.summary ?? null,
              JSON.stringify(Array.isArray(payload.tags) ? payload.tags : []),
              payload.updated_at ?? null,
              payload.embedding_version ?? null,
              // pgvector requires a bracketed JSON-array string, not a PG array.
              `[${point.vector.join(",")}]`,
            );
          }

          const sql = `
            INSERT INTO ${tableName}
              (
                point_id,
                memory_record_id,
                organization_id,
                scope_type,
                scope_id,
                project_key,
                kind,
                durability,
                title,
                summary,
                tags,
                updated_at,
                embedding_version,
                embedding
              )
            VALUES ${valueClauses.join(", ")}
            ON CONFLICT (point_id) DO UPDATE SET
              memory_record_id  = EXCLUDED.memory_record_id,
              organization_id   = EXCLUDED.organization_id,
              scope_type        = EXCLUDED.scope_type,
              scope_id          = EXCLUDED.scope_id,
              project_key       = EXCLUDED.project_key,
              kind              = EXCLUDED.kind,
              durability        = EXCLUDED.durability,
              title             = EXCLUDED.title,
              summary           = EXCLUDED.summary,
              tags              = EXCLUDED.tags,
              updated_at        = EXCLUDED.updated_at,
              embedding_version = EXCLUDED.embedding_version,
              embedding         = EXCLUDED.embedding
          `;

          await client.query(sql, params);
        }

        await client.query("COMMIT");
      } catch (err) {
        // Preserve and rethrow the original error even if ROLLBACK itself fails
        // (a dead/dropped connection must not mask the real failure).
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore rollback failure */
        }
        throw err;
      } finally {
        client.release();
      }
    },

    async query(vector: number[], filter: VectorFilter, limit: number): Promise<VectorHit[]> {
      assertOptionalVectorOrganizationId(filter.organizationId);

      // HIGH 1(b): Run inside a transaction so SET LOCAL is scoped to this query.
      // hnsw.iterative_scan='strict_order' (pgvector 0.8+) makes HNSW keep
      // scanning until `limit` rows pass the WHERE predicate — prevents the
      // small-tenant recall hole where the tenant's rows never appear in the
      // global top-ef_search candidates.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // SET does not accept bind params — interpolate the numeric constant (safe).
        await client.query(`SET LOCAL hnsw.ef_search = ${HNSW_EF_SEARCH}`);
        await client.query("SET LOCAL hnsw.iterative_scan = 'strict_order'");

        const params: unknown[] = [];

        // Pass the query vector as a bracketed string and cast to vector in SQL —
        // same reason as in upsert: prevents node-postgres array serialisation.
        params.push(`[${vector.join(",")}]`);
        const vecPlaceholder = `$${params.length}::vector`;

        const whereClauses: string[] = [];

        // Mirror buildQdrantMust: add org clause only when organizationId is non-empty.
        if (filter.organizationId) {
          params.push(filter.organizationId);
          whereClauses.push(`organization_id = $${params.length}`);
        }

        // retrieve-memory.ts always passes exactly one scope, so this is a
        // deterministic single-iteration loop (no OR branching needed in practice).
        // We replicate the per-scope branching from buildQdrantMust exactly:
        //   - scope_type = $n
        //   - AND (scopeType==="project" && projectKey != null
        //       ? project_key = $m
        //       : scope_id    = $m)
        for (const scope of filter.scopes) {
          params.push(scope.scopeType);
          whereClauses.push(`scope_type = $${params.length}`);

          if (scope.scopeType === "project" && filter.projectKey != null) {
            params.push(filter.projectKey);
            whereClauses.push(`project_key = $${params.length}`);
          } else {
            params.push(scope.scopeId);
            whereClauses.push(`scope_id = $${params.length}`);
          }
        }

        params.push(limit);
        const limitPlaceholder = `$${params.length}`;

        const whereSQL = whereClauses.length > 0
          ? `WHERE ${whereClauses.join(" AND ")}`
          : "";

        const sql = `
          SELECT
            point_id,
            memory_record_id,
            organization_id,
            scope_type,
            scope_id,
            project_key,
            kind,
            durability,
            title,
            summary,
            tags,
            updated_at,
            embedding_version,
            1 - (embedding <=> ${vecPlaceholder}) AS score
          FROM ${tableName}
          ${whereSQL}
          ORDER BY embedding <=> ${vecPlaceholder}
          LIMIT ${limitPlaceholder}
        `;

        type Row = {
          point_id: string;
          memory_record_id: string | null;
          organization_id: string;
          scope_type: string | null;
          scope_id: string | null;
          project_key: string | null;
          kind: string | null;
          durability: string | null;
          title: string | null;
          summary: string | null;
          tags: string[] | null;
          updated_at: string | null;
          embedding_version: string | null;
          score: number;
        };

        const result = await client.query<Row>(sql, params);
        await client.query("COMMIT");

        return result.rows.map((row) => ({
          id: row.point_id,
          score: Number(row.score),
          payload: {
            // node-postgres returns BIGINT (int8) as a string — coerce back to
            // Number for parity with the Qdrant path (which sees it as a number).
            memory_record_id: row.memory_record_id == null
              ? null
              : Number(row.memory_record_id),
            organization_id: row.organization_id,
            scope_type: row.scope_type,
            scope_id: row.scope_id,
            project_key: row.project_key,
            kind: row.kind,
            durability: row.durability,
            title: row.title,
            summary: row.summary,
            tags: row.tags ?? [],
            updated_at: row.updated_at,
            embedding_version: row.embedding_version,
          },
        }));
      } catch (err) {
        // Preserve and rethrow the original error even if ROLLBACK itself fails
        // (a dead/dropped connection must not mask the real failure).
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore rollback failure */
        }
        throw err;
      } finally {
        client.release();
      }
    },

    async delete(ids: string[], options: VectorDeleteOptions = {}): Promise<void> {
      assertOptionalVectorOrganizationId(options.organizationId);

      if (ids.length === 0) return;
      if (options.organizationId) {
        await pool.query(
          `DELETE FROM ${tableName} WHERE point_id = ANY($1) AND organization_id = $2`,
          [ids, options.organizationId],
        );
        return;
      }
      await pool.query(`DELETE FROM ${tableName} WHERE point_id = ANY($1)`, [ids]);
    },

    async deleteByRecordIds(
      recordIds: number[],
      options: VectorDeleteOptions = {},
    ): Promise<void> {
      assertOptionalVectorOrganizationId(options.organizationId);

      if (recordIds.length === 0) return;
      if (options.organizationId) {
        await pool.query(
          `DELETE FROM ${tableName} WHERE memory_record_id = ANY($1) AND organization_id = $2`,
          [recordIds, options.organizationId],
        );
        return;
      }
      await pool.query(
        `DELETE FROM ${tableName} WHERE memory_record_id = ANY($1)`,
        [recordIds],
      );
    },
  };
}
