// Ingest outbox sweeper — re-indexes memory records whose Qdrant upsert was
// left pending (e.g. a process crash between markQdrantPending write-ahead and
// markQdrantCompleted). The sweeper atomically claims due rows, re-embeds their
// chunks, upserts the points to Qdrant, and marks the job completed.
//
// Idempotent: Qdrant's upsert is an overwrite; re-upserting already-present
// points with the same ids is safe. claimPendingForRetry uses a single
// UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED) so concurrent
// replicas cooperate without leader election.
//
// Caller decides cadence (setInterval, cron, or one-shot). Default policy:
// scan up to 100 rows per cycle, give up after 5 attempts so ops can
// investigate persistently-failing records.

import { buildVectorPoint } from "../vector/point-builder.js";
import type { VectorIndex } from "../vector/vector-index.js";
import type { Logger } from "../logger.js";
import type { IngestJobRepository } from "../types.js";
import type {
  EmbeddingClient,
  MemoryChunkRepository,
  ReindexableMemoryChunk,
} from "../store/canonical-indexing.js";
import type { IngestJob } from "../types.js";
import { nextRetryDelayMs } from "../jobs/retry-backoff.js";

export type RunIngestSweepInput = {
  ingestJobs: IngestJobRepository;
  chunkRepository: MemoryChunkRepository;
  embeddings: EmbeddingClient;
  vectorIndex: VectorIndex;
  logger: Logger;
  // Tunables. Defaults follow design doc.
  batchSize?: number;
  maxAttempts?: number;
  // For deterministic tests: override the "now" clock used when computing
  // the next retry timestamp.
  now?: () => Date;
};

export type IngestSweepResult = {
  scanned: number;
  completed: number;
  retried: number;
  failed: number;
};

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_ATTEMPTS = 5;

export async function runIngestSweep(
  input: Readonly<RunIngestSweepInput>,
): Promise<IngestSweepResult> {
  assertRunIngestSweepInput(input);

  const batchSize = input.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const getNow = input.now ?? (() => new Date());
  const now = nowFrom(getNow);

  const claimed = await input.ingestJobs.claimPendingForRetry({
    limit: batchSize,
    now,
  });
  assertClaimedIngestJobs(claimed);

  let completed = 0;
  let retried = 0;
  let failed = 0;

  for (const job of claimed) {
    const outcome = await sweepOne(input, job, maxAttempts, getNow);
    if (outcome === "completed") completed += 1;
    else if (outcome === "retry") retried += 1;
    else failed += 1;
  }

  return { scanned: claimed.length, completed, retried, failed };
}

