import type { PgPool, PgPoolClient, PgQueryRow } from "./connection.js";

export async function withPgAdvisoryLock<T>(
  pool: PgPool,
  key: string,
  work: (lockedPool: PgPool) => Promise<T>,
): Promise<T> {
  if (typeof key !== "string" || key.trim().length === 0) {
    throw new Error("advisory lock key must contain non-whitespace text");
  }

  return withPgSession(pool, async (session) => {
    await session.lock(key);
    return work(session.pool);
  });
}

export async function withPgSession<T>(
  pool: PgPool,
  work: (session: { pool: PgPool; lock(key: string): Promise<void>; assertUsable(): void }) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  const acquired: string[] = [];
  let failed = false;
  let discard = false;
  let active = true;
  let connectionError: Error | undefined;
  const onError = (error: Error) => {
    connectionError ??= error;
    discard = true;
  };
  client.on?.("error", onError);
  function assertUsable(): void {
    client.assertUsable?.();
    if (connectionError) throw connectionError;
    if (!active) throw new Error("advisory lock scope has ended");
  }
  // This facade borrows the client only until work resolves.
  const lockedPool = createBorrowedPool(
    client,
    () => { discard = true; },
    assertUsable,
  );

  try {
    const result = await work({
      pool: lockedPool,
      assertUsable,
      async lock(key) {
        assertUsable();
        if (typeof key !== "string" || key.trim().length === 0) {
          throw new Error("advisory lock key must contain non-whitespace text");
        }
        await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [key]);
        acquired.push(key);
      },
    });
    assertUsable();
    return result;
  } catch (error: unknown) {
    failed = true;
    discard = true;
    throw error;
  } finally {
    active = false;
    try {
      for (const key of connectionError ? [] : acquired.reverse()) {
        const result = await client.query<{ unlocked: boolean }>(
          "SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked",
          [key],
        );
        if (result.rows[0]?.unlocked !== true) {
          throw new Error("PostgreSQL advisory lock was not released");
        }
      }
    } catch (error: unknown) {
      discard = true;
      if (!failed) throw error;
    } finally {
      try {
        if (discard) client.release(true);
        else client.release();
      } finally {
        client.removeListener?.("error", onError);
      }
    }
  }
}

function createBorrowedPool(
  client: PgPoolClient,
  discard: () => void,
  assertActive: () => void,
): PgPool {
  const borrowedPool: PgPool = {
    async query<TRow extends PgQueryRow = PgQueryRow>(
      text: string,
      values?: readonly unknown[],
    ) {
      assertActive();
      return client.query<TRow>(text, values);
    },
    async connect() {
      assertActive();
      return {
        query: borrowedPool.query,
        assertUsable: assertActive,
        release(error?: Error | boolean) {
          if (error) discard();
        },
      };
    },
    async end() {},
  };
  return borrowedPool;
}
