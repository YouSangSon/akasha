import type { PgPool } from "../db/connection.js";
import type { IngestJob, IngestJobRepository } from "../types.js";

type IngestJobRow = {
  id: number;
  memory_record_id: number;
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
  return {
    async create(input) {
      const result = await pool.query<IngestJobRow>(
        `
          INSERT INTO ingest_jobs (memory_record_id, status)
          VALUES ($1, 'pending')
          RETURNING ${RETURNING_COLUMNS}
        `,
        [input.memoryRecordId],
      );

      return mapJob(requireSingleRow(result.rows[0], "ingest job"));
    },

    async markCompleted(jobId) {
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

    async markQdrantPending({ jobId, attempts, nextRetryAt, error }) {
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

    async markQdrantFailed({ jobId, attempts, error }) {
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

    async listPendingForRetry({ limit, now }) {
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

    async claimPendingForRetry({ limit, now }) {
      // Atomically select + claim due rows in a single UPDATE so the
      // SKIP LOCKED lock is held when retry_at is nulled. A bare
      // SELECT … FOR UPDATE SKIP LOCKED releases the lock at autocommit,
      // allowing a second replica to read the same row between SELECT and
      // UPDATE. The single-statement form prevents that race.
      //
      // NOTE (tradeoff): nulling retry_at to claim means a process crash
      // after claim but before markQdrantCompleted/markQdrantPending leaves
      // the row with retry_at=NULL and qdrant_status='pending'. That row no
      // longer matches the claim WHERE clause, so the sweeper never
      // re-picks it (only manual reindex_memory recovers it). An alternative
      // sentinel (far-future timestamp as a visibility-timeout) would make
      // crashes auto-recoverable but adds more complexity. NULL is chosen
      // here per the design doc's example SQL; see report for the trade-off.
      const result = await pool.query<IngestJobRow>(
        `
          UPDATE ingest_jobs
          SET qdrant_next_retry_at = NULL,
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
        [now, limit],
      );

      return result.rows.map(mapJob);
    },
  };
}

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

function mapJob(row: IngestJobRow): IngestJob {
  return {
    id: toNumber(row.id),
    memoryRecordId: toNumber(row.memory_record_id),
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
