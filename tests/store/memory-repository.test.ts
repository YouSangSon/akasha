import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgPool } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrate.js";
import { createMemoryRepository } from "../../src/store/memory-repository.js";

const postgresPort = process.env.POSTGRES_PORT ?? "5432";
const testDatabaseName = "memory_os_store_test";
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

describe("createMemoryRepository", () => {
  beforeAll(async () => {
    await waitForPostgres();
    await recreateTestDatabase();
  });

  afterAll(async () => {
    await recreateTestDatabase();
  });

  it("stores canonical Postgres memory records with project and source metadata", async () => {
    const pool = createPgPool({
      connectionString: testConnectionString,
    });

    try {
      await runMigrations(pool);
      const repository = createMemoryRepository(pool);

      const created = await repository.addMemory({
        scopeType: "user",
        scopeId: "alice",
        projectKey: "project-alpha",
        memoryType: "decision",
        title: "Response language",
        content: "Always respond in Korean unless the repo says otherwise.",
        source: {
          scopeType: "user",
          scopeId: "alice",
          sourceType: "conversation",
          sourceRef: "manual://session",
          title: "Manual note",
        },
        durability: "durable",
        importance: 5,
      });

      expect(created).toMatchObject({
        scopeType: "user",
        scopeId: "alice",
        projectKey: "project-alpha",
        memoryType: "decision",
        title: "Response language",
        durability: "durable",
        importance: 5,
        source: {
          scopeType: "user",
          scopeId: "alice",
          sourceType: "conversation",
          sourceRef: "manual://session",
          title: "Manual note",
        },
      });
      expect(created.id).toBeGreaterThan(0);
      expect(created.sourceId).toBeGreaterThan(0);
      expect(created.summary).toContain("Always respond in Korean");
    } finally {
      await pool.end();
    }
  });

  it("lists and searches canonical records by allowed scopes", async () => {
    const pool = createPgPool({
      connectionString: testConnectionString,
    });

    try {
      await runMigrations(pool);
      const repository = createMemoryRepository(pool);

      await repository.addMemory({
        scopeType: "project",
        scopeId: "project-alpha",
        projectKey: "project-alpha",
        memoryType: "summary",
        content: "Project alpha keeps local memory durable for handoff.",
        source: {
          scopeType: "project",
          scopeId: "project-alpha",
          sourceType: "document",
          sourceRef: "README.md",
        },
        durability: "durable",
        importance: 3,
      });

      await repository.addMemory({
        scopeType: "project",
        scopeId: "project-beta",
        projectKey: "project-beta",
        memoryType: "fact",
        content: "Project beta experiments with an unrelated queue.",
        source: {
          scopeType: "project",
          scopeId: "project-beta",
          sourceType: "document",
          sourceRef: "notes.md",
        },
        durability: "ephemeral",
        importance: 1,
      });

      const listed = await repository.listMemory({
        scopeType: "project",
        scopeId: "project-alpha",
      });
      const searched = await repository.searchMemory({
        query: "local memory durable",
        scopes: [{ scopeType: "project", scopeId: "project-alpha" }],
        limit: 10,
      });

      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        scopeId: "project-alpha",
        projectKey: "project-alpha",
      });

      expect(searched).toHaveLength(1);
      expect(searched[0]).toMatchObject({
        scopeId: "project-alpha",
        memoryType: "summary",
        source: {
          sourceRef: "README.md",
        },
      });
    } finally {
      await pool.end();
    }
  });
});
