import type { PgPool } from "../db/connection.js";
import { rootLogger } from "../logger.js";
import { assertNonBlankText } from "../store/memory-content.js";
import type { IngestJob, IngestJobRepository } from "../types.js";

// How long (in ms) a claimed row is "reserved" before it can be re-claimed.
// A sweeper that claims a row sets qdrant_next_retry_at = now + this window
// instead of NULL. If the process crashes before calling markQdrantCompleted /
// markQdrantPending / markQdrantFailed, the row's next_retry_at naturally
// falls back to <= now after this window and the next sweeper cycle re-claims
// it automatically — no manual intervention needed.
//
// Known nuance: a crash-reclaim does NOT increment qdrant_attempts (the
// failure path was bypassed). A persistently-crashing process is therefore
// rate-limited by the visibility window rather than bounded by maxAttempts.
// This is acceptable; it is far better than the row being stuck forever.
const CLAIM_VISIBILITY_TIMEOUT_MS = 5 * 60 * 1_000; // 5 minutes

type IngestJobRow = {
  id: number;
  memory_record_id: number;
  organization_id: string;
  status: IngestJob["status"];
  attempts: number;
  last_error: string | null;
  qdrant_status: IngestJob["qdrantStatus"];
  qdrant_attempts: number;
  qdrant_next_retry_at: string | Date | null;
  qdrant_last_error: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

const RETURNING_COLUMNS = `
  id,
  memory_record_id,
  organization_id,
  status,
  attempts,
  last_error,
  qdrant_status,
  qdrant_attempts,
  qdrant_next_retry_at,
  qdrant_last_error,
  created_at,
  updated_at
`;

export function createIngestJobRepository(pool: PgPool): IngestJobRepository {
  assertIngestJobPool(pool);

  return {
    async create(input) {
      assertCreateInput(input);

      const result = await pool.query<IngestJobRow>(
        `
          INSERT INTO ingest_jobs (memory_record_id, organization_id, status)
          VALUES ($1, $2, 'pending')
          RETURNING ${RETURNING_COLUMNS}
        `,
        [input.memoryRecordId, input.organizationId],
      );

      return mapJob(requireSingleRow(result.rows[0], "ingest job"));
    },

    async markCompleted(jobId) {
      assertPositiveSafeInteger(jobId, "jobId");

      const result = await pool.query<IngestJobRow>(
        `
          UPDATE ingest_jobs
          SET status = 'completed',
              updated_at = NOW()
          WHERE id = $1
          RETURNING ${RETURNING_COLUMNS}
        `,
        [jobId],
      );

      return mapJob(requireSingleRow(result.rows[0], "ingest job"));
    },

    async markFailed(jobId, error) {
      assertPositiveSafeInteger(jobId, "jobId");

      rootLogger.error({ err: error, jobId }, "ingest job failed");
      const result = await pool.query<IngestJobRow>(
        `
          UPDATE ingest_jobs
          SET status = 'failed',
              last_error = $2,
              attempts = attempts + 1,
              updated_at = NOW()
          WHERE id = $1
          RETURNING ${RETURNING_COLUMNS}
        `,
        [jobId, serializeError(error)],
      );

      return mapJob(requireSingleRow(result.rows[0], "ingest job"));
    },

    async markQdrantCompleted(jobId) {
      assertPositiveSafeInteger(jobId, "jobId");

      const result = await pool.query<IngestJobRow>(
        `
          UPDATE ingest_jobs
          SET qdrant_status = 'completed',
              qdrant_next_retry_at = NULL,
              qdrant_last_error = NULL,
              updated_at = NOW()
          WHERE id = $1
          RETURNING ${RETURNING_COLUMNS}
        `,
        [jobId],
      );

      return mapJob(requireSingleRow(result.rows[0], "ingest job"));
    },

    async markQdrantPending(input) {
      assertMarkQdrantPendingInput(input);
      const { jobId, attempts, nextRetryAt, error } = input;

      // COALESCE preserves the existing qdrant_last_error when caller omits
      // the error param — sweeper re-arming a schedule without a new error
      // shouldn't erase the last known failure context.
      const result = await pool.query<IngestJobRow>(
        `
          UPDATE ingest_jobs
          SET qdrant_status = 'pending',
              qdrant_attempts = $2,
              qdrant_next_retry_at = $3,
              qdrant_last_error = COALESCE($4, qdrant_last_error),
              updated_at = NOW()
          WHERE id = $1
          RETURNING ${RETURNING_COLUMNS}
        `,
        [
          jobId,
          attempts,
          nextRetryAt,
          error === undefined ? null : serializeError(error),
        ],
      );

      return mapJob(requireSingleRow(result.rows[0], "ingest job"));
    },

    async markQdrantFailed(input) {
      assertMarkQdrantFailedInput(input);
      const { jobId, attempts, error } = input;

      const result = await pool.query<IngestJobRow>(
        `
          UPDATE ingest_jobs
          SET qdrant_status = 'failed',
              qdrant_attempts = $2,
              qdrant_next_retry_at = NULL,
              qdrant_last_error = $3,
              updated_at = NOW()
          WHERE id = $1
          RETURNING ${RETURNING_COLUMNS}
        `,
        [jobId, attempts, serializeError(error)],
      );

      return mapJob(requireSingleRow(result.rows[0], "ingest job"));
    },

    async listPendingForRetry(input) {
      assertRetryQueryInput(input);
      const { limit, now } = input;

      // Read-only query for monitoring / manual replay. The sweeper PR will
      // add claim semantics (FOR UPDATE SKIP LOCKED inside a transaction) so
      // multiple replicas don't race on the same row.
      const result = await pool.query<IngestJobRow>(
        `
          SELECT ${RETURNING_COLUMNS}
          FROM ingest_jobs
          WHERE qdrant_status = 'pending'
            AND qdrant_next_retry_at IS NOT NULL
            AND qdrant_next_retry_at <= $1
          ORDER BY qdrant_next_retry_at ASC
          LIMIT $2
        `,
        [now, limit],
      );

      return result.rows.map(mapJob);
    },

    async claimPendingForRetry(input) {
      assertRetryQueryInput(input);
      const { limit, now } = input;

      // Atomically select + claim due rows in a single UPDATE so the
      // SKIP LOCKED lock is held for the full statement. A bare
      // SELECT … FOR UPDATE SKIP LOCKED releases the lock at autocommit,
      // allowing a second replica to read the same row between SELECT and
      // UPDATE. The single-statement form prevents that race.
      //
      // Visibility-timeout claim: instead of setting qdrant_next_retry_at=NULL
      // (which would leave crashed rows permanently invisible), we push the
      // timestamp into the future by CLAIM_VISIBILITY_TIMEOUT_MS. The claimed
      // row is "reserved" for that window — its next_retry_at > now, so the
      // WHERE clause excludes it from future claim passes. On success →
      // markQdrantCompleted clears it (status='completed', retry_at=NULL). On
      // transient failure → markQdrantPending reschedules normally. On crash →
      // after the visibility window elapses, next_retry_at <= now again and
      // the row is automatically re-claimed on the next sweep cycle.
      const claimUntil = new Date(now.getTime() + CLAIM_VISIBILITY_TIMEOUT_MS);
      const result = await pool.query<IngestJobRow>(
        `
          UPDATE ingest_jobs
          SET qdrant_next_retry_at = $3,
              updated_at = NOW()
          WHERE id IN (
            SELECT id
            FROM ingest_jobs
            WHERE qdrant_status = 'pending'
              AND qdrant_next_retry_at IS NOT NULL
              AND qdrant_next_retry_at <= $1
            ORDER BY qdrant_next_retry_at ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED
          )
          RETURNING ${RETURNING_COLUMNS}
        `,
        [now, limit, claimUntil],
      );

      return result.rows.map(mapJob);
    },
  };
}

function assertIngestJobPool(value: unknown): asserts value is PgPool {
  const candidate = assertObject(value, "ingest job pool");
  assertFunction(candidate.query, "ingest job pool.query");
}

function assertCreateInput(
  value: unknown,
): asserts value is { memoryRecordId: number; organizationId: string } {
  const candidate = assertObject(value, "ingest job create input");
  assertPositiveSafeInteger(candidate.memoryRecordId, "memoryRecordId");
  assertNonBlankText(candidate.organizationId, "organizationId");
}

function assertMarkQdrantPendingInput(value: unknown): asserts value is {
  jobId: number;
  attempts: number;
  nextRetryAt: Date;
  error?: unknown;
} {
  const candidate = assertObject(value, "markQdrantPending input");
  assertPositiveSafeInteger(candidate.jobId, "jobId");
  assertNonNegativeSafeInteger(candidate.attempts, "attempts");
  assertValidDate(candidate.nextRetryAt, "nextRetryAt");
}

function assertMarkQdrantFailedInput(value: unknown): asserts value is {
  jobId: number;
  attempts: number;
  error: unknown;
} {
  const candidate = assertObject(value, "markQdrantFailed input");
  assertPositiveSafeInteger(candidate.jobId, "jobId");
  assertNonNegativeSafeInteger(candidate.attempts, "attempts");
}

function assertRetryQueryInput(
  value: unknown,
): asserts value is { limit: number; now: Date } {
  const candidate = assertObject(value, "ingest retry query input");
  assertPositiveSafeInteger(candidate.limit, "limit");
  assertValidDate(candidate.now, "now");
}

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function mapJob(row: IngestJobRow): IngestJob {
  return {
    id: toNumber(row.id),
    memoryRecordId: toNumber(row.memory_record_id),
    organizationId: row.organization_id,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    qdrantStatus: row.qdrant_status,
    qdrantAttempts: row.qdrant_attempts,
    qdrantNextRetryAt:
      row.qdrant_next_retry_at === null
        ? null
        : toIsoString(row.qdrant_next_retry_at),
    qdrantLastError: row.qdrant_last_error,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
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

function assertPositiveSafeInteger(
  value: unknown,
  fieldName: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(`${fieldName} must be a positive safe integer`);
  }
}

function assertNonNegativeSafeInteger(
  value: unknown,
  fieldName: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(`${fieldName} must be a non-negative safe integer`);
  }
}

function assertValidDate(
  value: unknown,
  fieldName: string,
): asserts value is Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`${fieldName} must be a valid Date`);
  }
}
