import { EventEmitter } from "node:events";
import { createMemoryWriteCoordinator } from "../../src/store/memory-write-coordinator.js";
import { describe, expect, it, vi } from "vitest";
import type { PgPool } from "../../src/db/connection.js";
import { withPgAdvisoryLock, withPgSession } from "../../src/db/record-lock.js";

const acquireSql = "SELECT pg_advisory_lock(hashtextextended($1, 0))";
const unlockSql =
  "SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked";

function makePool() {
  const query = vi.fn(async (text: string, _values?: readonly unknown[]) => ({
    rows: text === unlockSql ? [{ unlocked: true }] : [],
  }));
  const release = vi.fn();
  const connect = vi.fn().mockResolvedValue({ query, release });
  const poolQuery = vi.fn();
  const end = vi.fn();
  const pool = { query: poolQuery, connect, end } as unknown as PgPool;
  return { pool, query, release, connect, poolQuery, end };
}

describe("withPgAdvisoryLock", () => {
  it.each(["", " \n\t ", null])("rejects a blank or invalid key", async (key) => {
    const { pool, connect } = makePool();
    const work = vi.fn();

    await expect(withPgAdvisoryLock(pool, key as unknown as string, work)).rejects.toThrow(
      "advisory lock key must contain non-whitespace text",
    );
    expect(connect).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });

  it("uses the reserved client for pool queries and leased transactions", async () => {
    const { pool, query, release, connect, poolQuery, end } = makePool();
    const result = await withPgAdvisoryLock(pool, " org:1 ", async (locked) => {
      await locked.query("SELECT outside_transaction");
      const client = await locked.connect();
      await client.query("BEGIN");
      await client.query("SELECT inside_transaction");
      await client.query("COMMIT");
      client.release();
      const second = await locked.connect();
      await second.query("SELECT second_lease");
      second.release(false);
      await locked.end();
      expect(release).not.toHaveBeenCalled();
      return "complete";
    });

    expect(result).toBe("complete");
    expect(connect).toHaveBeenCalledTimes(1);
    expect(poolQuery).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
    expect(query.mock.calls.map(([text]) => text)).toEqual([
      acquireSql,
      "SELECT outside_transaction",
      "BEGIN",
      "SELECT inside_transaction",
      "COMMIT",
      "SELECT second_lease",
      unlockSql,
    ]);
    expect(query).toHaveBeenNthCalledWith(1, acquireSql, [" org:1 "]);
    expect(query).toHaveBeenLastCalledWith(unlockSql, [" org:1 "]);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith();
  });

  it("balances nested locks without returning the reserved client early", async () => {
    const { pool, query, release, connect } = makePool();

    await withPgAdvisoryLock(pool, "same", async (outer) => {
      await withPgAdvisoryLock(outer, "same", async (inner) => {
        const lease = await inner.connect();
        await lease.query("SELECT nested");
        lease.release();
        expect(release).not.toHaveBeenCalled();
      });
      expect(release).not.toHaveBeenCalled();
    });

    expect(connect).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.map(([text]) => text)).toEqual([
      acquireSql,
      acquireSql,
      "SELECT nested",
      unlockSql,
      unlockSql,
    ]);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith();
  });

  it("rejects escaped pools and leases after their lock scope ends", async () => {
    const { pool, query } = makePool();

    const outer = await withPgAdvisoryLock(pool, "outer", async (outerPool) => {
      const escaped = await withPgAdvisoryLock(outerPool, "inner", async (inner) => ({
        pool: inner,
        lease: await inner.connect(),
      }));
      await expect(escaped.pool.query("SELECT expired")).rejects.toThrow(
        "advisory lock scope has ended",
      );
      await expect(escaped.pool.connect()).rejects.toThrow("advisory lock scope has ended");
      await expect(escaped.lease.query("SELECT expired")).rejects.toThrow(
        "advisory lock scope has ended",
      );
      await outerPool.query("SELECT still_active");
      return outerPool;
    });

    await expect(outer.query("SELECT expired")).rejects.toThrow("advisory lock scope has ended");
    await expect(outer.connect()).rejects.toThrow("advisory lock scope has ended");
    expect(query.mock.calls.map(([text]) => text)).not.toContain("SELECT expired");
    expect(query.mock.calls.map(([text]) => text)).toContain("SELECT still_active");
  });

  it.each([true, new Error("broken lease")])(
    "propagates a nested lease discard request to the reserved client",
    async (failure) => {
      const { pool, release } = makePool();

      await withPgAdvisoryLock(pool, "outer", async (outer) => {
        await withPgAdvisoryLock(outer, "inner", async (inner) => {
          const lease = await inner.connect();
          lease.release(failure);
          expect(release).not.toHaveBeenCalled();
        });
        expect(release).not.toHaveBeenCalled();
      });

      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith(true);
    },
  );

  it("discards the reserved client even if the outer work catches a nested failure", async () => {
    const { pool, release } = makePool();
    const nestedError = new Error("nested work failed");

    await withPgAdvisoryLock(pool, "outer", async (outer) => {
      await expect(
        withPgAdvisoryLock(outer, "inner", async () => {
          throw nestedError;
        }),
      ).rejects.toBe(nestedError);
      expect(release).not.toHaveBeenCalled();
    });

    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith(true);
  });

  it("discards the client if lock acquisition fails", async () => {
    const { pool, query, release } = makePool();
    const failure = new Error("lock acquisition failed");
    const work = vi.fn();
    query.mockRejectedValueOnce(failure);

    await expect(withPgAdvisoryLock(pool, "key", work)).rejects.toBe(failure);
    expect(work).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith(true);
  });

  it("unlocks and discards the client when work fails", async () => {
    const { pool, query, release } = makePool();
    const failure = new Error("work failed");

    await expect(
      withPgAdvisoryLock(pool, "key", async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(query).toHaveBeenLastCalledWith(unlockSql, ["key"]);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith(true);
  });

  it.each([false, undefined])(
    "discards the client when unlock does not confirm success",
    async (unlocked) => {
      const { pool, query, release } = makePool();
      query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: unlocked === undefined ? [] : [{ unlocked }],
        });

      await expect(withPgAdvisoryLock(pool, "key", async () => 42)).rejects.toThrow(
        "PostgreSQL advisory lock was not released",
      );
      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith(true);
    },
  );

  it("reports an unlock query error after successful work", async () => {
    const { pool, query, release } = makePool();
    const failure = new Error("unlock query failed");
    query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(failure);

    await expect(withPgAdvisoryLock(pool, "key", async () => 42)).rejects.toBe(failure);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith(true);
  });

  it("preserves the work error if unlocking also fails", async () => {
    const { pool, query, release } = makePool();
    const workError = new Error("work failed");
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("unlock failed"));

    await expect(
      withPgAdvisoryLock(pool, "key", async () => {
        throw workError;
      }),
    ).rejects.toBe(workError);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith(true);
  });
});


