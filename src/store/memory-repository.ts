import { createHash } from "node:crypto";
import type { PgPool, PgQueryable } from "../db/connection.js";
import type {
  AddMemoryInput,
  CanonicalMemoryRepository,
  MemorySource,
  SearchMemoryResult,
} from "../types.js";

const DEFAULT_ORG_ID = "default";

type PostgresMemoryRow = {
  id: number;
  organization_id: string;
  scope_type: SearchMemoryResult["scopeType"];
  scope_id: string;
  project_key: string | null;
  kind: SearchMemoryResult["memoryType"];
  title: string | null;
  content: string;
  summary: string | null;
  durability: NonNullable<SearchMemoryResult["durability"]>;
  importance: number;
  source_id: number;
  created_at: string | Date;
  updated_at: string | Date;
};

type PostgresSourceRow = {
  source_id_joined: number;
  source_organization_id: string;
  source_scope_type: MemorySource["scopeType"];
  source_scope_id: string;
  source_type: MemorySource["sourceType"];
  source_ref: string;
  source_title: string | null;
  source_created_at: string | Date;
};

type PostgresSearchRow = PostgresMemoryRow & PostgresSourceRow;

type PostgresStoredSourceMetadata = {
  sourceRef: string;
  uri: string | null;
};

const SOURCE_RETURN_COLUMNS = `
  id AS source_id_joined,
  organization_id AS source_organization_id,
  scope_type AS source_scope_type,
  scope_id AS source_scope_id,
  source_type,
  source_ref,
  title AS source_title,
  captured_at AS source_created_at
`;

const SEARCH_RETURN_COLUMNS = `
  mr.id,
  mr.organization_id,
  mr.scope_type,
  mr.scope_id,
  mr.project_key,
  mr.kind,
  mr.title,
  mr.content,
  mr.summary,
  mr.durability,
  mr.importance,
  mr.source_id,
  mr.created_at,
  mr.updated_at,
  s.id AS source_id_joined,
  s.organization_id AS source_organization_id,
  s.scope_type AS source_scope_type,
  s.scope_id AS source_scope_id,
  s.source_type,
  s.source_ref,
  s.title AS source_title,
  s.captured_at AS source_created_at
`;

