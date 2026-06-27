import type { PgQueryable } from "../db/connection.js";

export type BackgroundQueue = "ingest" | "compaction";
export type BackgroundQueueState = "pending" | "due" | "failed";

export type BackgroundQueueRows = {
  queue: BackgroundQueue;
  state: BackgroundQueueState;
  count: number;
};

export type BackgroundQueueBacklogSnapshot = {
  collectSuccess: boolean;
  rows: BackgroundQueueRows[];
};

export type BackgroundQueueMetricsCollector = {
  collect(now?: Date): Promise<BackgroundQueueBacklogSnapshot>;
};

type CountRow = {
  count: string | number | null;
};

type QueueCounts = {
  pending: number;
  due: number;
  failed: number;
};

export function createBackgroundQueueMetricsCollector(
  pool: PgQueryable,
): BackgroundQueueMetricsCollector {
  return {
    async collect(now = new Date()) {
      const collectedAt = now.toISOString();
      const [ingest, compaction] = await Promise.all([
        collectIngestBacklog(pool, collectedAt),
        collectCompactionBacklog(pool, collectedAt),
      ]);

      return {
        collectSuccess: true,
        rows: [
          ...mapQueueCounts("ingest", ingest),
          ...mapQueueCounts("compaction", compaction),
        ],
      };
    },
  };
}

async function collectIngestBacklog(
  pool: PgQueryable,
  nowIso: string,
): Promise<QueueCounts> {
  const [pending, due, failed] = await Promise.all([
    countRows(
      pool,
      `
        SELECT COUNT(*) AS count
        FROM ingest_jobs
        WHERE qdrant_status = 'pending'
      `,
    ),
    countRows(
      pool,
      `
        SELECT COUNT(*) AS count
        FROM ingest_jobs
        WHERE qdrant_status = 'pending'
          AND qdrant_next_retry_at IS NOT NULL
          AND qdrant_next_retry_at <= $1
      `,
      [nowIso],
    ),
    countRows(
      pool,
      `
        SELECT COUNT(*) AS count
        FROM ingest_jobs
        WHERE qdrant_status = 'failed'
      `,
    ),
  ]);

  return { pending, due, failed };
}

async function collectCompactionBacklog(
  pool: PgQueryable,
  nowIso: string,
): Promise<QueueCounts> {
  const [pending, due, failed] = await Promise.all([
    countRows(
      pool,
      `
        SELECT COUNT(*) AS count
        FROM memory_archive
        WHERE qdrant_status = 'pending'
          AND array_length(qdrant_point_ids, 1) > 0
      `,
    ),
    countRows(
      pool,
      `
        SELECT COUNT(*) AS count
        FROM memory_archive
        WHERE qdrant_status = 'pending'
          AND qdrant_next_retry_at IS NOT NULL
          AND qdrant_next_retry_at <= $1
          AND archived_at < $1::timestamptz - INTERVAL '60 seconds'
          AND array_length(qdrant_point_ids, 1) > 0
      `,
      [nowIso],
    ),
    countRows(
      pool,
      `
        SELECT COUNT(*) AS count
        FROM memory_archive
        WHERE qdrant_status = 'failed'
          AND array_length(qdrant_point_ids, 1) > 0
      `,
    ),
  ]);

  return { pending, due, failed };
}

function mapQueueCounts(
  queue: BackgroundQueue,
  row: QueueCounts,
): BackgroundQueueRows[] {
  return [
    { queue, state: "pending", count: toNonNegativeInteger(row.pending) },
    { queue, state: "due", count: toNonNegativeInteger(row.due) },
    { queue, state: "failed", count: toNonNegativeInteger(row.failed) },
  ];
}

async function countRows(
  pool: PgQueryable,
  sql: string,
  values: readonly unknown[] = [],
): Promise<number> {
  const result = await pool.query<CountRow>(sql, values);
  return toNonNegativeInteger(result.rows[0]?.count ?? 0);
}

function toNonNegativeInteger(value: string | number | null): number {
  const numberValue = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(numberValue)) {
    return 0;
  }
  return Math.max(0, Math.trunc(numberValue));
}
