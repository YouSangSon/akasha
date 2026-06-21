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
} from "../store/canonical-indexing.js";
import type { IngestJob } from "../types.js";

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

// Exponential backoff: base 1 s, doubles per attempt, capped at 5 min.
export function nextRetryDelayMs(attempts: number): number {
  const BASE_MS = 1_000;
  const CAP_MS = 5 * 60 * 1_000;
  return Math.min(BASE_MS * Math.pow(2, attempts), CAP_MS);
}

export async function runIngestSweep(
  input: Readonly<RunIngestSweepInput>,
): Promise<IngestSweepResult> {
  const batchSize = input.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const getNow = input.now ?? (() => new Date());

  const claimed = await input.ingestJobs.claimPendingForRetry({
    limit: batchSize,
    now: getNow(),
  });

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

    if (embeddings.length !== chunks.length) {
      throw new Error(
        `embedBatch returned ${embeddings.length} vectors for ${chunks.length} chunks`,
      );
    }

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
        const nextRetryAt = new Date(getNow().getTime() + delayMs);
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
