import { chunkText, type TextChunk } from "../chunk/chunk-text.js";
import type { PgPool, PgQueryable } from "../db/connection.js";
import {
  assertNonBlankMemoryContent,
  assertNonBlankText,
} from "./memory-content.js";
import { scanForSecrets, SecretDetectedError } from "./secret-scrub.js";
import type { VectorIndex, VectorPoint } from "../vector/vector-index.js";
import { buildVectorPoint } from "../vector/point-builder.js";
import { nextRetryDelayMs } from "../jobs/retry-backoff.js";
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

type PendingIngestJobRef = {
  id: number;
  qdrantAttempts: number;
};

export type ReindexableMemoryChunk = StoredMemoryChunk & {
  organizationId: string;
  scopeType: SearchMemoryResult["scopeType"];
  scopeId: string;
  projectKey: string | null;
  durability: string;
  kind: string;
  title?: string | null;
  summary?: string | null;
  tags?: string[];
  updatedAt: string;
};

export type ListChunksOptions = {
  afterChunkId?: number;
  limit?: number;
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
  deleteChunksForRecord(recordId: number, organizationId: string): Promise<void>;
  replaceChunksForRecord?(input: {
    record: SearchMemoryResult;
    chunks: TextChunk[];
    embedding: ChunkEmbeddingConfig;
  }): Promise<StoredMemoryChunk[]>;
  replaceChunksForRecordWithPendingIngest?(input: {
    record: SearchMemoryResult;
    chunks: TextChunk[];
    embedding: ChunkEmbeddingConfig;
    nextRetryAt: Date;
  }): Promise<{ chunks: StoredMemoryChunk[]; job: PendingIngestJobRef }>;
  listChunks(
    organizationId: string,
    scopes: ScopeRef[],
    options?: ListChunksOptions,
  ): Promise<ReindexableMemoryChunk[]>;
  // Fetch all chunks for a single memory record including the record-level
  // metadata needed to rebuild vector points. Used by the ingest sweeper to
  // re-index a specific record's chunks without scanning by scope.
  getChunksByRecordId(recordId: number): Promise<ReindexableMemoryChunk[]>;
  createContextPackRun(input: {
    organizationId: string;
    projectKey: string;
    task: string;
    selectedMemoryIds: string[];
    packMarkdown: string;
  }): Promise<void>;
};

export type EmbeddingClient = {
  embed(inputText: string): Promise<number[]>;
  embedBatch(inputs: string[]): Promise<number[][]>;
};

