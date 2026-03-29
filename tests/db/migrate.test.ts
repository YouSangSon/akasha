import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgPool } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrate.js";

type InformationSchemaTableRow = {
  table_name: string;
};

const adminConnectionString = "postgres://memory:memory@127.0.0.1:5432/postgres";
const testConnectionString =
  "postgres://memory:memory@127.0.0.1:5432/memory_os_test";

async function waitForPostgres() {
  let lastError: unknown;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const adminPool = createPgPool({
      connectionString: adminConnectionString,
    });

    try {
      await adminPool.query("SELECT 1");
      return;
    } catch (error: unknown) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
      await adminPool.end().catch(() => undefined);
    }
  }

  throw lastError;
}

async function recreateTestDatabase() {
  const adminPool = createPgPool({
    connectionString: adminConnectionString,
  });

  try {
    await adminPool.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      ["memory_os_test"],
    );
    await adminPool.query('DROP DATABASE IF EXISTS "memory_os_test"');
    await adminPool.query('CREATE DATABASE "memory_os_test"');
  } finally {
    await adminPool.end();
  }
}

describe("runMigrations", () => {
  beforeAll(async () => {
    await waitForPostgres();
    await recreateTestDatabase();
  });

  afterAll(async () => {
    await recreateTestDatabase();
  });

  it("creates canonical Postgres tables for memory state", async () => {
    const pool = createPgPool({
      connectionString: testConnectionString,
    });

    try {
      await runMigrations(pool);

      const result = await pool.query<InformationSchemaTableRow>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'sources',
            'memory_records',
            'memory_chunks',
            'relationships',
            'context_pack_runs',
            'ingest_jobs'
          )
        ORDER BY table_name
      `);

      expect(result.rows.map((row) => row.table_name)).toEqual([
        "context_pack_runs",
        "ingest_jobs",
        "memory_chunks",
        "memory_records",
        "relationships",
        "sources",
      ]);
    } finally {
      await pool.end();
    }
  });
});