async function sweepOne(
  input: Readonly<RunIngestSweepInput>,
  job: IngestJob,
  maxAttempts: number,
  getNow: () => Date,
): Promise<"completed" | "retry" | "failed"> {
  try {
    const chunks = await input.chunkRepository.getChunksByRecordId(
      job.memoryRecordId,
    );
    assertReindexableMemoryChunks(chunks);

    if (chunks.length === 0) {
      // No chunks means the record was deleted between claim and now.
      // Mark completed so the job doesn't get stuck.
      await input.ingestJobs.markQdrantCompleted(job.id);
      input.logger.info(
        {
          event: "ingest.sweep_no_chunks",
          jobId: job.id,
          memoryRecordId: job.memoryRecordId,
        },
        "ingest sweep: no chunks for record; marking completed",
      );
      return "completed";
    }

    const embeddings = await input.embeddings.embedBatch(
      chunks.map((chunk) => chunk.content),
    );

    assertEmbeddingBatch(embeddings);
    if (embeddings.length !== chunks.length) {
      throw new Error(
        `embedBatch returned ${embeddings.length} vectors for ${chunks.length} chunks`,
      );
    }

    await input.vectorIndex.deleteByRecordIds([job.memoryRecordId], {
      organizationId: job.organizationId,
    });

    const points = chunks.map((chunk, index) =>
      buildVectorPoint({
        chunkId: chunk.id,
        vector: embeddings[index] ?? [],
        memoryRecordId: chunk.memoryRecordId,
        organizationId: chunk.organizationId ?? "default",
        scopeType: chunk.scopeType,
        scopeId: chunk.scopeId,
        projectKey: chunk.projectKey ?? null,
        kind: chunk.kind,
        durability: chunk.durability ?? "ephemeral",
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

    await input.ingestJobs.markQdrantCompleted(job.id);
    return "completed";
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const nextAttempt = job.qdrantAttempts + 1;
    const giveUp = nextAttempt >= maxAttempts;

    input.logger.warn(
      {
        event: giveUp ? "ingest.sweep_giveup" : "ingest.sweep_retry_failed",
        jobId: job.id,
        memoryRecordId: job.memoryRecordId,
        attempt: nextAttempt,
        err: errorMessage,
      },
      giveUp
        ? "ingest sweep gave up after max attempts; needs ops review"
        : "ingest sweep retry failed; will be picked up next sweep",
    );

    try {
      if (giveUp) {
        await input.ingestJobs.markQdrantFailed({
          jobId: job.id,
          attempts: nextAttempt,
          error: err,
        });
      } else {
        const delayMs = nextRetryDelayMs(nextAttempt);
        const nextRetryAt = new Date(nowFrom(getNow).getTime() + delayMs);
        await input.ingestJobs.markQdrantPending({
          jobId: job.id,
          attempts: nextAttempt,
          nextRetryAt,
          error: err,
        });
      }
    } catch (markErr: unknown) {
      input.logger.error(
        {
          event: "ingest.sweep_mark_failed",
          jobId: job.id,
          err: markErr,
        },
        "failed to update qdrant_status during ingest sweep",
      );
    }

    return giveUp ? "failed" : "retry";
  }
}

function assertRunIngestSweepInput(
  input: unknown,
): asserts input is RunIngestSweepInput {
  const candidate = assertObject(input, "runIngestSweep input");
  const ingestJobs = assertObject(candidate.ingestJobs, "ingestJobs");
  const chunkRepository = assertObject(
    candidate.chunkRepository,
    "chunkRepository",
  );
  const embeddings = assertObject(candidate.embeddings, "embeddings");
  const vectorIndex = assertObject(candidate.vectorIndex, "vectorIndex");
  const logger = assertObject(candidate.logger, "logger");

  assertFunction(
    ingestJobs.claimPendingForRetry,
    "ingestJobs.claimPendingForRetry",
  );
  assertFunction(
    ingestJobs.markQdrantCompleted,
    "ingestJobs.markQdrantCompleted",
  );
  assertFunction(ingestJobs.markQdrantPending, "ingestJobs.markQdrantPending");
  assertFunction(ingestJobs.markQdrantFailed, "ingestJobs.markQdrantFailed");
  assertFunction(
    chunkRepository.getChunksByRecordId,
    "chunkRepository.getChunksByRecordId",
  );
  assertFunction(
    chunkRepository.updatePointIds,
    "chunkRepository.updatePointIds",
  );
  assertFunction(embeddings.embedBatch, "embeddings.embedBatch");
  assertFunction(
    vectorIndex.deleteByRecordIds,
    "vectorIndex.deleteByRecordIds",
  );
  assertFunction(vectorIndex.upsert, "vectorIndex.upsert");
  assertFunction(logger.info, "logger.info");
  assertFunction(logger.warn, "logger.warn");
  assertFunction(logger.error, "logger.error");
  assertOptionalPositiveSafeInteger(candidate.batchSize, "batchSize");
  assertOptionalPositiveSafeInteger(candidate.maxAttempts, "maxAttempts");
  assertOptionalFunction(candidate.now, "now");
}

function assertClaimedIngestJobs(jobs: unknown): asserts jobs is IngestJob[] {
  if (!Array.isArray(jobs)) {
    throw new Error("claimPendingForRetry result must be an array");
  }

  for (const [index, job] of jobs.entries()) {
    assertClaimedIngestJob(job, index);
  }
}

function assertClaimedIngestJob(job: unknown, index: number): void {
  const prefix = `claimPendingForRetry result[${index}]`;
  const candidate = assertObject(job, prefix);
  assertPositiveSafeInteger(candidate.id, `${prefix}.id`);
  assertPositiveSafeInteger(
    candidate.memoryRecordId,
    `${prefix}.memoryRecordId`,
  );
  assertNonBlankString(candidate.organizationId, `${prefix}.organizationId`);
  assertNonNegativeSafeInteger(
    candidate.qdrantAttempts,
    `${prefix}.qdrantAttempts`,
  );
}

function assertReindexableMemoryChunks(
  chunks: unknown,
): asserts chunks is ReindexableMemoryChunk[] {
  if (!Array.isArray(chunks)) {
    throw new Error("getChunksByRecordId result must be an array");
  }

  for (const [index, chunk] of chunks.entries()) {
    assertReindexableMemoryChunk(chunk, index);
  }
}

function assertReindexableMemoryChunk(chunk: unknown, index: number): void {
  const prefix = `getChunksByRecordId result[${index}]`;
  const candidate = assertObject(chunk, prefix);
  assertPositiveSafeInteger(candidate.id, `${prefix}.id`);
  assertPositiveSafeInteger(
    candidate.memoryRecordId,
    `${prefix}.memoryRecordId`,
  );
  assertNonBlankString(candidate.content, `${prefix}.content`);
  assertOptionalNonBlankString(
    candidate.organizationId,
    `${prefix}.organizationId`,
  );
  assertNonBlankString(candidate.scopeType, `${prefix}.scopeType`);
  assertNonBlankString(candidate.scopeId, `${prefix}.scopeId`);
  assertOptionalStringOrNull(candidate.projectKey, `${prefix}.projectKey`);
  assertNonBlankString(candidate.kind, `${prefix}.kind`);
  assertOptionalNonBlankString(candidate.durability, `${prefix}.durability`);
  assertOptionalStringOrNull(candidate.title, `${prefix}.title`);
  assertOptionalStringOrNull(candidate.summary, `${prefix}.summary`);
  assertOptionalStringArray(candidate.tags, `${prefix}.tags`);
  assertNonBlankString(candidate.updatedAt, `${prefix}.updatedAt`);
  assertNonBlankString(candidate.embeddingVersion, `${prefix}.embeddingVersion`);
}

function assertEmbeddingBatch(embeddings: unknown): void {
  if (!Array.isArray(embeddings)) {
    throw new Error("embedBatch result must be an array");
  }

  for (const [index, vector] of embeddings.entries()) {
    assertVector(vector, `embedBatch result[${index}]`);
  }
}

function assertVector(vector: unknown, fieldName: string): void {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error(`${fieldName} must be a non-empty array`);
  }

  for (const [index, value] of vector.entries()) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${fieldName}[${index}] must be a finite number`);
    }
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

function assertOptionalFunction(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }
  assertFunction(value, fieldName);
}

function assertOptionalPositiveSafeInteger(
  value: unknown,
  fieldName: string,
): void {
  if (value === undefined) {
    return;
  }
  assertPositiveSafeInteger(value, fieldName);
}

function assertPositiveSafeInteger(value: unknown, fieldName: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive safe integer`);
  }
}

function assertNonNegativeSafeInteger(value: unknown, fieldName: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative safe integer`);
  }
}

function assertNonBlankString(value: unknown, fieldName: string): void {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} must contain non-whitespace text`);
  }
}

function assertOptionalNonBlankString(
  value: unknown,
  fieldName: string,
): void {
  if (value === undefined) {
    return;
  }
  assertNonBlankString(value, fieldName);
}

function assertOptionalStringOrNull(value: unknown, fieldName: string): void {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string or null`);
  }
}

function assertOptionalStringArray(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  for (const [index, item] of value.entries()) {
    if (typeof item !== "string") {
      throw new Error(`${fieldName}[${index}] must be a string`);
    }
  }
}

function nowFrom(getNow: () => Date): Date {
  const value = getNow();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("now result must be a valid Date");
  }
  return value;
}
