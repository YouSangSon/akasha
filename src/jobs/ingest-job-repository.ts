import type { PgPool } from "../db/connection.js";
import { rootLogger } from "../logger.js";
import type { IngestJob, IngestJobRepository } from "../types.js";

type IngestJobRow = {
  id: number;
  memory_record_id: number;
  status: IngestJob["status"];
  attempts: number;
  last_error: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

export function createIngestJobRepository(pool: PgPool): IngestJobRepository {
  return {
    async create(input) {
      const result = await pool.query<IngestJobRow>(
        `
          INSERT INTO ingest_jobs (memory_record_id, status)
          VALUES ($1, 'pending')
          RETURNING
            id,
            memory_record_id,
            status,
            attempts,
            last_error,
            created_at,
            updated_at
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
          RETURNING
            id,
            memory_record_id,
            status,
            attempts,
            last_error,
            created_at,
            updated_at
        `,
        [jobId],
      );

      return mapJob(requireSingleRow(result.rows[0], "ingest job"));
    },

    async markFailed(jobId, error) {
      rootLogger.error({ err: error, jobId }, "ingest job failed");
      const result = await pool.query<IngestJobRow>(
        `
          UPDATE ingest_jobs
          SET status = 'failed',
              last_error = $2,
              attempts = attempts + 1,
              updated_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            memory_record_id,
            status,
            attempts,
            last_error,
            created_at,
            updated_at
        `,
        [jobId, serializeError(error)],
      );

      return mapJob(requireSingleRow(result.rows[0], "ingest job"));
    },
  };
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
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
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