export function createMemoryRepository(
  pool: PgPool,
): CanonicalMemoryRepository {
  return {
    async addMemory(input) {
      const organizationId = input.organizationId ?? DEFAULT_ORG_ID;
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const sourceRow = await upsertPostgresSource(
          client,
          input,
          organizationId,
        );

        const memoryResult = await client.query<PostgresMemoryRow>(
          `
            INSERT INTO memory_records (
              organization_id,
              scope_type,
              scope_id,
              project_key,
              kind,
              title,
              content,
              summary,
              durability,
              importance,
              source_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING
              id,
              organization_id,
              scope_type,
              scope_id,
              project_key,
              kind,
              title,
              content,
              summary,
              durability,
              importance,
              source_id,
              created_at,
              updated_at
          `,
          [
            organizationId,
            input.scopeType,
            input.scopeId,
            input.projectKey ?? null,
            input.memoryType,
            input.title ?? null,
            input.content,
            input.summary ?? summarize(input.content),
            input.durability ?? "ephemeral",
            input.importance ?? 0,
            sourceRow.source_id_joined,
          ],
        );

        await client.query("COMMIT");

        return mapPostgresSearchResult({
          ...requireSingleRow(memoryResult.rows[0], "memory"),
          ...sourceRow,
        });
      } catch (error: unknown) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async searchMemory(input) {
      if (input.scopes.length === 0) {
        return [];
      }

      const limit = Math.max(1, Math.min(input.limit ?? 10, 100));
      const params: unknown[] = [`%${input.query}%`];
      const scopeClauses = input.scopes.map((scope) => {
        const scopeTypeIndex = params.push(scope.scopeType);
        const scopeIdIndex = params.push(scope.scopeId);
        return `(mr.scope_type = $${scopeTypeIndex} AND mr.scope_id = $${scopeIdIndex})`;
      });

      let orgClause = "";
      if (input.organizationId !== undefined) {
        const orgIndex = params.push(input.organizationId);
        orgClause = ` AND mr.organization_id = $${orgIndex}`;
      }

      const limitIndex = params.push(limit);
      const result = await pool.query<PostgresSearchRow>(
        `
          SELECT ${SEARCH_RETURN_COLUMNS}
          FROM memory_records mr
          JOIN sources s ON s.id = mr.source_id
          WHERE mr.content ILIKE $1
            AND (${scopeClauses.join(" OR ")})${orgClause}
          ORDER BY mr.id DESC
          LIMIT $${limitIndex}
        `,
        params,
      );

      return result.rows.map(mapPostgresSearchResult);
    },

    async listMemory(scope, options) {
      const limit = clampListLimit(options?.limit);
      const params: unknown[] = [scope.scopeType, scope.scopeId];
      let orgClause = "";
      if (options?.organizationId !== undefined) {
        const orgIndex = params.push(options.organizationId);
        orgClause = ` AND mr.organization_id = $${orgIndex}`;
      }
      const limitIndex = params.push(limit);

      const result = await pool.query<PostgresSearchRow>(
        `
          SELECT ${SEARCH_RETURN_COLUMNS}
          FROM memory_records mr
          JOIN sources s ON s.id = mr.source_id
          WHERE mr.scope_type = $1
            AND mr.scope_id = $2${orgClause}
          ORDER BY mr.id DESC
          LIMIT $${limitIndex}
        `,
        params,
      );

      return result.rows.map(mapPostgresSearchResult);
    },

    async getMemoryRecordsByIds(ids, organizationId) {
      if (ids.length === 0) {
        return [];
      }

      const params: unknown[] = [ids];
      let orgClause = "";
      if (organizationId !== undefined) {
        const orgIndex = params.push(organizationId);
        orgClause = ` AND mr.organization_id = $${orgIndex}`;
      }

      const result = await pool.query<PostgresSearchRow>(
        `
          SELECT ${SEARCH_RETURN_COLUMNS}
          FROM memory_records mr
          JOIN sources s ON s.id = mr.source_id
          WHERE mr.id = ANY($1::int[])${orgClause}
        `,
        params,
      );

      return orderRecordsByIds(result.rows.map(mapPostgresSearchResult), ids);
    },

    async deleteMemoryRecord(id) {
      // Single-statement rollback. ON DELETE CASCADE on memory_chunks,
      // ingest_jobs, and relationships (defined in migrations/001_initial.sql)
      // removes every dependent row in the same transaction Postgres uses
      // for this DELETE — no explicit child-table cleanup required.
      await pool.query(
        `DELETE FROM memory_records WHERE id = $1`,
        [id],
      );
    },
  };
}

function mapPostgresSearchResult(row: PostgresSearchRow): SearchMemoryResult {
  const sourceMetadata = parseStoredPostgresSourceRef(row.source_ref);

  return {
    id: toNumber(row.id),
    organizationId: row.organization_id,
    sourceId: toNumber(row.source_id),
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    projectKey: row.project_key,
    memoryType: row.kind,
    title: row.title,
    content: row.content,
    summary: row.summary,
    durability: row.durability,
    importance: row.importance,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    source: {
      id: toNumber(row.source_id_joined),
      organizationId: row.source_organization_id,
      scopeType: row.source_scope_type,
      scopeId: row.source_scope_id,
      sourceType: row.source_type,
      externalId: sourceMetadata.sourceRef,
      sourceRef: sourceMetadata.sourceRef,
      title: row.source_title,
      uri: sourceMetadata.uri,
      createdAt: toIsoString(row.source_created_at),
    },
  };
}

