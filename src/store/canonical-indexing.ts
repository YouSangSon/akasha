import { chunkText, type TextChunk } from "../chunk/chunk-text.js";
import { toQdrantPoint } from "../qdrant/point-mapper.js";
import type { PgPool } from "../db/connection.js";
import type {
  AddMemoryInput,
  CanonicalMemoryRepository,
  IngestJobRepository,
  ScopeRef,
  SearchMemoryResult,
} from "../types.js";

export type ChunkEmbeddingConfig = {
  provider: string;
  model: string;
  dimensions: number;
  version: string;
  targetTokens: number;
  overlapTokens: number;
};

export type StoredMemoryChunk = {
  id: number;
  memoryRecordId: number;
  chunkIndex: number;
  content: string;
  startOffset: number;
  endOffset: number;
  embeddingVersion: string;
};

export type ReindexableMemoryChunk = StoredMemoryChunk & {
  scopeType: SearchMemoryResult["scopeType"];
  scopeId: string;
  projectKey: string | null;
  durability: string;
  kind: string;
  updatedAt: string;
};

export type MemoryChunkRepository = {
  insertChunks(input: {
    record: SearchMemoryResult;
    chunks: TextChunk[];
    embedding: ChunkEmbeddingConfig;
  }): Promise<StoredMemoryChunk[]>;
  updatePointIds(
    mappings: Array<{ chunkId: number; qdrantPointId: string }>,
  ): Promise<void>;
  listChunks(scopes: ScopeRef[]): Promise<ReindexableMemoryChunk[]>;
  createContextPackRun(input: {
    projectKey: string;
    task: string;
    selectedMemoryIds: string[];
    packMarkdown: string;
  }): Promise<void>;
};

export type EmbeddingClient = {
  embed(inputText: string): Promise<number[]>;
};

export type QdrantUpsertClient = {
  upsert(
    collectionName: string,
    input: {
      points: Array<ReturnType<typeof toQdrantPoint>>;
    },
  ): Promise<unknown>;
};

export function createMemoryChunkRepository(pool: PgPool): MemoryChunkRepository {
  return {
    async insertChunks(input) {
      const inserted: StoredMemoryChunk[] = [];

      for (const chunk of input.chunks) {
        const result = await pool.query<{
          id: number;
          memory_record_id: number;
          chunk_index: number;
          content: string;
          start_offset: number;
          end_offset: number;
          embedding_version: string;
        }>(
          `
            INSERT INTO memory_chunks (
              memory_record_id,
              chunk_index,
              content,
              start_offset,
              end_offset,
              embedding_provider,
              embedding_model,
              embedding_dimensions,
              embedding_version
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING
              id,
              memory_record_id,
              chunk_index,
              content,
              start_offset,
              end_offset,
              embedding_version
          `,
          [
            input.record.id,
            chunk.chunkIndex,
            chunk.content,
            chunk.startOffset,
            chunk.endOffset,
            input.embedding.provider,
            input.embedding.model,
            input.embedding.dimensions,
            input.embedding.version,
          ],
        );

        const row = requireSingleRow(result.rows[0], "memory chunk");

        inserted.push({
          id: toNumber(row.id),
          memoryRecordId: toNumber(row.memory_record_id),
          chunkIndex: row.chunk_index,
          content: row.content,
          startOffset: row.start_offset,
          endOffset: row.end_offset,
          embeddingVersion: row.embedding_version,
        });
      }

      return inserted;
    },

    async updatePointIds(mappings) {
      for (const mapping of mappings) {
        await pool.query(
          `
            UPDATE memory_chunks
            SET qdrant_point_id = $2
            WHERE id = $1
          `,
          [mapping.chunkId, mapping.qdrantPointId],
        );
      }
    },

    async listChunks(scopes) {
      if (scopes.length === 0) {
        return [];
      }

      const params: unknown[] = [];
      const scopeClauses = scopes.map((scope) => {
        const scopeTypeIndex = params.push(scope.scopeType);
        const scopeIdIndex = params.push(scope.scopeId);
        return `(mr.scope_type = $${scopeTypeIndex} AND mr.scope_id = $${scopeIdIndex})`;
      });
      const result = await pool.query<{
        id: number;
        memory_record_id: number;
        chunk_index: number;
        content: string;
        start_offset: number;
        end_offset: number;
        embedding_version: string;
        scope_type: SearchMemoryResult["scopeType"];
        scope_id: string;
        project_key: string | null;
        durability: string;
        kind: string;
        updated_at: string | Date;
      }>(
        `
          SELECT
            mc.id,
            mc.memory_record_id,
            mc.chunk_index,
            mc.content,
            mc.start_offset,
            mc.end_offset,
            mc.embedding_version,
            mr.scope_type,
            mr.scope_id,
            mr.project_key,
            mr.durability,
            mr.kind,
            mr.updated_at
          FROM memory_chunks mc
          JOIN memory_records mr ON mr.id = mc.memory_record_id
          WHERE ${scopeClauses.join(" OR ")}
          ORDER BY mc.id ASC
        `,
        params,
      );

      return result.rows.map((row) => ({
        id: toNumber(row.id),
        memoryRecordId: toNumber(row.memory_record_id),
        chunkIndex: row.chunk_index,
        content: row.content,
        startOffset: row.start_offset,
        endOffset: row.end_offset,
        embeddingVersion: row.embedding_version,
        scopeType: row.scope_type,
        scopeId: row.scope_id,
        projectKey: row.project_key,
        durability: row.durability,
        kind: row.kind,
        updatedAt: toIsoString(row.updated_at),
      }));
    },

    async createContextPackRun(input) {
      await pool.query(
        `
          INSERT INTO context_pack_runs (
            project_key,
            task,
            selected_memory_ids,
            pack_markdown
          ) VALUES ($1, $2, $3::jsonb, $4)
        `,
        [
          input.projectKey,
          input.task,
          JSON.stringify(input.selectedMemoryIds),
          input.packMarkdown,
        ],
      );
    },
  };
}