export function createMemoryChunkRepository(pool: PgPool): MemoryChunkRepository {
  return {
    async insertChunks(input) {
      return insertPostgresChunks(pool, input);
    },

    async updatePointIds(mappings) {
      if (mappings.length === 0) {
        return;
      }

      // Build a single UPDATE...FROM VALUES so all mappings are applied in one
      // round-trip. Types must be cast explicitly: id is bigint, pid is text.
      const params: unknown[] = [];
      const valueClauses: string[] = [];

      for (const mapping of mappings) {
        const base = params.length;
        params.push(mapping.chunkId, mapping.qdrantPointId);
        valueClauses.push(`($${base + 1}::bigint,$${base + 2}::text)`);
      }

      await pool.query(
        `
          UPDATE memory_chunks AS m
          SET qdrant_point_id = v.pid
          FROM (VALUES ${valueClauses.join(",")}) AS v(id, pid)
          WHERE m.id = v.id
        `,
        params,
      );
    },

    async deleteChunksForRecord(recordId, organizationId) {
      assertNonBlankText(organizationId, "organizationId");

      await pool.query(
        `
          DELETE FROM memory_chunks
          WHERE memory_record_id = $1
            AND organization_id = $2
        `,
        [recordId, organizationId],
      );
    },

    async replaceChunksForRecord(input) {
      const organizationId = input.record.organizationId ?? "default";
      assertNonBlankText(organizationId, "organizationId");
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        await client.query(
          `
            DELETE FROM memory_chunks
            WHERE memory_record_id = $1
              AND organization_id = $2
          `,
          [input.record.id, organizationId],
        );
        const chunks = await insertPostgresChunks(client, input);
        await client.query("COMMIT");
        return chunks;
      } catch (error: unknown) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async replaceChunksForRecordWithPendingIngest(input) {
      const organizationId = input.record.organizationId ?? "default";
      assertNonBlankText(organizationId, "organizationId");
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        await client.query(
          `
            DELETE FROM memory_chunks
            WHERE memory_record_id = $1
              AND organization_id = $2
          `,
          [input.record.id, organizationId],
        );
        const chunks = await insertPostgresChunks(client, input);
        const jobResult = await client.query<{
          id: number | string;
          qdrant_attempts: number | string;
        }>(
          `
            INSERT INTO ingest_jobs (
              memory_record_id,
              organization_id,
              status,
              qdrant_status,
              qdrant_attempts,
              qdrant_next_retry_at
            ) VALUES ($1, $2, 'pending', 'pending', 0, $3)
            RETURNING id, qdrant_attempts
          `,
          [input.record.id, organizationId, input.nextRetryAt],
        );
        await client.query("COMMIT");
        const row = requireSingleRow(jobResult.rows[0], "ingest job");
        return {
          chunks,
          job: {
            id: toNumber(row.id),
            qdrantAttempts: toNumber(row.qdrant_attempts),
          },
        };
      } catch (error: unknown) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async listChunks(organizationId, scopes, options) {
      assertNonBlankText(organizationId, "organizationId");

      if (scopes.length === 0) {
        return [];
      }

      // organizationId occupies $1; scope params start at $2.
      const params: unknown[] = [organizationId];
      const scopeClauses = scopes.map((scope) => {
        const scopeTypeIndex = params.push(scope.scopeType);
        const scopeIdIndex = params.push(scope.scopeId);
        return `(mr.scope_type = $${scopeTypeIndex} AND mr.scope_id = $${scopeIdIndex})`;
      });
      const cursorClause = options?.afterChunkId === undefined
        ? ""
        : `AND mc.id > $${params.push(options.afterChunkId)}`;
      const limitClause = options?.limit === undefined
        ? ""
        : `LIMIT $${params.push(options.limit)}`;
      const result = await pool.query<{
        id: number;
        memory_record_id: number;
        chunk_index: number;
        content: string;
        start_offset: number;
        end_offset: number;
        embedding_version: string;
        organization_id: string;
        scope_type: SearchMemoryResult["scopeType"];
        scope_id: string;
        project_key: string | null;
        durability: string;
        kind: string;
        title: string | null;
        summary: string | null;
        tags: string[] | null;
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
            mr.organization_id,
            mr.scope_type,
            mr.scope_id,
            mr.project_key,
            mr.durability,
            mr.kind,
            mr.title,
            mr.summary,
            COALESCE(mt.tags, '{}') AS tags,
            mr.updated_at
          FROM memory_chunks mc
          JOIN memory_records mr ON mr.id = mc.memory_record_id
          LEFT JOIN LATERAL (
            SELECT array_agg(memory_tags.tag ORDER BY memory_tags.tag) AS tags
            FROM memory_tags
            WHERE memory_tags.memory_record_id = mr.id
              AND memory_tags.organization_id = mr.organization_id
          ) mt ON TRUE
          WHERE mr.organization_id = $1 AND (${scopeClauses.join(" OR ")})
          ${cursorClause}
          ORDER BY mc.id ASC
          ${limitClause}
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
        organizationId: row.organization_id,
        scopeType: row.scope_type,
        scopeId: row.scope_id,
        projectKey: row.project_key,
        durability: row.durability,
        kind: row.kind,
        title: row.title,
        summary: row.summary,
        tags: row.tags ?? [],
        updatedAt: toIsoString(row.updated_at),
      }));
    },

    async getChunksByRecordId(recordId) {
      const result = await pool.query<{
        id: number;
        memory_record_id: number;
        chunk_index: number;
        content: string;
        start_offset: number;
        end_offset: number;
        embedding_version: string;
        organization_id: string;
        scope_type: SearchMemoryResult["scopeType"];
        scope_id: string;
        project_key: string | null;
        durability: string;
        kind: string;
        title: string | null;
        summary: string | null;
        tags: string[] | null;
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
            mr.organization_id,
            mr.scope_type,
            mr.scope_id,
            mr.project_key,
            mr.durability,
            mr.kind,
            mr.title,
            mr.summary,
            COALESCE(mt.tags, '{}') AS tags,
            mr.updated_at
          FROM memory_chunks mc
          JOIN memory_records mr ON mr.id = mc.memory_record_id
          LEFT JOIN LATERAL (
            SELECT array_agg(memory_tags.tag ORDER BY memory_tags.tag) AS tags
            FROM memory_tags
            WHERE memory_tags.memory_record_id = mr.id
              AND memory_tags.organization_id = mr.organization_id
          ) mt ON TRUE
          WHERE mc.memory_record_id = $1
          ORDER BY mc.chunk_index ASC
        `,
        [recordId],
      );

      return result.rows.map((row) => ({
        id: toNumber(row.id),
        memoryRecordId: toNumber(row.memory_record_id),
        chunkIndex: row.chunk_index,
        content: row.content,
        startOffset: row.start_offset,
        endOffset: row.end_offset,
        embeddingVersion: row.embedding_version,
        organizationId: row.organization_id,
        scopeType: row.scope_type,
        scopeId: row.scope_id,
        projectKey: row.project_key,
        durability: row.durability,
        kind: row.kind,
        title: row.title,
        summary: row.summary,
        tags: row.tags ?? [],
        updatedAt: toIsoString(row.updated_at),
      }));
    },

    async createContextPackRun(input) {
      assertNonBlankText(input.organizationId, "organizationId");

      await pool.query(
        `
          INSERT INTO context_pack_runs (
            organization_id,
            project_key,
            task,
            selected_memory_ids,
            pack_markdown
          ) VALUES ($1, $2, $3, $4::jsonb, $5)
        `,
        [
          input.organizationId,
          input.projectKey,
          input.task,
          JSON.stringify(input.selectedMemoryIds),
          input.packMarkdown,
        ],
      );
    },
  };
}

export async function refreshCanonicalMemoryIndex(input: {
  chunkRepository: MemoryChunkRepository;
  ingestJobs?: IngestJobRepository;
  embeddings: EmbeddingClient;
  vectorIndex: VectorIndex;
  embedding: ChunkEmbeddingConfig;
  record: SearchMemoryResult;
}): Promise<{ chunkCount: number }> {
  const organizationId = input.record.organizationId ?? "default";
  assertNonBlankText(organizationId, "organizationId");

  const chunks = chunkText({
    text: input.record.content,
    targetTokens: input.embedding.targetTokens,
    overlapTokens: input.embedding.overlapTokens,
  });
  const embeddings = chunks.length === 0
    ? []
    : await input.embeddings.embedBatch(chunks.map((chunk) => chunk.content));
  if (embeddings.length !== chunks.length) {
    throw new Error(
      `refresh embedBatch returned ${embeddings.length} vectors for ${chunks.length} chunks`,
    );
  }

  let job: PendingIngestJobRef | null = null;

  try {
    const retryAt = new Date(Date.now() + nextRetryDelayMs(0));
    let storedChunks: StoredMemoryChunk[];
    if (input.ingestJobs) {
      if (!input.chunkRepository.replaceChunksForRecordWithPendingIngest) {
        throw new Error(
          "refreshCanonicalMemoryIndex requires atomic chunk replacement with pending ingest",
        );
      }
      const replaced =
        await input.chunkRepository.replaceChunksForRecordWithPendingIngest({
          record: input.record,
          chunks,
          embedding: input.embedding,
          nextRetryAt: retryAt,
        });
      job = replaced.job;
      storedChunks = replaced.chunks;
    } else {
      storedChunks = input.chunkRepository.replaceChunksForRecord !== undefined
        ? await input.chunkRepository.replaceChunksForRecord({
          record: input.record,
          chunks,
          embedding: input.embedding,
        })
        : await replaceChunksForRecordFallback(input.chunkRepository, {
          organizationId,
          record: input.record,
          chunks,
          embedding: input.embedding,
        });
    }

    await input.vectorIndex.deleteByRecordIds([input.record.id], {
      organizationId,
    });

    const points: VectorPoint[] = storedChunks.map((chunk, index) =>
      buildVectorPoint({
        chunkId: chunk.id,
        vector: embeddings[index] ?? [],
        memoryRecordId: input.record.id,
        organizationId,
        scopeType: input.record.scopeType,
        scopeId: input.record.scopeId,
        projectKey: input.record.projectKey ?? null,
        kind: input.record.memoryType,
        durability: input.record.durability ?? "ephemeral",
        title: input.record.title ?? null,
        summary: input.record.summary ?? null,
        tags: input.record.tags ?? [],
        updatedAt: input.record.updatedAt,
        embeddingVersion: chunk.embeddingVersion,
      }),
    );

    if (points.length > 0) {
      let upsertedPointIds: string[] = [];
      await input.vectorIndex.upsert(points);
      upsertedPointIds = points.map((point) => point.id);
      try {
        await input.chunkRepository.updatePointIds(
          points.map((point, index) => ({
            chunkId: storedChunks[index]!.id,
            qdrantPointId: point.id,
          })),
        );
      } catch (error: unknown) {
        await input.vectorIndex.delete(upsertedPointIds, { organizationId })
          .catch(() => undefined);
        throw error;
      }
      if (job) {
        await input.ingestJobs!.markQdrantCompleted(job.id);
      }
    }

    if (job) {
      await input.ingestJobs!.markCompleted(job.id);
    }

    return { chunkCount: storedChunks.length };
  } catch (error: unknown) {
    if (job && chunks.length > 0) {
      try {
        await input.ingestJobs!.markQdrantPending({
          jobId: job.id,
          attempts: job.qdrantAttempts,
          nextRetryAt: new Date(Date.now() + nextRetryDelayMs(job.qdrantAttempts)),
          error,
        });
      } catch {
        // Preserve the original refresh failure; losing the retry marker is a
        // secondary outage and should not mask the vector/chunk error.
      }
    }
    throw error;
  }
}

export async function writeCanonicalMemory(input: {
  repository: CanonicalMemoryRepository;
  chunkRepository: MemoryChunkRepository;
  ingestJobs: IngestJobRepository;
  embeddings: EmbeddingClient;
  vectorIndex: VectorIndex;
  embedding: ChunkEmbeddingConfig;
  memory: AddMemoryInput;
}): Promise<SearchMemoryResult> {
  assertNonBlankMemoryContent(input.memory.content);

  // Guard: refuse to persist user-supplied text that looks like a credential.
  // Scans every user-controlled field (content + title + summary) and throws
  // a single SecretDetectedError with the union of categories found, so the
  // operator gets a complete picture in one error rather than a sequence of
  // throws. Throwing here means no record row, no chunk row, no qdrant point,
  // no ingest job. The error carries categories only, never the matched value.
  const detections = [
    ...scanForSecrets(input.memory.content),
    ...(input.memory.title ? scanForSecrets(input.memory.title) : []),
    ...(input.memory.summary ? scanForSecrets(input.memory.summary) : []),
  ];
  if (detections.length > 0) {
    throw new SecretDetectedError(detections.map((d) => d.category));
  }

  const record = await input.repository.addMemory(input.memory);
  const job = await input.ingestJobs.create({
    memoryRecordId: record.id,
    organizationId: record.organizationId ?? "default",
  });
  let upsertedPointIds: string[] = [];

  try {
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

    // Write-ahead: record the intent to index BEFORE touching Qdrant. If the
    // process crashes between here and markQdrantCompleted, the job row is left
    // with qdrant_status='pending' and a scheduled qdrant_next_retry_at so the
    // ingest sweeper can re-index the already-committed chunks automatically.
    // Guard: skip write-ahead when there are no chunks (empty content) — nothing
    // to re-index, and markCompleted below handles the overall job close-out.
    if (storedChunks.length > 0) {
      await input.ingestJobs.markQdrantPending({
        jobId: job.id,
        attempts: 0,
        nextRetryAt: new Date(Date.now() + nextRetryDelayMs(0)),
      });
    }

    const embeddings = await input.embeddings.embedBatch(
      storedChunks.map((chunk) => chunk.content),
    );
    if (embeddings.length !== storedChunks.length) {
      throw new Error(
        `embedBatch returned ${embeddings.length} vectors for ${storedChunks.length} chunks`,
      );
    }
    const points: VectorPoint[] = storedChunks.map((chunk, index) =>
      buildVectorPoint({
        chunkId: chunk.id,
        vector: embeddings[index] ?? [],
        memoryRecordId: record.id,
        organizationId: record.organizationId ?? "default",
        scopeType: record.scopeType,
        scopeId: record.scopeId,
        projectKey: record.projectKey ?? null,
        kind: record.memoryType,
        durability: record.durability ?? "ephemeral",
        title: record.title ?? null,
        summary: record.summary ?? null,
        tags: record.tags ?? [],
        updatedAt: record.updatedAt,
        embeddingVersion: chunk.embeddingVersion,
      }),
    );

    if (points.length > 0) {
      await input.vectorIndex.upsert(points);
      upsertedPointIds = points.map((point) => point.id);
      await input.chunkRepository.updatePointIds(
        points.map((point, index) => ({
          chunkId: storedChunks[index]!.id,
          qdrantPointId: point.id,
        })),
      );
      // Success: clear the retry schedule and mark Qdrant indexing complete.
      await input.ingestJobs.markQdrantCompleted(job.id);
    }

    await input.ingestJobs.markCompleted(job.id);

    return record;
  } catch (error: unknown) {
    // Rollback the partial PG state. Schema-level ON DELETE CASCADE removes
    // memory_chunks, ingest_jobs (including this job row), and relationships
    // in the same statement. If vector points became visible before a later
    // SQL/job step failed, delete those points too. Cleanup is best-effort:
    // if it itself fails, the original error still surfaces to the caller.
    if (upsertedPointIds.length > 0) {
      await input.vectorIndex.delete(upsertedPointIds).catch(() => undefined);
    }
    await input.repository.deleteMemoryRecord(record.id, record.organizationId ?? "default").catch(() => undefined);
    throw error;
  }
}

export async function reindexCanonicalMemory(input: {
  chunkRepository: MemoryChunkRepository;
  embeddings: EmbeddingClient;
  vectorIndex: VectorIndex;
  organizationId: string;
  scopes: ScopeRef[];
  batchSize?: number;
}): Promise<{ chunkCount: number }> {
  const batchSize = normalizeReindexBatchSize(input.batchSize);
  let foundChunks = false;

  await forEachReindexChunkPage(input, batchSize, async (chunks) => {
    foundChunks = true;
    await input.vectorIndex.deleteByRecordIds(
      [...new Set(chunks.map((chunk) => chunk.memoryRecordId))],
      { organizationId: input.organizationId },
    );
  });

  if (!foundChunks) {
    return { chunkCount: 0 };
  }

  // Clear stale vectors for every page before any upsert starts. Deleting after
  // a page has been reinserted is unsafe when one memory record spans pages: a
  // later delete for that same record could erase vectors inserted earlier.
  let chunkCount = 0;
  await forEachReindexChunkPage(input, batchSize, async (chunks) => {
    const embeddings = await input.embeddings.embedBatch(
      chunks.map((chunk) => chunk.content),
    );
    if (embeddings.length !== chunks.length) {
      throw new Error(
        `reindex embedBatch returned ${embeddings.length} vectors for ${chunks.length} chunks`,
      );
    }
    const points: VectorPoint[] = chunks.map((chunk, index) =>
      buildVectorPoint({
        chunkId: chunk.id,
        vector: embeddings[index] ?? [],
        memoryRecordId: chunk.memoryRecordId,
        organizationId: chunk.organizationId,
        scopeType: chunk.scopeType,
        scopeId: chunk.scopeId,
        projectKey: chunk.projectKey,
        kind: chunk.kind,
        durability: chunk.durability,
        title: chunk.title ?? null,
        summary: chunk.summary ?? null,
        tags: chunk.tags ?? [],
        updatedAt: chunk.updatedAt,
        embeddingVersion: chunk.embeddingVersion,
      }),
    );

    await input.vectorIndex.upsert(points);
    await input.chunkRepository.updatePointIds(
      points.map((point, index) => ({
        chunkId: chunks[index]!.id,
        qdrantPointId: point.id,
      })),
    );
    chunkCount += chunks.length;
  });

  return { chunkCount };
}

async function forEachReindexChunkPage(
  input: {
    chunkRepository: MemoryChunkRepository;
    organizationId: string;
    scopes: ScopeRef[];
  },
  batchSize: number,
  onPage: (chunks: ReindexableMemoryChunk[]) => Promise<void> | void,
): Promise<void> {
  let afterChunkId: number | undefined;
  while (true) {
    const chunks = await input.chunkRepository.listChunks(
      input.organizationId,
      input.scopes,
      afterChunkId === undefined
        ? { limit: batchSize }
        : { afterChunkId, limit: batchSize },
    );
    if (chunks.length === 0) {
      return;
    }

    await onPage(chunks);
    afterChunkId = chunks[chunks.length - 1]!.id;
    if (chunks.length < batchSize) {
      return;
    }
  }
}

function normalizeReindexBatchSize(batchSize: number | undefined): number {
  if (batchSize === undefined) {
    return 500;
  }
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("reindex batchSize must be a positive integer");
  }
  return Math.min(batchSize, 5_000);
}

function requireSingleRow<TRow>(row: TRow | undefined, label: string): TRow {
  if (!row) {
    throw new Error(`Expected ${label} row to be returned`);
  }

  return row;
}

async function insertPostgresChunks(
  queryable: PgQueryable,
  input: {
    record: SearchMemoryResult;
    chunks: TextChunk[];
    embedding: ChunkEmbeddingConfig;
  },
): Promise<StoredMemoryChunk[]> {
  const orgId = input.record.organizationId ?? "default";
  assertNonBlankText(orgId, "organizationId");

  if (input.chunks.length === 0) {
    return [];
  }

  // Build a single multi-row INSERT. Each chunk contributes 10 parameters;
  // the 5 embedding config columns are repeated per row (simpler, no CTE).
  // Constant values shared by every row:
  const recordId = input.record.id;
  const { provider, model, dimensions, version } = input.embedding;

  const params: unknown[] = [];
  const valueClauses: string[] = [];

  for (const chunk of input.chunks) {
    const base = params.length; // 0-based index before pushing
    params.push(
      orgId,
      recordId,
      chunk.chunkIndex,
      chunk.content,
      chunk.startOffset,
      chunk.endOffset,
      provider,
      model,
      dimensions,
      version,
    );
    valueClauses.push(
      `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10})`,
    );
  }

  const result = await queryable.query<{
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
        organization_id,
        memory_record_id,
        chunk_index,
        content,
        start_offset,
        end_offset,
        embedding_provider,
        embedding_model,
        embedding_dimensions,
        embedding_version
      ) VALUES ${valueClauses.join(",")}
      RETURNING
        id,
        memory_record_id,
        chunk_index,
        content,
        start_offset,
        end_offset,
        embedding_version
    `,
    params,
  );

  // RETURNING row order is not guaranteed to match VALUES order across all
  // PG versions. Build a keyed map by chunk_index and reassemble in input
  // order to guarantee the returned array matches input.chunks order.
  const byChunkIndex = new Map<number, (typeof result.rows)[number]>();
  for (const row of result.rows) {
    byChunkIndex.set(row.chunk_index, row);
  }

  return input.chunks.map((chunk) => {
    const row = requireSingleRow(
      byChunkIndex.get(chunk.chunkIndex),
      "memory chunk",
    );
    return {
      id: toNumber(row.id),
      memoryRecordId: toNumber(row.memory_record_id),
      chunkIndex: row.chunk_index,
      content: row.content,
      startOffset: row.start_offset,
      endOffset: row.end_offset,
      embeddingVersion: row.embedding_version,
    };
  });
}

async function replaceChunksForRecordFallback(
  chunkRepository: MemoryChunkRepository,
  input: {
    organizationId: string;
    record: SearchMemoryResult;
    chunks: TextChunk[];
    embedding: ChunkEmbeddingConfig;
  },
): Promise<StoredMemoryChunk[]> {
  await chunkRepository.deleteChunksForRecord(input.record.id, input.organizationId);
  return chunkRepository.insertChunks({
    record: input.record,
    chunks: input.chunks,
    embedding: input.embedding,
  });
}

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
