import type Database from "better-sqlite3";
import type {
  AddMemoryInput,
  MemoryRepository,
  MemorySource,
  SearchMemoryInput,
  SearchMemoryResult,
} from "../types.js";

type InsertSourceRow = {
  id: number;
  scope_type: MemorySource["scopeType"];
  scope_id: string;
  source_type: MemorySource["sourceType"];
  external_id: string;
  title: string | null;
  uri: string | null;
  created_at: string;
};

type InsertMemoryRow = {
  id: number;
  source_id: number;
  scope_type: SearchMemoryResult["scopeType"];
  scope_id: string;
  memory_type: SearchMemoryResult["memoryType"];
  content: string;
  created_at: string;
  updated_at: string;
};

type SearchRow = InsertMemoryRow &
  Omit<InsertSourceRow, "id" | "scope_type" | "scope_id" | "created_at"> & {
    source_id_joined: number;
    source_scope_type: MemorySource["scopeType"];
    source_scope_id: string;
    source_created_at: string;
  };

export function createMemoryRepository(
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
        title = excluded.title,
        uri = excluded.uri
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
      input.source.externalId,
      input.source.title ?? null,
      input.source.uri ?? null,
    ) as InsertSourceRow;

    const memoryRow = insertMemory.get(
      sourceRow.id,
      input.scopeType,
      input.scopeId,
      input.memoryType,
      input.content,
    ) as InsertMemoryRow;

    return mapSearchResult({
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
        .map((row) => mapSearchResult(row as SearchRow));
    },
  };
}

function mapSearchResult(row: SearchRow): SearchMemoryResult {
  return {
    id: row.id,
    sourceId: row.source_id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    memoryType: row.memory_type,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: mapSource(row),
  };
}

function mapSource(row: SearchRow): MemorySource {
  return {
    id: row.source_id_joined,
    scopeType: row.source_scope_type,
    scopeId: row.source_scope_id,
    sourceType: row.source_type,
    externalId: row.external_id,
    title: row.title,
    uri: row.uri,
    createdAt: row.source_created_at,
  };
}
