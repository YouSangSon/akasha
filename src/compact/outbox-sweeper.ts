// Outbox sweeper — finishes Qdrant cleanup for memory_archive rows where
// the in-line Qdrant delete failed (or was never attempted). The
// applyCompaction orchestrator marks rows qdrant_status='pending' on
// failure; this sweeper retries them idempotently.
//
// Idempotent: Qdrant's delete-by-id is a no-op for already-deleted points,
// and claimPendingQdrantCleanup uses one UPDATE ... FOR UPDATE SKIP LOCKED ...
// RETURNING statement so multi-replica sweepers cooperate without leader
// election or find-then-update races.
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
  now?: () => Date;
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
  assertRunOutboxSweepInput(input);

  const batchSize = input.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const getNow = input.now ?? (() => new Date());
  const now = getNow();
  assertValidDate(now, "now result");

  const pending = await input.archiveRepository.claimPendingQdrantCleanup({
    limit: batchSize,
    now,
  });
  assertPendingQdrantCleanupRows(pending);

  let cleaned = 0;
  let retried = 0;
  let failed = 0;

  for (const rows of groupRowsByOrganization(pending).values()) {
    const outcome = await sweepBatch(input, rows, maxAttempts);
    cleaned += outcome.cleaned;
    retried += outcome.retried;
    failed += outcome.failed;
  }

  return {
    scanned: pending.length,
    cleaned,
    retried,
    failed,
  };
}

function groupRowsByOrganization(
  pending: PendingQdrantCleanup[],
): Map<string, PendingQdrantCleanup[]> {
  const groups = new Map<string, PendingQdrantCleanup[]>();
  for (const row of pending) {
    const rows = groups.get(row.organizationId) ?? [];
    rows.push(row);
    groups.set(row.organizationId, rows);
  }
  return groups;
}

async function sweepBatch(
  input: Readonly<RunOutboxSweepInput>,
  rows: PendingQdrantCleanup[],
  maxAttempts: number,
): Promise<Omit<SweepResult, "scanned">> {
  const [firstRow] = rows;
  if (firstRow === undefined) {
    return { cleaned: 0, retried: 0, failed: 0 };
  }

  try {
    const recordIds = rows.flatMap((row) => row.sourceRecordId === undefined ? [] : [row.sourceRecordId]);
    if (recordIds.length > 0) {
      await input.vectorIndex.deleteByRecordIds(recordIds, { organizationId: firstRow.organizationId });
    }
    const legacyRows = rows.filter((row) => row.sourceRecordId === undefined);
    if (legacyRows.length > 0) {
      await input.vectorIndex.delete(flattenPointIds(legacyRows), { organizationId: firstRow.organizationId });
    }
  } catch (err: unknown) {
    return markBatchFailure(input, rows, maxAttempts, err);
  }

  let cleaned = 0;
  let retried = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await input.archiveRepository.markQdrantStatus(row.archiveId, "deleted");
      cleaned += 1;
    } catch (err: unknown) {
      const outcome = await markRowFailure(input, row, maxAttempts, err);
      if (outcome === "retry") retried += 1;
      else failed += 1;
    }
  }

  return { cleaned, retried, failed };
}

function flattenPointIds(rows: PendingQdrantCleanup[]): string[] {
  return rows.flatMap((row) => row.qdrantPointIds);
}

async function markBatchFailure(
  input: Readonly<RunOutboxSweepInput>,
  rows: PendingQdrantCleanup[],
  maxAttempts: number,
  err: unknown,
): Promise<Omit<SweepResult, "scanned">> {
  let retried = 0;
  let failed = 0;

  for (const row of rows) {
    const outcome = await markRowFailure(input, row, maxAttempts, err);
    if (outcome === "retry") retried += 1;
    else failed += 1;
  }

  return { cleaned: 0, retried, failed };
}

async function markRowFailure(
  input: Readonly<RunOutboxSweepInput>,
  row: PendingQdrantCleanup,
  maxAttempts: number,
  err: unknown,
): Promise<"retry" | "failed"> {
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

function assertRunOutboxSweepInput(
  input: unknown,
): asserts input is RunOutboxSweepInput {
  const candidate = assertObject(input, "runOutboxSweep input");
  const archiveRepository = assertObject(
    candidate.archiveRepository,
    "archiveRepository",
  );
  const vectorIndex = assertObject(candidate.vectorIndex, "vectorIndex");
  const logger = assertObject(candidate.logger, "logger");

  assertFunction(
    archiveRepository.claimPendingQdrantCleanup,
    "archiveRepository.claimPendingQdrantCleanup",
  );
  assertFunction(
    archiveRepository.markQdrantStatus,
    "archiveRepository.markQdrantStatus",
  );
  assertFunction(vectorIndex.delete, "vectorIndex.delete");
  assertFunction(logger.warn, "logger.warn");
  assertFunction(logger.error, "logger.error");
  assertOptionalPositiveSafeInteger(candidate.batchSize, "batchSize");
  assertOptionalPositiveSafeInteger(candidate.maxAttempts, "maxAttempts");
  assertOptionalFunction(candidate.now, "now");
}

function assertPendingQdrantCleanupRows(
  rows: unknown,
): asserts rows is PendingQdrantCleanup[] {
  if (!Array.isArray(rows)) {
    throw new Error("claimPendingQdrantCleanup result must be an array");
  }

  for (const [index, row] of rows.entries()) {
    assertPendingQdrantCleanupRow(row, index);
  }
}

function assertPendingQdrantCleanupRow(row: unknown, index: number): void {
  const prefix = `claimPendingQdrantCleanup result[${index}]`;
  const candidate = assertObject(row, prefix);
  assertPositiveSafeInteger(candidate.archiveId, `${prefix}.archiveId`);
  assertOptionalPositiveSafeInteger(candidate.sourceRecordId, `${prefix}.sourceRecordId`);
  assertNonBlankString(candidate.organizationId, `${prefix}.organizationId`);
  assertStringArray(candidate.qdrantPointIds, `${prefix}.qdrantPointIds`);
  assertNonNegativeSafeInteger(candidate.attemptCount, `${prefix}.attemptCount`);
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

function assertStringArray(value: unknown, fieldName: string): void {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  for (const [index, item] of value.entries()) {
    assertNonBlankString(item, `${fieldName}[${index}]`);
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

function assertValidDate(value: unknown, fieldName: string): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`${fieldName} must be a valid Date`);
  }
}
