// Outbox sweeper — finishes Qdrant cleanup for memory_archive rows where
// the in-line Qdrant delete failed (or was never attempted). The
// applyCompaction orchestrator marks rows qdrant_status='pending' on
// failure; this sweeper retries them idempotently.
//
// Idempotent: Qdrant's delete-by-id is a no-op for already-deleted points,
// and findPendingQdrantCleanup uses FOR UPDATE SKIP LOCKED so multi-replica
// sweepers cooperate without leader election.
//
// Caller decides cadence (setInterval, cron, or one-shot). Default policy
// per design doc §10: scan up to 100 rows per cycle, fail-mark after 5
// attempts so ops can investigate.

import type { Logger } from "../logger.js";
import type {
  MemoryArchiveRepository,
  PendingQdrantCleanup,
} from "../store/memory-archive-repository.js";
import type { VectorIndex } from "../vector/vector-index.js";

export type RunOutboxSweepInput = {
  archiveRepository: MemoryArchiveRepository;
  vectorIndex: VectorIndex;
  logger: Logger;
  // Tunables. Defaults follow design doc §10.
  batchSize?: number;
  maxAttempts?: number;
};

export type SweepResult = {
  scanned: number;
  cleaned: number;
  retried: number;
  failed: number;
};

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_ATTEMPTS = 5;

export async function runOutboxSweep(
  input: Readonly<RunOutboxSweepInput>,
): Promise<SweepResult> {
  const batchSize = input.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const pending = await input.archiveRepository.findPendingQdrantCleanup(
    batchSize,
  );

  let cleaned = 0;
  let retried = 0;
  let failed = 0;

  for (const row of pending) {
    const outcome = await sweepOne(input, row, maxAttempts);
    if (outcome === "cleaned") cleaned += 1;
    else if (outcome === "retry") retried += 1;
    else failed += 1;
  }

  return {
    scanned: pending.length,
    cleaned,
    retried,
    failed,
  };
}

async function sweepOne(
  input: Readonly<RunOutboxSweepInput>,
  row: PendingQdrantCleanup,
  maxAttempts: number,
): Promise<"cleaned" | "retry" | "failed"> {
  try {
    await input.vectorIndex.delete(row.qdrantPointIds);
    await input.archiveRepository.markQdrantStatus(row.archiveId, "deleted");
    return "cleaned";
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const nextAttempt = row.attemptCount + 1;
    const giveUp = nextAttempt >= maxAttempts;
    const status = giveUp ? "failed" : "pending";

    input.logger.warn(
      {
        event: giveUp
          ? "compact.sweep_giveup"
          : "compact.sweep_retry_failed",
        archiveId: row.archiveId,
        attempt: nextAttempt,
        err: errorMessage,
      },
      giveUp
        ? "qdrant cleanup gave up after max attempts; needs ops review"
        : "qdrant cleanup retry failed; will be picked up next sweep",
    );

    try {
      await input.archiveRepository.markQdrantStatus(
        row.archiveId,
        status,
        errorMessage,
      );
    } catch (markErr: unknown) {
      input.logger.error(
        {
          event: "compact.sweep_mark_failed",
          archiveId: row.archiveId,
          err: markErr,
        },
        "failed to update qdrant_status during sweep",
      );
    }

    return giveUp ? "failed" : "retry";
  }
}