describe("withPgSession", () => {
  it("holds a dynamically discovered record lock across commit and releases in reverse order", async () => {
    const { pool, query, release, connect } = makePool();
    let escapedLock: ((key: string) => Promise<void>) | undefined;
    await withPgSession(pool, async (session) => {
      escapedLock = session.lock;
      await session.lock("archive:7");
      await session.pool.query("BEGIN");
      await session.pool.query("INSERT record RETURNING id");
      await session.lock("record:42");
      await session.pool.query("INSERT pending_intent");
      await session.pool.query("COMMIT");
      await session.pool.query("SELECT after_commit");
      expect(release).not.toHaveBeenCalled();
    });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(query.mock.calls).toEqual([
      [acquireSql, ["archive:7"]], ["BEGIN", undefined],
      ["INSERT record RETURNING id", undefined], [acquireSql, ["record:42"]],
      ["INSERT pending_intent", undefined], ["COMMIT", undefined],
      ["SELECT after_commit", undefined],
      [unlockSql, ["record:42"]], [unlockSql, ["archive:7"]],
    ]);
    await expect(escapedLock!("late")).rejects.toThrow("scope has ended");
    expect(release).toHaveBeenCalledExactlyOnceWith();
  });
});


describe("reserved connection loss", () => {
  it("invalidates nested DB and vector scopes without releasing a live callback early", async () => {
    const { pool, query, release, connect } = makePool();
    const events = new EventEmitter();
    connect.mockResolvedValue({ query, release, on: events.on.bind(events), removeListener: events.removeListener.bind(events) });
    const vectors = { upsert: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn(), query: vi.fn(), ensureCollection: vi.fn() };
    const writes = createMemoryWriteCoordinator({ pool, vectorIndexForPool: () => vectors,
      embeddings: { embed: vi.fn(), embedBatch: vi.fn() },
      embedding: { provider: "local", model: "test", dimensions: 3, version: "v1", targetTokens: 10, overlapTokens: 0 } });
    const failure = new Error("connection terminated while embedding");
    let entered!: () => void;
    let resume!: () => void;
    const waiting = new Promise<void>((resolve) => { entered = resolve; });
    const blocked = new Promise<void>((resolve) => { resume = resolve; });
    const work = writes.record("org-a", [1], (scope) => scope.writes.record("org-a", [1], async (nested) => {
      entered();
      await blocked;
      expect(() => nested.vectorIndex.upsert([])).toThrow(failure);
      await expect(nested.repository.getMemoryRecordById(1, "org-a")).rejects.toBe(failure);
      // Even a callback that catches the failure cannot report a successful scope.
      return "caught";
    }));
    const rejected = expect(work).rejects.toBe(failure);
    await waiting;
    expect(events.listenerCount("error")).toBe(1);
    expect(() => events.emit("error", failure)).not.toThrow();
    expect(release).not.toHaveBeenCalled();
    resume();
    await rejected;
    expect(vectors.upsert).not.toHaveBeenCalled();
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([acquireSql, acquireSql]);
    expect(release).toHaveBeenCalledExactlyOnceWith(true);
    expect(events.listenerCount("error")).toBe(0);
  });
});
