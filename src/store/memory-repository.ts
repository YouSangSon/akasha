import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import type { PgPool, PgQueryable } from "../db/connection.js";
import type {
  AddMemoryInput,
  CanonicalMemoryRepository,
  MemoryRepository,
  MemorySource,
  ScopeRef,
  SearchMemoryInput,
  SearchMemoryResult,
} from "../types.js";

type SqliteInsertSourceRow = {
  id: number;
  scope_type: MemorySource["scopeType"];
  scope_id: string;
  source_type: MemorySource["sourceType"];
  external_id: string;
  title: string | null;
  uri: string | null;
  created_at: string;
};

type SqliteInsertMemoryRow = {
  id: number;
  source_id: number;
  scope_type: SearchMemoryResult["scopeType"];
  scope_id: string;
  memory_type: SearchMemoryResult["memoryType"];
  content: string;
  created_at: string;
  updated_at: string;
};

type SqliteSearchRow = SqliteInsertMemoryRow &
  Omit<SqliteInsertSourceRow, "id" | "scope_type" | "scope_id" | "created_at"> & {
    source_id_joined: number;
    source_scope_type: MemorySource["scopeType"];
    source_scope_id: string;
    source_created_at: string;
  };

type PostgresMemoryRow = {
  id: number;
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

export function createMemoryRepository(
  db: Database.Database,
): MemoryRepository;
export function createMemoryRepository(
  pool: PgPool,
): CanonicalMemoryRepository;
export function createMemoryRepository(
  target: Database.Database | PgPool,
): MemoryRepository | CanonicalMemoryRepository {
  if (isPgPool(target)) {
    return createPostgresMemoryRepository(target);
  }

  return createSqliteMemoryRepository(target);
}

function createSqliteMemoryRepository(
  db: Database.Database,
): MemoryRepository {
  const upsertSource = db.prepare(
    `
      INSERT INTO sources (
        scope_type,
        scope_id,
        source_type,
        external_id,
        title,
        uri
      ) VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        ?
      )
      ON CONFLICT(scope_type, scope_id, source_type, external_id)
      DO UPDATE SET
        title = COALESCE(excluded.title, sources.title),
        uri = COALESCE(excluded.uri, sources.uri)
      RETURNING
        id,
        scope_type,
        scope_id,
        source_type,
        external_id,
        title,
        uri,
        created_at
    `,
  );

  const insertMemory = db.prepare(
    `
      INSERT INTO memory_records (
        source_id,
        scope_type,
        scope_id,
        memory_type,
        content
      ) VALUES (
        ?,
        ?,
        ?,
        ?,
        ?
      )
      RETURNING
        id,
        source_id,
        scope_type,
        scope_id,
        memory_type,
        content,
        created_at,
        updated_at
    `,
  );

  const addMemoryTx = db.transaction((input: AddMemoryInput) => {
    const sourceRow = upsertSource.get(
      input.source.scopeType,
      input.source.scopeId,
      input.source.sourceType,
      requireSourceKey(input.source),
      input.source.title ?? null,
      input.source.uri ?? null,
    ) as SqliteInsertSourceRow;

    const memoryRow = insertMemory.get(
      sourceRow.id,
      input.scopeType,
      input.scopeId,
      input.memoryType,
      input.content,
    ) as SqliteInsertMemoryRow;

    return mapSqliteSearchResult({
      ...memoryRow,
      source_id_joined: sourceRow.id,
      source_scope_type: sourceRow.scope_type,
      source_scope_id: sourceRow.scope_id,
      external_id: sourceRow.external_id,
      source_created_at: sourceRow.created_at,
      source_type: sourceRow.source_type,
      title: sourceRow.title,
      uri: sourceRow.uri,
    });
  });

  return {
    addMemory(input) {
      return addMemoryTx(input);
    },

    searchMemory(input) {
      if (input.scopes.length === 0) {
        return [];
      }

      const limit = Math.max(1, Math.min(input.limit ?? 10, 100));
      const scopeClauses = input.scopes
        .map(
          (_, index) =>
            `(mr.scope_type = @scope_type_${index} AND mr.scope_id = @scope_id_${index})`,
        )
        .join(" OR ");

      const searchSql = `
        SELECT
          mr.id,
          mr.source_id,
          mr.scope_type,
          mr.scope_id,
          mr.memory_type,
          mr.content,
          mr.created_at,
          mr.updated_at,
          s.id AS source_id_joined,
          s.scope_type AS source_scope_type,
          s.scope_id AS source_scope_id,
          s.source_type,
          s.external_id,
          s.title,
          s.uri,
          s.created_at AS source_created_at
        FROM memory_records_fts fts
        JOIN memory_records mr ON mr.id = fts.rowid
        JOIN sources s ON s.id = mr.source_id
        WHERE memory_records_fts MATCH @query
          AND (${scopeClauses})
        ORDER BY bm25(memory_records_fts), mr.id DESC
        LIMIT @limit
      `;

      const params = input.scopes.reduce<Record<string, string | number>>(
        (acc, scope, index) => {
          acc[`scope_type_${index}`] = scope.scopeType;
          acc[`scope_id_${index}`] = scope.scopeId;
          return acc;
        },
        { query: input.query, limit },
      );

      return db
        .prepare(searchSql)
        .all(params)
        .map((row) => mapSqliteSearchResult(row as SqliteSearchRow));
    },

    listMemory(scope) {
      const listSql = `
        SELECT
          mr.id,
          mr.source_id,
          mr.scope_type,
          mr.scope_id,
          mr.memory_type,
          mr.content,
          mr.created_at,
          mr.updated_at,
          s.id AS source_id_joined,
          s.scope_type AS source_scope_type,
          s.scope_id AS source_scope_id,
          s.source_type,
          s.external_id,
          s.title,
          s.uri,
          s.created_at AS source_created_at
        FROM memory_records mr
        JOIN sources s ON s.id = mr.source_id
        WHERE mr.scope_type = ? AND mr.scope_id = ?
        ORDER BY mr.id DESC
      `;

      return db
        .prepare(listSql)
        .all(scope.scopeType, scope.scopeId)
        .map((row) => mapSqliteSearchResult(row as SqliteSearchRow));
    },

    getMemoryRecordsByIds(ids) {
      if (ids.length === 0) {
        return [];
      }

      const placeholders = ids.map(() => "?").join(", ");
      const rows = db
        .prepare(
          `
            SELECT
              mr.id,
              mr.source_id,
              mr.scope_type,
              mr.scope_id,
              mr.memory_type,
              mr.content,
              mr.created_at,
              mr.updated_at,
              s.id AS source_id_joined,
              s.scope_type AS source_scope_type,
              s.scope_id AS source_scope_id,
              s.source_type,
              s.external_id,
              s.title,
              s.uri,
              s.created_at AS source_created_at
            FROM memory_records mr
            JOIN sources s ON s.id = mr.source_id
            WHERE mr.id IN (${placeholders})
          `,
        )
        .all(...ids)
        .map((row) => mapSqliteSearchResult(row as SqliteSearchRow));

      return orderRecordsByIds(rows, ids);
    },
  };
}

function createPostgresMemoryRepository(
  pool: PgPool,
): CanonicalMemoryRepository {
  return {
    async addMemory(input) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const sourceRow = await upsertPostgresSource(client, input);

        const memoryResult = await client.query<PostgresMemoryRow>(
          `
            INSERT INTO memory_records (
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
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING
              id,
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
      const scopeClauses = input.scopes.map((scope, index) => {
        const scopeTypeIndex = params.push(scope.scopeType);
        const scopeIdIndex = params.push(scope.scopeId);
        return `(mr.scope_type = $${scopeTypeIndex} AND mr.scope_id = $${scopeIdIndex})`;
      });

      const limitIndex = params.push(limit);
      const result = await pool.query<PostgresSearchRow>(
        `
          SELECT
            mr.id,
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
            s.scope_type AS source_scope_type,
            s.scope_id AS source_scope_id,
            s.source_type,
            s.source_ref,
            s.title AS source_title,
            s.captured_at AS source_created_at
          FROM memory_records mr
          JOIN sources s ON s.id = mr.source_id
          WHERE mr.content ILIKE $1
            AND (${scopeClauses.join(" OR ")})
          ORDER BY mr.id DESC
          LIMIT $${limitIndex}
        `,
        params,
      );

      return result.rows.map(mapPostgresSearchResult);
    },

    async listMemory(scope: ScopeRef) {
      const result = await pool.query<PostgresSearchRow>(
        `
          SELECT
            mr.id,
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
            s.scope_type AS source_scope_type,
            s.scope_id AS source_scope_id,
            s.source_type,
            s.source_ref,
            s.title AS source_title,
            s.captured_at AS source_created_at
          FROM memory_records mr
          JOIN sources s ON s.id = mr.source_id
          WHERE mr.scope_type = $1
            AND mr.scope_id = $2
          ORDER BY mr.id DESC
        `,
        [scope.scopeType, scope.scopeId],
      );

      return result.rows.map(mapPostgresSearchResult);
    },

    async getMemoryRecordsByIds(ids) {
      if (ids.length === 0) {
        return [];
      }

      const result = await pool.query<PostgresSearchRow>(
        `
          SELECT
            mr.id,
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
            s.scope_type AS source_scope_type,
            s.scope_id AS source_scope_id,
            s.source_type,
            s.source_ref,
            s.title AS source_title,
            s.captured_at AS source_created_at
          FROM memory_records mr
          JOIN sources s ON s.id = mr.source_id
          WHERE mr.id = ANY($1::int[])
        `,
        [ids],
      );

      return orderRecordsByIds(
        result.rows.map(mapPostgresSearchResult),
        ids,
      );
    },
  };
}

function isPgPool(target: Database.Database | PgPool): target is PgPool {
  return "query" in target;
}

function mapSqliteSearchResult(row: SqliteSearchRow): SearchMemoryResult {
  return {
    id: row.id,
    sourceId: row.source_id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    memoryType: row.memory_type,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: {
      id: row.source_id_joined,
      scopeType: row.source_scope_type,
      scopeId: row.source_scope_id,
      sourceType: row.source_type,
      externalId: row.external_id,
      sourceRef: row.external_id,
      title: row.title,
      uri: row.uri,
      createdAt: row.source_created_at,
    },
  };
}

function mapPostgresSearchResult(row: PostgresSearchRow): SearchMemoryResult {
  const sourceMetadata = parseStoredPostgresSourceRef(row.source_ref);

  return {
    id: toNumber(row.id),
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
): Promise<PostgresSourceRow> {
  const sourceKey = requireSourceKey(input.source);
  const existingResult = await queryable.query<PostgresSourceRow>(
    `
      SELECT
        id AS source_id_joined,
        scope_type AS source_scope_type,
        scope_id AS source_scope_id,
        source_type,
        source_ref,
        title AS source_title,
        captured_at AS source_created_at
      FROM sources
      WHERE scope_type = $1
        AND scope_id = $2
        AND source_type = $3
      ORDER BY id ASC
    `,
    [input.source.scopeType, input.source.scopeId, input.source.sourceType],
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
        RETURNING
          id AS source_id_joined,
          scope_type AS source_scope_type,
          scope_id AS source_scope_id,
          source_type,
          source_ref,
          title AS source_title,
          captured_at AS source_created_at
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
        scope_type,
        scope_id,
        source_type,
        source_ref,
        title,
        content_hash
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id AS source_id_joined,
        scope_type AS source_scope_type,
        scope_id AS source_scope_id,
        source_type,
        source_ref,
        title AS source_title,
        captured_at AS source_created_at
    `,
    [
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