export async function writeCanonicalMemory(input: {
  repository: CanonicalMemoryRepository;
  chunkRepository: MemoryChunkRepository;
  ingestJobs: IngestJobRepository;
  embeddings: EmbeddingClient;
  qdrantClient: QdrantUpsertClient;
  collectionName: string;
  embedding: ChunkEmbeddingConfig;
  memory: AddMemoryInput;
}): Promise<SearchMemoryResult> {
  const record = await input.repository.addMemory(input.memory);
  const job = await input.ingestJobs.create({ memoryRecordId: record.id });
  const chunks = chunkText({
    text: record.content,
    targetTokens: input.embedding.targetTokens,
    overlapTokens: input.embedding.overlapTokens,
  });
  const storedChunks = await input.chunkRepository.insertChunks({
    record,
    chunks,
    embedding: input.embedding,
  });
  const embeddings = await Promise.all(
    storedChunks.map((chunk) => input.embeddings.embed(chunk.content)),
  );
  const points = storedChunks.map((chunk, index) =>
    toQdrantPoint({
      chunk: {
        id: chunk.id,
        memoryRecordId: chunk.memoryRecordId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        embeddingVersion: chunk.embeddingVersion,
      },
      record: {
        id: record.id,
        scopeType: record.scopeType,
        scopeId: record.scopeId,
        projectKey: record.projectKey ?? null,
        durability: record.durability ?? "ephemeral",
        kind: record.memoryType,
        tags: [],
        updatedAt: record.updatedAt,
      },
      embedding: embeddings[index] ?? [],
    }),
  );

  if (points.length > 0) {
    await input.qdrantClient.upsert(input.collectionName, { points });
    await input.chunkRepository.updatePointIds(
      points.map((point, index) => ({
        chunkId: storedChunks[index]!.id,
        qdrantPointId: point.id,
      })),
    );
  }

  await input.ingestJobs.markCompleted(job.id);

  return record;
}

export async function reindexCanonicalMemory(input: {
  chunkRepository: MemoryChunkRepository;
  embeddings: EmbeddingClient;
  qdrantClient: QdrantUpsertClient;
  collectionName: string;
  scopes: ScopeRef[];
}): Promise<{ chunkCount: number }> {
  const chunks = await input.chunkRepository.listChunks(input.scopes);
  const embeddings = await Promise.all(
    chunks.map((chunk) => input.embeddings.embed(chunk.content)),
  );
  const points = chunks.map((chunk, index) =>
    toQdrantPoint({
      chunk: {
        id: chunk.id,
        memoryRecordId: chunk.memoryRecordId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        embeddingVersion: chunk.embeddingVersion,
      },
      record: {
        id: chunk.memoryRecordId,
        scopeType: chunk.scopeType,
        scopeId: chunk.scopeId,
        projectKey: chunk.projectKey,
        durability: chunk.durability,
        kind: chunk.kind,
        tags: [],
        updatedAt: chunk.updatedAt,
      },
      embedding: embeddings[index] ?? [],
    }),
  );

  if (points.length > 0) {
    await input.qdrantClient.upsert(input.collectionName, { points });
    await input.chunkRepository.updatePointIds(
      points.map((point, index) => ({
        chunkId: chunks[index]!.id,
        qdrantPointId: point.id,
      })),
    );
  }

  return { chunkCount: chunks.length };
}

function requireSingleRow<TRow>(row: TRow | undefined, label: string): TRow {
  if (!row) {
    throw new Error(`Expected ${label} row to be returned`);
  }

  return row;
}

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
