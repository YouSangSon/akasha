// Mock-pool tests asserting the SQL shape of claimPendingForRetry.
// These run without a real Postgres instance and verify:
//   1. The claim uses a single UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)
//   2. The claim nulls qdrant_next_retry_at in the same statement
//   3. Parameters are $1=now and $2=limit (in that order)
//
// The PG-gated integration suite in ingest-job-repository.test.ts covers the
// end-to-end behaviour; this suite covers the SQL shape contract.

import { describe, expect, it, vi } from "vitest";
import { createIngestJobRepository } from "../../src/jobs/ingest-job-repository.js";
import type { PgPool } from "../../src/db/connection.js";

function makeMockPool(rows: unknown[] = []): {
  pool: PgPool;
  querySpy: ReturnType<typeof vi.fn>;
} {
  const querySpy = vi.fn().mockResolvedValue({ rows });
  const pool = { query: querySpy } as unknown as PgPool;
  return { pool, querySpy };
}

describe("claimPendingForRetry SQL shape", () => {
  it("issues a single UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)", async () => {
    const { pool, querySpy } = makeMockPool([]);
    const repo = createIngestJobRepository(pool);
    const now = new Date("2024-06-01T00:00:00.000Z");

    await repo.claimPendingForRetry({ limit: 50, now });

    expect(querySpy).toHaveBeenCalledTimes(1);
    const [sql, params] = querySpy.mock.calls[0] as [string, unknown[]];

    // Must be an UPDATE (claim), not a SELECT
    expect(sql.trim().toUpperCase()).toMatch(/^UPDATE\s+INGEST_JOBS/i);

    // Must set qdrant_next_retry_at = NULL to claim the row
    expect(sql).toMatch(/qdrant_next_retry_at\s*=\s*NULL/i);

    // Must use a sub-select with FOR UPDATE SKIP LOCKED
    expect(sql).toMatch(/FOR\s+UPDATE\s+SKIP\s+LOCKED/i);

    // Must filter on qdrant_status = 'pending'
    expect(sql).toMatch(/qdrant_status\s*=\s*'pending'/i);

    // Must filter on qdrant_next_retry_at IS NOT NULL
    expect(sql).toMatch(/qdrant_next_retry_at\s+IS\s+NOT\s+NULL/i);

    // Must use a LIMIT clause in the sub-select
    expect(sql).toMatch(/LIMIT\s+\$2/i);

    // Must RETURNING so we get the row back
    expect(sql).toMatch(/RETURNING/i);

    // Parameters: $1 = now, $2 = limit
    expect(params[0]).toBe(now);
    expect(params[1]).toBe(50);
  });

  it("orders the sub-select by qdrant_next_retry_at ASC (oldest-due first)", async () => {
    const { pool, querySpy } = makeMockPool([]);
    const repo = createIngestJobRepository(pool);

    await repo.claimPendingForRetry({ limit: 10, now: new Date() });

    const [sql] = querySpy.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/ORDER\s+BY\s+qdrant_next_retry_at\s+ASC/i);
  });

  it("returns mapped IngestJob rows from the UPDATE RETURNING result", async () => {
    const row = {
      id: 7,
      memory_record_id: 42,
      status: "completed",
      attempts: 0,
      last_error: null,
      qdrant_status: "pending",
      qdrant_attempts: 2,
      qdrant_next_retry_at: null,
      qdrant_last_error: "boom",
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-02T00:00:00.000Z",
    };
    const { pool } = makeMockPool([row]);
    const repo = createIngestJobRepository(pool);

    const jobs = await repo.claimPendingForRetry({ limit: 10, now: new Date() });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: 7,
      memoryRecordId: 42,
      qdrantStatus: "pending",
      qdrantAttempts: 2,
      qdrantNextRetryAt: null,
      qdrantLastError: "boom",
    });
  });

  it("returns empty array when no rows are due", async () => {
    const { pool } = makeMockPool([]);
    const repo = createIngestJobRepository(pool);

    const jobs = await repo.claimPendingForRetry({
      limit: 100,
      now: new Date(),
    });

    expect(jobs).toEqual([]);
  });
});
