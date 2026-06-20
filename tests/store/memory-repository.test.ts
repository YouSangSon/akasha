import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("createMemoryRepository (unit — no PG required)", () => {
  it("deleteMemoryRecord issues SQL with organization_id predicate and passes both id and organizationId params (SEC-5)", () => {
    // Proof via mock-based SQL inspection: deleteMemoryRecord must scope its
    // DELETE to the given organization_id to prevent cross-tenant deletion.
    const queryCalls: { sql: string; params: unknown[] }[] = [];
    const mockPool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        queryCalls.push({ sql, params });
        return Promise.resolve({ rows: [] });
      }),
    };
    const repo = createMemoryRepository(mockPool as never);

    return repo.deleteMemoryRecord(42, "org-abc").then(() => {
      expect(queryCalls).toHaveLength(1);
      const { sql, params } = queryCalls[0]!;

      // SQL must include the org predicate — prevents cross-tenant deletion.
      expect(sql).toMatch(/organization_id\s*=\s*\$2/);

      // id must be $1, organizationId must be $2.
      expect(params[0]).toBe(42);
      expect(params[1]).toBe("org-abc");
    });
  });
});

// PG-dependent suite: skip when POSTGRES_HOST is unset (e.g. the non-PG CI
// job, or local dev without docker compose). The pg-integration CI job sets
// it explicitly. Local opt-in: `POSTGRES_HOST=127.0.0.1 npm test`.
describe.skipIf(!process.env.POSTGRES_HOST)("createMemoryRepository", () => {
  beforeAll(async () => {
    await waitForPostgres();
  });

  beforeEach(async () => {
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
          uri: "file:///tmp/manual-note.md",
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
          uri: "file:///tmp/manual-note.md",
        },
      });
      expect(created.id).toBeGreaterThan(0);
      expect(created.sourceId).toBeGreaterThan(0);
      expect(created.summary).toContain("Always respond in Korean");
      expect(created.source.uri).toBe("file:///tmp/manual-note.md");
    } finally {
      await pool.end();
    }
  });

  it("rejects writes that omit source provenance", async () => {
    const pool = createPgPool({
      connectionString: testConnectionString,
    });

    try {
      await runMigrations(pool);
      const repository = createMemoryRepository(pool);

      await expect(
        repository.addMemory({
          scopeType: "project",
          scopeId: "project-alpha",
          projectKey: "project-alpha",
          memoryType: "fact",
          content: "This write should fail without provenance.",
          source: {
            scopeType: "project",
            scopeId: "project-alpha",
            sourceType: "document",
          },
          durability: "ephemeral",
          importance: 1,
        }),
      ).rejects.toThrow(/source provenance is required/i);
    } finally {
      await pool.end();
    }
  });

  it("preserves source metadata and reuses the same source on repeated writes", async () => {
    const pool = createPgPool({
      connectionString: testConnectionString,
    });

    try {
      await runMigrations(pool);
      const repository = createMemoryRepository(pool);

      const first = await repository.addMemory({
        scopeType: "project",
        scopeId: "project-alpha",
        projectKey: "project-alpha",
        memoryType: "decision",
        content: "Keep the original source metadata.",
        source: {
          scopeType: "project",
          scopeId: "project-alpha",
          sourceType: "document",
          sourceRef: "docs/adr-1.md",
          title: "ADR 1",
          uri: "file:///tmp/project-alpha/docs/adr-1.md",
        },
        durability: "durable",
        importance: 4,
      });

      const repeated = await repository.addMemory({
        scopeType: "project",
        scopeId: "project-alpha",
        projectKey: "project-alpha",
        memoryType: "fact",
        content: "Write another memory against the same source.",
        source: {
          scopeType: "project",
          scopeId: "project-alpha",
          sourceType: "document",
          sourceRef: "docs/adr-1.md",
        },
        durability: "durable",
        importance: 2,
      });

      const searched = await repository.searchMemory({
        query: "another memory",
        scopes: [{ scopeType: "project", scopeId: "project-alpha" }],
        limit: 10,
      });

      expect(repeated.sourceId).toBe(first.sourceId);
      expect(repeated.source.title).toBe("ADR 1");
      expect(repeated.source.uri).toBe(
        "file:///tmp/project-alpha/docs/adr-1.md",
      );
      expect(searched).toHaveLength(1);
      expect(searched[0]?.source).toMatchObject({
        title: "ADR 1",
        uri: "file:///tmp/project-alpha/docs/adr-1.md",
        sourceRef: "docs/adr-1.md",
      });
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

  it("hydrates canonical records by ids for retrieval assembly", async () => {
    const pool = createPgPool({
      connectionString: testConnectionString,
    });

    try {
      await runMigrations(pool);
      const repository = createMemoryRepository(pool);

      const first = await repository.addMemory({
        scopeType: "project",
        scopeId: "project-alpha",
        projectKey: "project-alpha",
        memoryType: "decision",
        content: "Decision: prefer project memory during retrieval.",
        source: {
          scopeType: "project",
          scopeId: "project-alpha",
          sourceType: "document",
          sourceRef: "adr-1.md",
          title: "ADR 1",
        },
        durability: "durable",
        importance: 4,
      });

      const second = await repository.addMemory({
        scopeType: "user",
        scopeId: "alice",
        projectKey: "project-alpha",
        memoryType: "fact",
        content: "Use ripgrep first.",
        source: {
          scopeType: "user",
          scopeId: "alice",
          sourceType: "document",
          sourceRef: "tooling.md",
          title: "Tooling",
        },
        durability: "ephemeral",
        importance: 1,
      });

      const hydrated = await repository.getMemoryRecordsByIds([
        second.id,
        first.id,
        999999,
      ]);

      expect(hydrated.map((record) => record.id)).toEqual([
        second.id,
        first.id,
      ]);
      expect(hydrated[0]).toMatchObject({
        scopeType: "user",
        source: {
          title: "Tooling",
        },
      });
      expect(hydrated[1]).toMatchObject({
        scopeType: "project",
        source: {
          title: "ADR 1",
        },
      });
    } finally {
      await pool.end();
    }
  });

});
