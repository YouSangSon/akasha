import type { TextChunk } from "../chunk/chunk-text.js";
import { chunkForEmbedding } from "../chunk/chunk-for-embedding.js";
import type { EmbeddingProvider } from "../embedding/embedding-provider.js";
import type { MemoryWriteCoordinator } from "./memory-write-coordinator.js";
import type { PgPool, PgQueryable } from "../db/connection.js";
import { requireSingleRow, toIsoString, toNumber } from "./db-utils.js";
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
  IngestJob,
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
  embeddingProvider?: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
};

type PendingIngestJobRef = {
  id: number;
  qdrantAttempts: number;
};

type StoredMemoryChunkRow = {
  id: number | string;
  memory_record_id: number | string;
  chunk_index: number | string;
  content: string;
  start_offset: number | string;
  end_offset: number | string;
  embedding_version: string;
  embedding_provider?: string;
  embedding_model?: string;
  embedding_dimensions?: number | string;
};

type ReindexableMemoryChunkRow = StoredMemoryChunkRow & {
  organization_id: string;
  scope_type: unknown;
  scope_id: string;
  project_key: string | null;
  durability: unknown;
  kind: unknown;
  title: string | null;
  summary: string | null;
  tags: string[] | null;
  updated_at: string | Date;
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
    jobId?: number;
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

export type EmbeddingClient = EmbeddingProvider;

export function createMemoryChunkRepository(pool: PgPool): MemoryChunkRepository {
  assertMemoryChunkPool(pool);

  return {
    async insertChunks(input) {
      return insertPostgresChunks(pool, input);
    },

    async updatePointIds(mappings) {
      assertPointIdMappings(mappings);

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
      assertPositiveSafeInteger(recordId, "recordId");
      assertNonBlankText(organizationId, "organizationId");
      const scopedOrganizationId = organizationId.trim();

      await pool.query(
        `
          DELETE FROM memory_chunks
          WHERE memory_record_id = $1
            AND organization_id = $2
        `,
        [recordId, scopedOrganizationId],
      );
    },

    async replaceChunksForRecord(input) {
      assertChunkWriteInput(input);
      const rawOrganizationId = input.record.organizationId ?? "default";
      assertNonBlankText(rawOrganizationId, "organizationId");
      const organizationId = rawOrganizationId.trim();
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
      assertReplaceChunksWithPendingIngestInput(input);
      const rawOrganizationId = input.record.organizationId ?? "default";
      assertNonBlankText(rawOrganizationId, "organizationId");
      const organizationId = rawOrganizationId.trim();
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
        const jobResult = input.jobId !== undefined
          ? await client.query<{ id: number | string; qdrant_attempts: number | string }>(
            `UPDATE ingest_jobs SET status = 'pending', qdrant_status = 'pending',
              qdrant_next_retry_at = $4, updated_at = NOW()
             WHERE id = $1 AND memory_record_id = $2 AND organization_id = $3
               AND qdrant_status = 'pending'
             RETURNING id, qdrant_attempts`,
            [input.jobId, input.record.id, organizationId, input.nextRetryAt],
          )
          : await client.query<{
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
        const row = requireSingleRow(jobResult.rows[0], "ingest job");
        const job = {
          id: toPositiveSafeInteger(row.id, "ingest job id"),
          qdrantAttempts: toNonNegativeSafeInteger(
            row.qdrant_attempts,
            "ingest job qdrant_attempts",
          ),
        };
        await client.query("COMMIT");
        return {
          chunks,
          job,
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
      const scopedOrganizationId = organizationId.trim();
      const scopedRefs = normalizeScopeRefs(scopes, "scopes");
      const listOptions = resolveListChunksOptions(options);

      if (scopedRefs.length === 0) {
        return [];
      }

      // organizationId occupies $1; scope params start at $2.
      const params: unknown[] = [scopedOrganizationId];
      const scopeClauses = scopedRefs.map((scope) => {
        const scopeTypeIndex = params.push(scope.scopeType);
        const scopeIdIndex = params.push(scope.scopeId);
        return `(mr.scope_type = $${scopeTypeIndex} AND mr.scope_id = $${scopeIdIndex})`;
      });
      const cursorClause = listOptions.afterChunkId === undefined
        ? ""
        : `AND mc.id > $${params.push(listOptions.afterChunkId)}`;
      const limitClause = listOptions.limit === undefined
        ? ""
        : `LIMIT $${params.push(listOptions.limit)}`;
      const result = await pool.query<ReindexableMemoryChunkRow>(
        `
          SELECT
            mc.id,
            mc.memory_record_id,
            mc.chunk_index,
            mc.content,
            mc.start_offset,
            mc.end_offset,
            mc.embedding_version,
            mc.embedding_provider, mc.embedding_model, mc.embedding_dimensions,
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

      return result.rows.map(mapReindexableMemoryChunkRow);
    },

    async getChunksByRecordId(recordId) {
      assertPositiveSafeInteger(recordId, "recordId");

      const result = await pool.query<ReindexableMemoryChunkRow>(
        `
          SELECT
            mc.id,
            mc.memory_record_id,
            mc.chunk_index,
            mc.content,
            mc.start_offset,
            mc.end_offset,
            mc.embedding_version,
            mc.embedding_provider, mc.embedding_model, mc.embedding_dimensions,
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

      return result.rows.map(mapReindexableMemoryChunkRow);
    },

    async createContextPackRun(input) {
      assertContextPackRunInput(input);
      const organizationId = input.organizationId.trim();

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
          organizationId,
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
  job?: PendingIngestJobRef;
  reuseUnchangedChunks?: boolean;
  manageFailure?: boolean;
}): Promise<{ chunkCount: number }> {
  const recordOrganizationId = input.record.organizationId ?? "default";
  assertNonBlankText(recordOrganizationId, "organizationId");
  const organizationId = recordOrganizationId.trim();
  let job: PendingIngestJobRef | null = input.job ?? null;

  if (input.record.durability === "archived") {
    if (input.ingestJobs && !job) {
      job = await input.ingestJobs.create({ memoryRecordId: input.record.id, organizationId });
      await input.ingestJobs.markQdrantPending({
        jobId: job.id,
        attempts: job.qdrantAttempts,
        nextRetryAt: new Date(Date.now() + nextRetryDelayMs(job.qdrantAttempts)),
      });
    }
    await input.vectorIndex.deleteByRecordIds([input.record.id], {
      organizationId,
    });
    if (job && input.ingestJobs) {
      await input.ingestJobs.markCompleted(job.id);
      await input.ingestJobs.markQdrantCompleted(job.id);
    }
    return { chunkCount: 0 };
  }

  const chunks = await chunkForEmbedding({
    text: input.record.content,
    targetTokens: input.embedding.targetTokens,
    overlapTokens: input.embedding.overlapTokens,
  }, input.embeddings);
  const embeddings = chunks.length === 0
    ? []
    : await input.embeddings.embedBatch(chunks.map((chunk) => chunk.content));
  if (embeddings.length !== chunks.length) {
    throw new Error(
      `refresh embedBatch returned ${embeddings.length} vectors for ${chunks.length} chunks`,
    );
  }

  try {
    const retryAt = new Date(Date.now() + nextRetryDelayMs(0));
    let storedChunks: StoredMemoryChunk[];
    const existing = input.reuseUnchangedChunks
      ? await input.chunkRepository.getChunksByRecordId(input.record.id)
      : [];
    if (input.reuseUnchangedChunks && sameChunkLayout(existing, chunks, input.embedding)) {
      storedChunks = existing;
      if (input.ingestJobs && !job) {
        job = await input.ingestJobs.create({ memoryRecordId: input.record.id, organizationId });
        await input.ingestJobs.markQdrantPending({
          jobId: job.id,
          attempts: job.qdrantAttempts,
          nextRetryAt: retryAt,
        });
      }
    } else if (input.ingestJobs) {
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
          ...(job ? { jobId: job.id } : {}),
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

    await input.vectorIndex.deleteByRecordIds([input.record.id], {
      organizationId,
    });

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
    }

    if (job) {
      await input.ingestJobs!.markCompleted(job.id);
      await input.ingestJobs!.markQdrantCompleted(job.id);
    }

    return { chunkCount: storedChunks.length };
  } catch (error: unknown) {
    if (job && input.manageFailure !== false) {
      try {
        await input.ingestJobs!.markQdrantPending({
          jobId: job.id,
          attempts: job.qdrantAttempts,
          nextRetryAt: new Date(Date.now() + nextRetryDelayMs(job.qdrantAttempts)),
          error,
        });
      } catch (_err: unknown) {
        // Preserve the original refresh failure; losing the retry marker is a
        // secondary outage and should not mask the vector/chunk error.
      }
    }
    throw error;
  }
}

export type WriteCanonicalMemoryInput = {
  repository: CanonicalMemoryRepository;
  chunkRepository: MemoryChunkRepository;
  ingestJobs: IngestJobRepository;
  embeddings: EmbeddingClient;
  vectorIndex: VectorIndex;
  embedding: ChunkEmbeddingConfig;
  memory: AddMemoryInput;
  writes?: MemoryWriteCoordinator;
};

export async function writeCanonicalMemory(input: WriteCanonicalMemoryInput): Promise<SearchMemoryResult> {
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

  if (input.writes) {
    return input.writes.create(input.memory, (scope, record, job) =>
      indexCreatedMemory({ ...input, ...scope }, record, job));
  }

  const record = await input.repository.addMemory(input.memory);
  const organizationId = record.organizationId ?? "default";
  assertNonBlankText(organizationId, "organizationId");

  const job = await input.ingestJobs.create({
    memoryRecordId: record.id,
    organizationId,
  });
  return indexCreatedMemory(input, record, job);
}

async function indexCreatedMemory(
  input: WriteCanonicalMemoryInput,
  record: SearchMemoryResult,
  job: IngestJob,
): Promise<SearchMemoryResult> {
  const organizationId = record.organizationId ?? "default";
  let upsertedPointIds: string[] = [];
  let vectorWriteAttempted = false;

  try {
    const chunks = await chunkForEmbedding({
      text: record.content,
      targetTokens: input.embedding.targetTokens,
      overlapTokens: input.embedding.overlapTokens,
    }, input.embeddings);
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
        organizationId,
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
      vectorWriteAttempted = true;
      await input.vectorIndex.upsert(points);
      upsertedPointIds = points.map((point) => point.id);
      await input.chunkRepository.updatePointIds(
        points.map((point, index) => ({
          chunkId: storedChunks[index]!.id,
          qdrantPointId: point.id,
        })),
      );
    }

    await input.ingestJobs.markCompleted(job.id);
    if (points.length > 0) {
      // Clear the retry intent last so compensation can still be recovered.
      await input.ingestJobs.markQdrantCompleted(job.id);
    }

    return record;
  } catch (error: unknown) {
    if (input.writes && vectorWriteAttempted) {
      try {
        await input.vectorIndex.deleteByRecordIds([record.id], { organizationId });
      } catch {
        // Keep the committed pending intent if partial vector writes cannot be removed.
        throw error;
      }
    }
    // Rollback the partial PG state. Schema-level ON DELETE CASCADE removes
    // memory_chunks, ingest_jobs (including this job row), and relationships
    // in the same statement. If vector points became visible before a later
    // SQL/job step failed, delete those points too. Cleanup is best-effort:
    // if it itself fails, the original error still surfaces to the caller.
    if (!input.writes && upsertedPointIds.length > 0) {
      await input.vectorIndex.delete(upsertedPointIds).catch(() => undefined);
    }
    await input.repository.deleteMemoryRecord(record.id, organizationId).catch(() => undefined);
    throw error;
  }
}

export async function reindexCanonicalMemory(input: {
  repository?: CanonicalMemoryRepository;
  writes?: MemoryWriteCoordinator;
  chunkRepository: MemoryChunkRepository;
  embeddings: EmbeddingClient;
  vectorIndex: VectorIndex;
  organizationId: string;
  scopes: ScopeRef[];
  batchSize?: number;
}): Promise<{ chunkCount: number }> {
  assertNonBlankText(input.organizationId, "organizationId");
  const organizationId = input.organizationId.trim();
  const reindexInput = { ...input, organizationId };

  const batchSize = normalizeReindexBatchSize(input.batchSize);
  if (input.writes) {
    if (!input.repository?.listMemoryRecordIdsForIndexing) {
      throw new Error("canonical reindex requires record-ID pagination");
    }
    const scopes = normalizeScopeRefs(input.scopes, "scopes");
    let afterId: number | undefined;
    let throughId: number | undefined;
    let chunkCount = 0;
    while (true) {
      const page = await input.repository.listMemoryRecordIdsForIndexing(
        organizationId, scopes, { afterId, throughId, limit: batchSize },
      );
      throughId ??= page.throughId;
      if (page.ids.length === 0) break;
      for (const id of page.ids) {
        chunkCount += await input.writes.record(organizationId, [id], async (scope) => {
          const record = await scope.repository.getMemoryRecordById(id, organizationId);
          if (!record || record.id !== id || record.organizationId !== organizationId
            || !scopes.some((ref) => ref.scopeType === record.scopeType && ref.scopeId === record.scopeId)) {
            return 0;
          }
          const result = await refreshCanonicalMemoryIndex({
            ...scope, record, reuseUnchangedChunks: true,
          });
          return result.chunkCount;
        });
      }
      afterId = page.ids[page.ids.length - 1]!;
      if (afterId >= throughId) break;
    }
    return { chunkCount };
  }

  let foundChunks = false;

  await forEachReindexChunkPage(reindexInput, batchSize, async (chunks) => {
    foundChunks = true;
    await input.vectorIndex.deleteByRecordIds(
      [...new Set(chunks.map((chunk) => chunk.memoryRecordId))],
      { organizationId },
    );
  });

  if (!foundChunks) {
    return { chunkCount: 0 };
  }

  // Clear stale vectors for every page before any upsert starts. Deleting after
  // a page has been reinserted is unsafe when one memory record spans pages: a
  // later delete for that same record could erase vectors inserted earlier.
  let chunkCount = 0;
  await forEachReindexChunkPage(reindexInput, batchSize, async (page) => {
    const chunks = page.filter((chunk) => chunk.durability !== "archived");
    if (chunks.length === 0) return;

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

async function insertPostgresChunks(
  queryable: PgQueryable,
  input: {
    record: SearchMemoryResult;
    chunks: TextChunk[];
    embedding: ChunkEmbeddingConfig;
  },
): Promise<StoredMemoryChunk[]> {
  assertQueryable(queryable, "memory chunk queryable");
  assertChunkWriteInput(input);
  const orgId = input.record.organizationId ?? "default";
  assertNonBlankText(orgId, "organizationId");
  const organizationId = orgId.trim();

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
      organizationId,
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

  const result = await queryable.query<StoredMemoryChunkRow>(
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
        embedding_version,
        embedding_provider,
        embedding_model,
        embedding_dimensions
    `,
    params,
  );

  // RETURNING row order is not guaranteed to match VALUES order across all
  // PG versions. Build a keyed map by chunk_index and reassemble in input
  // order to guarantee the returned array matches input.chunks order.
  const byChunkIndex = new Map<number, (typeof result.rows)[number]>();
  for (const row of result.rows) {
    byChunkIndex.set(
      toNonNegativeSafeInteger(row.chunk_index, "memory chunk chunk_index"),
      row,
    );
  }

  return input.chunks.map((chunk) => {
    const row = requireSingleRow(
      byChunkIndex.get(chunk.chunkIndex),
      "memory chunk",
    );
    return mapStoredMemoryChunkRow(row);
  });
}

function mapStoredMemoryChunkRow(row: StoredMemoryChunkRow): StoredMemoryChunk {
  const startOffset = toNonNegativeSafeInteger(
    row.start_offset,
    "memory chunk start_offset",
  );
  const endOffset = toNonNegativeSafeInteger(
    row.end_offset,
    "memory chunk end_offset",
  );
  if (endOffset < startOffset) {
    throw new Error(
      "memory chunk end_offset must be greater than or equal to start_offset",
    );
  }

  return {
    id: toPositiveSafeInteger(row.id, "memory chunk id"),
    memoryRecordId: toPositiveSafeInteger(
      row.memory_record_id,
      "memory chunk memory_record_id",
    ),
    chunkIndex: toNonNegativeSafeInteger(
      row.chunk_index,
      "memory chunk chunk_index",
    ),
    content: mapRequiredText(row.content, "memory chunk content"),
    startOffset,
    endOffset,
    embeddingVersion: mapRequiredText(
      row.embedding_version,
      "memory chunk embedding_version",
    ).trim(),
    ...(row.embedding_provider === undefined ? {} : { embeddingProvider: mapRequiredText(row.embedding_provider, "memory chunk embedding_provider") }),
    ...(row.embedding_model === undefined ? {} : { embeddingModel: mapRequiredText(row.embedding_model, "memory chunk embedding_model") }),
    ...(row.embedding_dimensions === undefined ? {} : { embeddingDimensions: toPositiveSafeInteger(row.embedding_dimensions, "memory chunk embedding_dimensions") }),
  };
}

function sameChunkLayout(stored: StoredMemoryChunk[], desired: TextChunk[], embedding: ChunkEmbeddingConfig): boolean {
  return stored.length === desired.length && stored.every((chunk, index) => {
    const next = desired[index]!;
    return chunk.chunkIndex === next.chunkIndex && chunk.content === next.content
      && chunk.startOffset === next.startOffset && chunk.endOffset === next.endOffset
      && chunk.embeddingProvider === embedding.provider && chunk.embeddingModel === embedding.model
      && chunk.embeddingDimensions === embedding.dimensions && chunk.embeddingVersion === embedding.version;
  });
}

function mapReindexableMemoryChunkRow(
  row: ReindexableMemoryChunkRow,
): ReindexableMemoryChunk {
  return {
    ...mapStoredMemoryChunkRow(row),
    organizationId: mapRequiredText(
      row.organization_id,
      "memory chunk organization_id",
    ).trim(),
    scopeType: mapScopeType(row.scope_type),
    scopeId: mapRequiredText(row.scope_id, "memory chunk scope_id").trim(),
    projectKey: mapNullableText(row.project_key, "memory chunk project_key"),
    durability: mapDurability(row.durability),
    kind: mapMemoryKind(row.kind),
    title: mapNullableText(row.title, "memory chunk title"),
    summary: mapNullableText(row.summary, "memory chunk summary"),
    tags: mapNonBlankStringArray(row.tags, "memory chunk tags"),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toNonNegativeSafeInteger(value: unknown, fieldName: string): number {
  const numberValue = toNumber(value);
  assertNonNegativeSafeInteger(numberValue, fieldName);
  return numberValue;
}

function toPositiveSafeInteger(value: unknown, fieldName: string): number {
  const numberValue = toNumber(value);
  assertPositiveSafeInteger(numberValue, fieldName);
  return numberValue;
}

function mapRequiredText(value: unknown, fieldName: string): string {
  assertNonBlankText(value, fieldName);
  return value;
}

function mapNullableText(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? normalized : null;
  }
  throw new Error(`${fieldName} must be a string or null`);
}

function mapNonBlankStringArray(value: unknown, fieldName: string): string[] {
  assertStringArray(value, fieldName);
  return value.map((item) => item.trim());
}

function mapScopeType(value: unknown): SearchMemoryResult["scopeType"] {
  if (value === "user" || value === "project") {
    return value;
  }
  throw new Error("memory chunk scope_type must be one of: user, project");
}

function mapDurability(value: unknown): string {
  if (value === "ephemeral" || value === "durable" || value === "archived") {
    return value;
  }
  throw new Error(
    "memory chunk durability must be one of: ephemeral, durable, archived",
  );
}

function mapMemoryKind(value: unknown): string {
  if (value === "decision" || value === "fact" || value === "summary") {
    return value;
  }
  throw new Error("memory chunk kind must be one of: decision, summary, fact");
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

function assertMemoryChunkPool(value: unknown): asserts value is PgPool {
  const candidate = assertObject(value, "memory chunk pool");
  assertFunction(candidate.query, "memory chunk pool.query");
  assertFunction(candidate.connect, "memory chunk pool.connect");
}

function assertQueryable(
  value: unknown,
  fieldName: string,
): asserts value is PgQueryable {
  const candidate = assertObject(value, fieldName);
  assertFunction(candidate.query, `${fieldName}.query`);
}

function assertChunkWriteInput(value: unknown): asserts value is {
  record: SearchMemoryResult;
  chunks: TextChunk[];
  embedding: ChunkEmbeddingConfig;
} {
  const candidate = assertObject(value, "chunk write input");
  assertChunkRecord(candidate.record);
  assertTextChunks(candidate.chunks, "chunks");
  assertChunkEmbeddingConfig(candidate.embedding);
}

function assertReplaceChunksWithPendingIngestInput(
  value: unknown,
): asserts value is {
  record: SearchMemoryResult;
  chunks: TextChunk[];
  embedding: ChunkEmbeddingConfig;
  nextRetryAt: Date;
  jobId?: number;
} {
  const candidate = assertObject(value, "chunk replacement input");
  assertValidDate(candidate.nextRetryAt, "nextRetryAt");
  if (candidate.jobId !== undefined) {
    assertPositiveSafeInteger(candidate.jobId, "jobId");
  }
  assertChunkWriteInput(candidate);
}

function assertChunkRecord(value: unknown): asserts value is SearchMemoryResult {
  const candidate = assertObject(value, "chunk record");
  assertPositiveSafeInteger(candidate.id, "record.id");
  if (candidate.organizationId !== undefined) {
    assertNonBlankText(candidate.organizationId, "organizationId");
  }
}

function assertTextChunks(value: unknown, fieldName: string): asserts value is TextChunk[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  for (const [index, chunk] of value.entries()) {
    const candidate = assertObject(chunk, `${fieldName}[${index}]`);
    assertNonNegativeSafeInteger(
      candidate.chunkIndex,
      `${fieldName}[${index}].chunkIndex`,
    );
    assertNonBlankText(candidate.content, `${fieldName}[${index}].content`);
    assertNonNegativeSafeInteger(
      candidate.startOffset,
      `${fieldName}[${index}].startOffset`,
    );
    assertNonNegativeSafeInteger(
      candidate.endOffset,
      `${fieldName}[${index}].endOffset`,
    );
    if (
      typeof candidate.startOffset === "number"
      && typeof candidate.endOffset === "number"
      && candidate.endOffset < candidate.startOffset
    ) {
      throw new Error(
        `${fieldName}[${index}].endOffset must be greater than or equal to startOffset`,
      );
    }
  }
}

function assertChunkEmbeddingConfig(
  value: unknown,
): asserts value is ChunkEmbeddingConfig {
  const candidate = assertObject(value, "chunk embedding config");
  assertNonBlankText(candidate.provider, "embedding.provider");
  assertNonBlankText(candidate.model, "embedding.model");
  assertPositiveSafeInteger(candidate.dimensions, "embedding.dimensions");
  assertNonBlankText(candidate.version, "embedding.version");
  assertPositiveSafeInteger(candidate.targetTokens, "embedding.targetTokens");
  assertNonNegativeSafeInteger(
    candidate.overlapTokens,
    "embedding.overlapTokens",
  );
}

function assertPointIdMappings(
  value: unknown,
): asserts value is Array<{ chunkId: number; qdrantPointId: string }> {
  if (!Array.isArray(value)) {
    throw new Error("point ID mappings must be an array");
  }

  for (const [index, mapping] of value.entries()) {
    const candidate = assertObject(mapping, `point ID mappings[${index}]`);
    assertPositiveSafeInteger(
      candidate.chunkId,
      `point ID mappings[${index}].chunkId`,
    );
    assertNonBlankText(
      candidate.qdrantPointId,
      `point ID mappings[${index}].qdrantPointId`,
    );
  }
}

function normalizeScopeRefs(value: unknown, fieldName: string): ScopeRef[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  return value.map((scope, index) => {
    const candidate = assertObject(scope, `${fieldName}[${index}]`);
    assertScopeType(candidate.scopeType, `${fieldName}[${index}].scopeType`);
    assertNonBlankText(candidate.scopeId, `${fieldName}[${index}].scopeId`);
    return {
      scopeType: candidate.scopeType,
      scopeId: candidate.scopeId.trim(),
    };
  });
}

function resolveListChunksOptions(
  options: ListChunksOptions | undefined,
): ListChunksOptions {
  if (options === undefined) {
    return {};
  }

  const candidate = assertObject(options, "list chunks options");
  if (candidate.afterChunkId !== undefined) {
    assertPositiveSafeInteger(candidate.afterChunkId, "afterChunkId");
  }
  if (candidate.limit !== undefined) {
    assertPositiveSafeInteger(candidate.limit, "limit");
  }

  return {
    afterChunkId: candidate.afterChunkId as number | undefined,
    limit: candidate.limit as number | undefined,
  };
}

function assertContextPackRunInput(value: unknown): asserts value is {
  organizationId: string;
  projectKey: string;
  task: string;
  selectedMemoryIds: string[];
  packMarkdown: string;
} {
  const candidate = assertObject(value, "context pack run input");
  assertNonBlankText(candidate.organizationId, "organizationId");
  assertNonBlankText(candidate.projectKey, "projectKey");
  assertNonBlankText(candidate.task, "task");
  assertStringArray(candidate.selectedMemoryIds, "selectedMemoryIds");
  assertNonBlankText(candidate.packMarkdown, "packMarkdown");
}

function assertStringArray(
  value: unknown,
  fieldName: string,
): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  for (const [index, item] of value.entries()) {
    assertNonBlankText(item, `${fieldName}[${index}]`);
  }
}

function assertScopeType(value: unknown, fieldName: string): asserts value is ScopeRef["scopeType"] {
  if (value !== "project" && value !== "user") {
    throw new Error(`${fieldName} must be "project" or "user"`);
  }
}

function assertValidDate(value: unknown, fieldName: string): asserts value is Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${fieldName} must be a valid Date`);
  }
}

function assertPositiveSafeInteger(
  value: unknown,
  fieldName: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${fieldName} must be a positive safe integer`);
  }
}

function assertNonNegativeSafeInteger(
  value: unknown,
  fieldName: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative safe integer`);
  }
}

function assertObject(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertFunction(value: unknown, fieldName: string): void {
  if (typeof value !== "function") {
    throw new Error(`${fieldName} must be a function`);
  }
}
