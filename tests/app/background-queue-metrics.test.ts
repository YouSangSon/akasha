import { describe, expect, it, vi } from "vitest";

import { createBackgroundQueueMetricsCollector } from "../../src/app/background-queue-metrics.js";
import type { PgQueryResult, PgQueryable } from "../../src/db/connection.js";

type QueryFn = (
  text: string,
  values?: readonly unknown[],
) => Promise<PgQueryResult>;

function makeQueryable(handler: QueryFn): {
  pool: PgQueryable;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(handler);
  return {
    pool: { query: query as unknown as PgQueryable["query"] },
    query,
  };
}

describe("createBackgroundQueueMetricsCollector", () => {
  it("collects ingest and compaction backlog counts without high-cardinality fields", async () => {
    const now = new Date("2026-06-27T12:00:00.000Z");
    const { pool, query } = makeQueryable(async (sql) => {
      if (sql.includes("FROM ingest_jobs")) {
        if (sql.includes("qdrant_next_retry_at <= $1")) {
          return { rows: [{ count: "2" }] };
        }
        if (sql.includes("qdrant_status = 'failed'")) {
          return { rows: [{ count: "1" }] };
        }
        return { rows: [{ count: "5" }] };
      }
      if (sql.includes("FROM memory_archive")) {
        if (sql.includes("qdrant_next_retry_at <= $1")) {
          return { rows: [{ count: "1" }] };
        }
        if (sql.includes("qdrant_status = 'failed'")) {
          return { rows: [{ count: "4" }] };
        }
        return { rows: [{ count: 3 }] };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    });

    const collector = createBackgroundQueueMetricsCollector(pool);
    const snapshot = await collector.collect(now);

    expect(snapshot).toEqual({
      collectSuccess: true,
      rows: [
        { queue: "ingest", state: "pending", count: 5 },
        { queue: "ingest", state: "due", count: 2 },
        { queue: "ingest", state: "failed", count: 1 },
        { queue: "compaction", state: "pending", count: 3 },
        { queue: "compaction", state: "due", count: 1 },
        { queue: "compaction", state: "failed", count: 4 },
      ],
    });

    expect(query).toHaveBeenCalledTimes(6);
    const calls = query.mock.calls.map(([sql, params]) => ({
      sql: sql as string,
      params: (params as readonly unknown[] | undefined) ?? [],
    }));

    for (const { sql } of calls) {
      expect(sql).toContain("COUNT(*) AS count");
      expect(sql).toContain("WHERE");
      expect(sql).not.toContain("COUNT(*) FILTER");
      expect(sql).not.toContain("organization_id");
      expect(sql).not.toContain("id,");
      expect(sql).not.toContain("last_error");
      expect(sql).not.toContain("source_record_id");
      expect(sql).not.toContain("qdrant_last_error");
    }

    const ingestCalls = calls.filter(({ sql }) => sql.includes("FROM ingest_jobs"));
    expect(ingestCalls).toHaveLength(3);
    expect(ingestCalls.some(({ sql }) => sql.includes("qdrant_status = 'pending'")))
      .toBe(true);
    expect(ingestCalls.some(({ sql }) => sql.includes("qdrant_status = 'failed'")))
      .toBe(true);
    expect(
      ingestCalls.some(
        ({ sql, params }) =>
          sql.includes("qdrant_next_retry_at <= $1") &&
          params[0] === now.toISOString(),
      ),
    ).toBe(true);

    const compactionCalls = calls.filter(({ sql }) =>
      sql.includes("FROM memory_archive"),
    );
    expect(compactionCalls).toHaveLength(3);
    expect(
      compactionCalls.every(({ sql }) =>
        sql.includes("array_length(qdrant_point_ids, 1) > 0"),
      ),
    ).toBe(true);
    expect(compactionCalls.some(({ sql }) => sql.includes("qdrant_status = 'pending'")))
      .toBe(true);
    expect(compactionCalls.some(({ sql }) => sql.includes("qdrant_status = 'failed'")))
      .toBe(true);
    expect(
      compactionCalls.some(
        ({ sql, params }) =>
          sql.includes("qdrant_next_retry_at <= $1") &&
          sql.includes(
            "archived_at < $1::timestamptz - INTERVAL '60 seconds'",
          ) &&
          params[0] === now.toISOString(),
      ),
    ).toBe(true);
    expect(compactionCalls.map(({ sql }) => sql).join("\n")).toContain(
      "archived_at < $1::timestamptz - INTERVAL '60 seconds'",
    );
  });

  it("maps missing count rows to zero gauges", async () => {
    const { pool } = makeQueryable(async () => ({ rows: [] }));

    const collector = createBackgroundQueueMetricsCollector(pool);
    const snapshot = await collector.collect(
      new Date("2026-06-27T12:00:00.000Z"),
    );

    expect(snapshot.rows).toEqual([
      { queue: "ingest", state: "pending", count: 0 },
      { queue: "ingest", state: "due", count: 0 },
      { queue: "ingest", state: "failed", count: 0 },
      { queue: "compaction", state: "pending", count: 0 },
      { queue: "compaction", state: "due", count: 0 },
      { queue: "compaction", state: "failed", count: 0 },
    ]);
  });
});
