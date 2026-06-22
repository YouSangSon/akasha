import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgPool, type PgPool } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrate.js";
import { createIngestJobRepository } from "../../src/jobs/ingest-job-repository.js";
import { createMemoryRepository } from "../../src/store/memory-repository.js";
import type { IngestJob } from "../../src/types.js";

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

// PG-dependent suite: skip when POSTGRES_HOST is unset (e.g. the non-PG CI
// job, or local dev without docker compose). The pg-integration CI job sets
// it explicitly. Local opt-in: `POSTGRES_HOST=127.0.0.1 npm test`.
describe.skipIf(!process.env.POSTGRES_HOST)("createIngestJobRepository", () => {
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
      const job = await jobs.create({
        memoryRecordId: createdMemory.id,
        organizationId: "default",
      });

      expect(job).toMatchObject({
        memoryRecordId: createdMemory.id,
        organizationId: "default",
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

  it("markQdrantCompleted clears retry schedule and sets qdrant_status to completed", async () => {
    const pool = createPgPool({ connectionString: testConnectionString });

    try {
      await runMigrations(pool);
      const jobs = createIngestJobRepository(pool);
      const job = await createJob(pool);

      // Pre-condition: a prior failure scheduled a retry. Completing the
      // qdrant phase must clear that schedule so the sweeper stops picking it.
      const future = new Date(Date.now() + 60_000);
      await jobs.markQdrantPending({
        jobId: job.id,
        attempts: 1,
        nextRetryAt: future,
        error: new Error("boom"),
      });

      const completed = await jobs.markQdrantCompleted(job.id);

      expect(completed).toMatchObject({
        id: job.id,
        qdrantStatus: "completed",
        qdrantNextRetryAt: null,
      });
    } finally {
      await pool.end();
    }
  });

  it("markQdrantPending records attempts, schedule, and serialized error", async () => {
    const pool = createPgPool({ connectionString: testConnectionString });

    try {
      await runMigrations(pool);
      const jobs = createIngestJobRepository(pool);
      const job = await createJob(pool);

      const retryAt = new Date(Date.now() + 30_000);
      const updated = await jobs.markQdrantPending({
        jobId: job.id,
        attempts: 2,
        nextRetryAt: retryAt,
        error: new Error("transient qdrant 503"),
      });

      expect(updated).toMatchObject({
        id: job.id,
        qdrantStatus: "pending",
        qdrantAttempts: 2,
      });
      expect(updated.qdrantNextRetryAt).not.toBeNull();
      expect(new Date(updated.qdrantNextRetryAt as string).getTime()).toBe(
        retryAt.getTime(),
      );
      expect(updated.qdrantLastError).toContain("transient qdrant 503");
    } finally {
      await pool.end();
    }
  });

  it("markQdrantPending without error keeps qdrant_last_error null", async () => {
    const pool = createPgPool({ connectionString: testConnectionString });

    try {
      await runMigrations(pool);
      const jobs = createIngestJobRepository(pool);
      const job = await createJob(pool);

      const updated = await jobs.markQdrantPending({
        jobId: job.id,
        attempts: 1,
        nextRetryAt: new Date(Date.now() + 5_000),
      });

      expect(updated.qdrantStatus).toBe("pending");
      expect(updated.qdrantLastError).toBeNull();
    } finally {
      await pool.end();
    }
  });

  it("markQdrantFailed terminates retries and clears next_retry_at", async () => {
    const pool = createPgPool({ connectionString: testConnectionString });

    try {
      await runMigrations(pool);
      const jobs = createIngestJobRepository(pool);
      const job = await createJob(pool);

      // Simulate prior pending state with a retry scheduled.
      await jobs.markQdrantPending({
        jobId: job.id,
        attempts: 4,
        nextRetryAt: new Date(Date.now() + 5_000),
        error: new Error("flaky"),
      });

      const dead = await jobs.markQdrantFailed({
        jobId: job.id,
        attempts: 5,
        error: new Error("max attempts exceeded"),
      });

      expect(dead).toMatchObject({
        id: job.id,
        qdrantStatus: "failed",
        qdrantAttempts: 5,
        qdrantNextRetryAt: null,
      });
      expect(dead.qdrantLastError).toContain("max attempts exceeded");
    } finally {
      await pool.end();
    }
  });

  it("listPendingForRetry returns due rows ordered by next_retry_at ASC, respecting limit", async () => {
    const pool = createPgPool({ connectionString: testConnectionString });

    try {
      await runMigrations(pool);
      const jobs = createIngestJobRepository(pool);

      const a = await createJob(pool);
      const b = await createJob(pool);
      const c = await createJob(pool);
      const futureJob = await createJob(pool);
      const completedJob = await createJob(pool);

      const past2 = new Date(Date.now() - 2_000);
      const past1 = new Date(Date.now() - 1_000);
      const past0 = new Date(Date.now() - 500);
      const future = new Date(Date.now() + 60_000);

      // Order of insertion is not the order we expect back. The sweeper
      // must drain the oldest-due first.
      await jobs.markQdrantPending({ jobId: b.id, attempts: 1, nextRetryAt: past1 });
      await jobs.markQdrantPending({ jobId: a.id, attempts: 1, nextRetryAt: past2 });
      await jobs.markQdrantPending({ jobId: c.id, attempts: 1, nextRetryAt: past0 });

      // Future-dated row must NOT be returned.
      await jobs.markQdrantPending({
        jobId: futureJob.id,
        attempts: 1,
        nextRetryAt: future,
      });

      // qdrant_status='completed' rows must NOT be returned even if they
      // somehow have a retry timestamp.
      await jobs.markQdrantPending({
        jobId: completedJob.id,
        attempts: 1,
        nextRetryAt: past0,
      });
      await jobs.markQdrantCompleted(completedJob.id);

      const due = await jobs.listPendingForRetry({ limit: 10, now: new Date() });
      const ids = due.map((row) => row.id);

      // a (past2) → b (past1) → c (past0). future and completed excluded.
      expect(ids).toEqual([a.id, b.id, c.id]);

      const limited = await jobs.listPendingForRetry({ limit: 2, now: new Date() });
      expect(limited.map((r) => r.id)).toEqual([a.id, b.id]);
    } finally {
      await pool.end();
    }
  });
});

async function createJob(pool: PgPool): Promise<IngestJob> {
  const memoryRepository = createMemoryRepository(pool);
  const memory = await memoryRepository.addMemory({
    scopeType: "project",
    scopeId: "project-alpha",
    projectKey: "project-alpha",
    memoryType: "summary",
    content: `Outbox sweeper test row ${Math.random()}`,
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
  return jobs.create({ memoryRecordId: memory.id, organizationId: "default" });
}
