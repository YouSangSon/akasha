import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgPool } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrate.js";
import { createIngestJobRepository } from "../../src/jobs/ingest-job-repository.js";
import { createMemoryRepository } from "../../src/store/memory-repository.js";

const postgresPort = process.env.POSTGRES_PORT ?? "5432";
const testDatabaseName = "memory_os_jobs_test";
const adminConnectionString =
  `postgres://memory:memory@127.0.0.1:${postgresPort}/postgres`;
const testConnectionString =
  `postgres://memory:memory@127.0.0.1:${postgresPort}/${testDatabaseName}`;

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
      [testDatabaseName],
    );
    await adminPool.query(`DROP DATABASE IF EXISTS "${testDatabaseName}"`);
    await adminPool.query(`CREATE DATABASE "${testDatabaseName}"`);
  } finally {
    await adminPool.end();
  }
}

describe("createIngestJobRepository", () => {
  beforeAll(async () => {
    await waitForPostgres();
    await recreateTestDatabase();
  });

  afterAll(async () => {
    await recreateTestDatabase();
  });

  it("creates and completes ingest jobs for canonical memory records", async () => {
    const pool = createPgPool({
      connectionString: testConnectionString,
    });

    try {
      await runMigrations(pool);

      const memoryRepository = createMemoryRepository(pool);
      const createdMemory = await memoryRepository.addMemory({
        scopeType: "project",
        scopeId: "project-alpha",
        projectKey: "project-alpha",
        memoryType: "summary",
        content: "Canonical records should enqueue ingest work.",
        source: {
          scopeType: "project",
          scopeId: "project-alpha",
          sourceType: "document",
          sourceRef: "README.md",
        },
        durability: "durable",
        importance: 2,
      });

      const jobs = createIngestJobRepository(pool);
      const job = await jobs.create({ memoryRecordId: createdMemory.id });

      expect(job).toMatchObject({
        memoryRecordId: createdMemory.id,
        status: "pending",
        attempts: 0,
        lastError: null,
      });

      const completed = await jobs.markCompleted(job.id);

      expect(completed).toMatchObject({
        id: job.id,
        memoryRecordId: createdMemory.id,
        status: "completed",
      });
    } finally {
      await pool.end();
    }
  });
});
