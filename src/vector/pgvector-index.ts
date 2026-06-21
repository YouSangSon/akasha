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

import type { PgPool } from "../db/connection.js";
import type { VectorFilter, VectorHit, VectorIndex, VectorPoint } from "./vector-index.js";

export type CreatePgVectorIndexOptions = {
  tableName?: string;
};

export function createPgVectorIndex(
  pool: PgPool,
  options: CreatePgVectorIndexOptions = {},
): VectorIndex {
  const tableName = options.tableName ?? "memory_vectors";

  return {
    async ensureCollection(dimensions: number): Promise<void> {
      await pool.query("CREATE EXTENSION IF NOT EXISTS vector");

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          point_id            TEXT        PRIMARY KEY,
          memory_record_id    BIGINT,
          organization_id     TEXT        NOT NULL,
          scope_type          TEXT,
          scope_id            TEXT,
          project_key         TEXT,
          kind                TEXT,
          embedding           vector(${dimensions})
        )
      `);

      // HNSW index for cosine similarity — preferred over IVFFlat for recall
      // without training; tolerates small tables well (no min-row requirement).
      await pool.query(`
        CREATE INDEX IF NOT EXISTS ${tableName}_embedding_hnsw_idx
        ON ${tableName} USING hnsw (embedding vector_cosine_ops)
      `);
    },

    async upsert(points: VectorPoint[]): Promise<void> {
      if (points.length === 0) return;

      // Build a single multi-row INSERT ... ON CONFLICT DO UPDATE.
      // Each row contributes 8 placeholders (point_id, memory_record_id,
      // organization_id, scope_type, scope_id, project_key, kind, embedding).
      // The embedding placeholder is cast to vector to prevent node-postgres
      // from serialising a JS array as a Postgres array literal, which pgvector
      // rejects. We pass the embedding as a JSON-style string "[x,y,z]".
      const COLS_PER_ROW = 8;
      const valueClauses: string[] = [];
      const params: unknown[] = [];

      for (const point of points) {
        const base = params.length;
        valueClauses.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}::vector)`,
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
          // pgvector requires a bracketed JSON-array string, not a PG array.
          `[${point.vector.join(",")}]`,
        );
      }

      // Unused variable guard: COLS_PER_ROW is used to document the expected
      // number of params per row. Suppress the lint warning with a void.
      void COLS_PER_ROW;

      const sql = `
        INSERT INTO ${tableName}
          (point_id, memory_record_id, organization_id, scope_type, scope_id, project_key, kind, embedding)
        VALUES ${valueClauses.join(", ")}
        ON CONFLICT (point_id) DO UPDATE SET
          memory_record_id  = EXCLUDED.memory_record_id,
          organization_id   = EXCLUDED.organization_id,
          scope_type        = EXCLUDED.scope_type,
          scope_id          = EXCLUDED.scope_id,
          project_key       = EXCLUDED.project_key,
          kind              = EXCLUDED.kind,
          embedding         = EXCLUDED.embedding
      `;

      await pool.query(sql, params);
    },

    async query(vector: number[], filter: VectorFilter, limit: number): Promise<VectorHit[]> {
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
        score: number;
      };

      const result = await pool.query<Row>(sql, params);

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
        },
      }));
    },

    async delete(ids: string[]): Promise<void> {
      if (ids.length === 0) return;
      await pool.query(`DELETE FROM ${tableName} WHERE point_id = ANY($1)`, [ids]);
    },
  };
}