function requireSourceKey(input: AddMemoryInput["source"]): string {
  const sourceKey = input.sourceRef ?? input.externalId;

  if (!sourceKey) {
    throw new Error(
      "Memory source provenance is required: provide sourceRef or externalId",
    );
  }

  return sourceKey;
}

function summarize(content: string): string {
  return content.length <= 180 ? content : `${content.slice(0, 177)}...`;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function requireSingleRow<TRow>(row: TRow | undefined, label: string): TRow {
  if (!row) {
    throw new Error(`Expected ${label} row to be returned`);
  }

  return row;
}

function orderRecordsByIds(
  records: SearchMemoryResult[],
  ids: number[],
): SearchMemoryResult[] {
  const recordsById = new Map(records.map((record) => [record.id, record]));

  return ids.flatMap((id) => {
    const record = recordsById.get(id);
    return record ? [record] : [];
  });
}

async function upsertPostgresSource(
  queryable: PgQueryable,
  input: AddMemoryInput,
  organizationId: string,
): Promise<PostgresSourceRow> {
  const sourceKey = requireSourceKey(input.source);
  const existingResult = await queryable.query<PostgresSourceRow>(
    `
      SELECT ${SOURCE_RETURN_COLUMNS}
      FROM sources
      WHERE organization_id = $1
        AND scope_type = $2
        AND scope_id = $3
        AND source_type = $4
      ORDER BY id ASC
    `,
    [
      organizationId,
      input.source.scopeType,
      input.source.scopeId,
      input.source.sourceType,
    ],
  );

  const existingRow = existingResult.rows.find((row) => {
    const metadata = parseStoredPostgresSourceRef(row.source_ref);
    return metadata.sourceRef === sourceKey;
  });

  const nextSourceRef = serializeStoredPostgresSourceRef({
    sourceRef: sourceKey,
    uri:
      input.source.uri
      ?? (existingRow
        ? parseStoredPostgresSourceRef(existingRow.source_ref).uri
        : null),
  });

  if (existingRow) {
    const updatedResult = await queryable.query<PostgresSourceRow>(
      `
        UPDATE sources
        SET title = COALESCE($2, title),
            source_ref = $3
        WHERE id = $1
        RETURNING ${SOURCE_RETURN_COLUMNS}
      `,
      [
        existingRow.source_id_joined,
        input.source.title ?? null,
        nextSourceRef,
      ],
    );

    return requireSingleRow(updatedResult.rows[0], "source");
  }

  const createdResult = await queryable.query<PostgresSourceRow>(
    `
      INSERT INTO sources (
        organization_id,
        scope_type,
        scope_id,
        source_type,
        source_ref,
        title,
        content_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING ${SOURCE_RETURN_COLUMNS}
    `,
    [
      organizationId,
      input.source.scopeType,
      input.source.scopeId,
      input.source.sourceType,
      nextSourceRef,
      input.source.title ?? null,
      createHash("sha256").update(input.content).digest("hex"),
    ],
  );

  return requireSingleRow(createdResult.rows[0], "source");
}

function serializeStoredPostgresSourceRef(
  metadata: PostgresStoredSourceMetadata,
): string {
  return JSON.stringify(metadata);
}

function parseStoredPostgresSourceRef(
  value: string,
): PostgresStoredSourceMetadata {
  try {
    const parsed = JSON.parse(value) as Partial<PostgresStoredSourceMetadata>;

    if (typeof parsed.sourceRef === "string") {
      return {
        sourceRef: parsed.sourceRef,
        uri: typeof parsed.uri === "string" ? parsed.uri : null,
      };
    }
  } catch {}

  return {
    sourceRef: value,
    uri: null,
  };
}

const DEFAULT_LIST_LIMIT = 1000;
const MAX_LIST_LIMIT = 5000;

function clampListLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_LIST_LIMIT;
  }

  return Math.min(Math.floor(value), MAX_LIST_LIMIT);
}
