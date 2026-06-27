import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPgPool } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrate.js";
import { createMemoryRepository } from "../../src/store/memory-repository.js";
import { SecretDetectedError } from "../../src/store/secret-scrub.js";

type SqlQueryCall = { sql: string; params: unknown[] };

type EntityMentionRow = {
  kind: string;
  normalized: string;
  mention_text: string;
};

type EntityRelationshipRow = {
  relation_type: string;
  valid_from: string | null;
};

const postgresPort = process.env.POSTGRES_PORT ?? "5432";
const testDatabaseName = "memory_os_store_test";
const adminConnectionString =
  `postgres://memory:memory@127.0.0.1:${postgresPort}/postgres`;
const testConnectionString =
  `postgres://memory:memory@127.0.0.1:${postgresPort}/${testDatabaseName}`;
const exampleAwsAccessKey = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
const exampleGitHubToken = [
  "ghp",
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
].join("_");

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

function hydratedMemoryRow() {
  return {
    id: 42,
    organization_id: "org-a",
    scope_type: "project",
    scope_id: "proj-x",
    project_key: "proj-x",
    kind: "fact",
    title: "Before",
    content: "plain text only",
    summary: "before",
    durability: "durable",
    importance: 1,
    source_id: 9,
    created_at: "2026-06-26T00:00:00.000Z",
    updated_at: "2026-06-26T00:00:00.000Z",
    source_id_joined: 9,
    source_organization_id: "org-a",
    source_scope_type: "project",
    source_scope_id: "proj-x",
    source_type: "document",
    source_ref: "{\"sourceRef\":\"docs/a.md\",\"uri\":null}",
    source_title: "Doc A",
    source_created_at: "2026-06-26T00:00:00.000Z",
    tags: ["old"],
  };
}

async function expectUpdateSecretRejection(
  patch: { title?: string | null; content?: string; summary?: string | null },
  expectedCategories: string[],
): Promise<SqlQueryCall[]> {
  const clientQueryCalls: SqlQueryCall[] = [];
  const currentRow = hydratedMemoryRow();
  const mockClient = {
    query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
      clientQueryCalls.push({ sql, params: params ?? [] });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes("SELECT") && sql.includes("FROM memory_records mr")) {
        return Promise.resolve({ rows: [currentRow] });
      }
      if (sql.includes("UPDATE memory_records")) {
        return Promise.reject(new Error("UPDATE should not run"));
      }
      return Promise.resolve({ rows: [] });
    }),
    release: vi.fn(),
  };
  const mockPool = {
    connect: vi.fn().mockResolvedValue(mockClient),
  };
  const repo = createMemoryRepository(mockPool as never);

  let caught: unknown;
  try {
    await repo.updateMemoryRecord({
      id: 42,
      organizationId: "org-a",
      ...patch,
    });
  } catch (error: unknown) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(SecretDetectedError);
  expect((caught as SecretDetectedError).categories).toEqual(
    expect.arrayContaining(expectedCategories),
  );
  expect(
    clientQueryCalls.some(({ sql }) => sql.includes("UPDATE memory_records")),
  ).toBe(false);
  expect(clientQueryCalls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);

  return clientQueryCalls;
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

  it("upsertPostgresSource pushes sourceRef filter into SQL WHERE clause (PERF-5)", () => {
    // addMemory calls upsertPostgresSource via a transaction client.
    // The SELECT for an existing source must pass sourceRef as $5 and use
    // jsonb extraction so the DB filters — not JS — narrows the result set.
    const clientQueryCalls: { sql: string; params: unknown[] }[] = [];
    const mockClient = {
      query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
        clientQueryCalls.push({ sql, params: params ?? [] });
        // BEGIN / COMMIT return no rows; source SELECT returns empty (new insert path).
        return Promise.resolve({ rows: [] });
      }),
      release: vi.fn(),
    };
    const mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    };
    const repo = createMemoryRepository(mockPool as never);

    // We expect addMemory to throw because the INSERT RETURNING comes back
    // empty from the mock — that's fine; we only care about the SELECT shape.
    return repo
      .addMemory({
        scopeType: "project",
        scopeId: "proj-x",
        memoryType: "fact",
        content: "test content",
        source: {
          scopeType: "project",
          scopeId: "proj-x",
          sourceType: "document",
          sourceRef: "docs/spec.md",
        },
        durability: "ephemeral",
        importance: 0,
      })
      .catch(() => {
        // Find the source SELECT (has source_ref in WHERE).
        const sourceSelect = clientQueryCalls.find(({ sql }) =>
          sql.includes("FROM sources") && sql.includes("source_ref"),
        );

        expect(sourceSelect).toBeDefined();
        const { sql, params } = sourceSelect!;

        // Filter must use jsonb extraction — not a plain equality — so non-JSON
        // legacy rows don't cause a cast error.
        expect(sql).toMatch(/source_ref::jsonb->>'sourceRef'\s*=\s*\$5/);

        // $5 must be the sourceRef value itself.
        expect(params[4]).toBe("docs/spec.md");

        // SQL must include LIMIT 1 to avoid over-fetching.
        expect(sql).toMatch(/LIMIT\s+1/i);
      });
  });

  it("listMemory throws when organizationId is undefined and allowLegacyAnonymous is not set (SEC-read)", () => {
    const mockPool = { query: vi.fn() };
    const repo = createMemoryRepository(mockPool as never);

    return expect(
      repo.listMemory({ scopeType: "project", scopeId: "proj-x" }),
    ).rejects.toThrow(/organizationId/i);
  });

  it("listMemory throws when allowLegacyAnonymous is explicitly false (SEC-read)", () => {
    const mockPool = { query: vi.fn() };
    const repo = createMemoryRepository(mockPool as never);

    return expect(
      repo.listMemory(
        { scopeType: "project", scopeId: "proj-x" },
        { allowLegacyAnonymous: false },
      ),
    ).rejects.toThrow(/organizationId/i);
  });

  it("listMemory does not throw when allowLegacyAnonymous is true (SEC-read)", () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const repo = createMemoryRepository(mockPool as never);

    return expect(
      repo.listMemory(
        { scopeType: "project", scopeId: "proj-x" },
        { allowLegacyAnonymous: true },
      ),
    ).resolves.toEqual([]);
  });

  it("listMemory does not throw when organizationId is provided (SEC-read)", () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const repo = createMemoryRepository(mockPool as never);

    return expect(
      repo.listMemory(
        { scopeType: "project", scopeId: "proj-x" },
        { organizationId: "org-a" },
      ),
    ).resolves.toEqual([]);
  });

  it("getMemoryRecordsByIds throws when organizationId is undefined and allowLegacyAnonymous is not set (SEC-read)", () => {
    const mockPool = { query: vi.fn() };
    const repo = createMemoryRepository(mockPool as never);

    return expect(
      repo.getMemoryRecordsByIds([1, 2]),
    ).rejects.toThrow(/organizationId/i);
  });

  it("getMemoryRecordsByIds does not throw when allowLegacyAnonymous is true (SEC-read)", () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const repo = createMemoryRepository(mockPool as never);

    return expect(
      repo.getMemoryRecordsByIds([1, 2], undefined, true),
    ).resolves.toEqual([]);
  });

  it("getMemoryRecordsByIds does not throw when organizationId is provided (SEC-read)", () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const repo = createMemoryRepository(mockPool as never);

    return expect(
      repo.getMemoryRecordsByIds([1, 2], "org-a"),
    ).resolves.toEqual([]);
  });

  it("listMemory SQL includes a parameterized LIMIT (PERF-8)", () => {
    // listMemory is a browse/list operation: it must always emit a bounded
    // LIMIT so result sets can't grow without bound.
    const queryCalls: { sql: string; params: unknown[] }[] = [];
    const mockPool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        queryCalls.push({ sql, params });
        return Promise.resolve({ rows: [] });
      }),
    };
    const repo = createMemoryRepository(mockPool as never);

    return repo
      .listMemory({ scopeType: "project", scopeId: "proj-x" }, { allowLegacyAnonymous: true })
      .then(() => {
        expect(queryCalls).toHaveLength(1);
        const { sql, params } = queryCalls[0]!;

        // SQL must contain a parameterized LIMIT.
        expect(sql).toMatch(/LIMIT\s+\$\d+/i);

        // The LIMIT param must be a positive integer (the default cap).
        const limitParam = params.find(
          (p) => typeof p === "number" && p > 0,
        );
        expect(limitParam).toBeGreaterThan(0);
      });
  });

  it("listMemory excludes archived rows by default", async () => {
    const queryCalls: SqlQueryCall[] = [];
    const mockPool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        queryCalls.push({ sql, params });
        return Promise.resolve({ rows: [] });
      }),
    };
    const repo = createMemoryRepository(mockPool as never);

    await repo.listMemory(
      { scopeType: "project", scopeId: "proj-x" },
      { organizationId: "org-a" },
    );

    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0]?.sql).toContain("mr.durability <> 'archived'");
  });

  it("getMemoryRecordsByIds excludes archived rows during public hydration", async () => {
    const queryCalls: SqlQueryCall[] = [];
    const mockPool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        queryCalls.push({ sql, params });
        return Promise.resolve({ rows: [] });
      }),
    };
    const repo = createMemoryRepository(mockPool as never);

    await repo.getMemoryRecordsByIds([41, 42], "org-a");

    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0]?.sql).toContain("mr.durability <> 'archived'");
    expect(queryCalls[0]?.sql).toMatch(/mr\.organization_id = \$2/);
  });

  it("listMemoryForGovernance scopes by organization, joins tags for filtering, and excludes archived rows by default", async () => {
    const queryCalls: { sql: string; params: unknown[] }[] = [];
    const mockPool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        queryCalls.push({ sql, params });
        return Promise.resolve({ rows: [] });
      }),
    };
    const repo = createMemoryRepository(mockPool as never);

    await repo.listMemoryForGovernance(
      { scopeType: "project", scopeId: "proj-x" },
      {
        organizationId: "org-a",
        tag: "priority",
        limit: 25,
      },
    );

    expect(queryCalls).toHaveLength(1);
    const { sql, params } = queryCalls[0]!;
    expect(sql).toContain("JOIN memory_tags filter_tags");
    expect(sql).toMatch(/mr\.organization_id = \$3/);
    expect(sql).toContain("filter_tags.tag = $4");
    expect(sql).toContain("mr.durability <> 'archived'");
    expect(sql).toMatch(/LIMIT\s+\$5/i);
    expect(params).toEqual(["project", "proj-x", "org-a", "priority", 25]);
  });

  it("listMemoryForGovernance includes archived rows only when includeArchived is true", async () => {
    const queryCalls: SqlQueryCall[] = [];
    const mockPool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        queryCalls.push({ sql, params });
        return Promise.resolve({ rows: [] });
      }),
    };
    const repo = createMemoryRepository(mockPool as never);

    await repo.listMemoryForGovernance(
      { scopeType: "project", scopeId: "proj-x" },
      {
        organizationId: "org-a",
        includeArchived: true,
      },
    );

    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0]?.sql).not.toContain("mr.durability <> 'archived'");
  });

  it("inspectMemoryGraph scopes entity and relationship reads by org and memory scope", async () => {
    const queryCalls: SqlQueryCall[] = [];
    const mockPool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        queryCalls.push({ sql, params });
        if (sql.includes("FROM entities e")) {
          return Promise.resolve({
            rows: [
              {
                id: "91",
                organization_id: "org-a",
                kind: "code_symbol",
                normalized: "qdrant_snapshot_timeout",
                display_text: "QDRANT_SNAPSHOT_TIMEOUT",
                first_seen_at: "2026-06-26T00:00:00.000Z",
                last_seen_at: "2026-06-27T00:00:00.000Z",
                mention_count: "2",
                memory_ids: ["42", "41"],
              },
            ],
          });
        }

        return Promise.resolve({
          rows: [
            {
              id: "701",
              organization_id: "org-a",
              from_entity_id: "91",
              to_entity_id: "92",
              relation_type: "temporal_context",
              evidence_memory_record_id: "42",
              valid_from: "2026-06-26",
              valid_to: null,
              confidence: "0.8",
              created_at: "2026-06-27T00:00:00.000Z",
              from_kind: "code_symbol",
              from_normalized: "qdrant_snapshot_timeout",
              from_display_text: "QDRANT_SNAPSHOT_TIMEOUT",
              to_kind: "date",
              to_normalized: "2026-06-26",
              to_display_text: "2026-06-26",
            },
          ],
        });
      }),
    };
    const repo = createMemoryRepository(mockPool as never);

    const graph = await repo.inspectMemoryGraph(
      { scopeType: "project", scopeId: "proj-x" },
      {
        organizationId: "org-a",
        kind: "code_symbol",
        query: "QDRANT",
        limit: 25,
        relationshipLimit: 10,
      },
    );

    expect(graph.entities).toEqual([
      expect.objectContaining({
        id: 91,
        kind: "code_symbol",
        normalized: "qdrant_snapshot_timeout",
        mentionCount: 2,
        memoryIds: [42, 41],
      }),
    ]);
    expect(graph.relationships).toEqual([
      expect.objectContaining({
        id: 701,
        relationType: "temporal_context",
        evidenceMemoryRecordId: 42,
        validFrom: "2026-06-26",
        confidence: 0.8,
      }),
    ]);
    expect(queryCalls).toHaveLength(2);
    expect(queryCalls[0]?.sql).toContain("FROM entities e");
    expect(queryCalls[0]?.sql).toContain("JOIN memory_entity_mentions mem");
    expect(queryCalls[0]?.sql).toContain("mr.scope_type = $2");
    expect(queryCalls[0]?.sql).toContain("mr.scope_id = $3");
    expect(queryCalls[0]?.sql).toContain("e.kind = $4");
    expect(queryCalls[0]?.sql).toContain("e.normalized ILIKE $5");
    expect(queryCalls[0]?.sql).toContain("mr.durability <> 'archived'");
    expect(queryCalls[0]?.params).toEqual([
      "org-a",
      "project",
      "proj-x",
      "code_symbol",
      "%QDRANT%",
      25,
    ]);
    expect(queryCalls[1]?.sql).toContain("FROM entity_relationships er");
    expect(queryCalls[1]?.sql).toContain("er.organization_id = $1");
    expect(queryCalls[1]?.params).toEqual([
      "org-a",
      "project",
      "proj-x",
      [91],
      10,
    ]);
  });

  it("updateMemoryRecord scopes the update by org and replaces tags in the same transaction", async () => {
    const clientQueryCalls: { sql: string; params: unknown[] }[] = [];
    let hydrationReads = 0;
    const currentRow = {
      id: 42,
      organization_id: "org-a",
      scope_type: "project",
      scope_id: "proj-x",
      project_key: "proj-x",
      kind: "fact",
      title: "Before",
      content: "plain text only",
      summary: "before",
      durability: "durable",
      importance: 1,
      source_id: 9,
      created_at: "2026-06-26T00:00:00.000Z",
      updated_at: "2026-06-26T00:00:00.000Z",
      source_id_joined: 9,
      source_organization_id: "org-a",
      source_scope_type: "project",
      source_scope_id: "proj-x",
      source_type: "document",
      source_ref: "{\"sourceRef\":\"docs/a.md\",\"uri\":null}",
      source_title: "Doc A",
      source_created_at: "2026-06-26T00:00:00.000Z",
      tags: ["old"],
    };
    const updatedRow = {
      ...currentRow,
      title: "After",
      content: "still plain text",
      summary: "after",
      updated_at: "2026-06-26T00:00:01.000Z",
      tags: ["fresh", "urgent"],
    };
    const mockClient = {
      query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
        clientQueryCalls.push({ sql, params: params ?? [] });
        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes("SELECT") && sql.includes("FROM memory_records mr") && sql.includes("WHERE mr.id = $1")) {
          hydrationReads += 1;
          return Promise.resolve({
            rows: [hydrationReads === 1 ? currentRow : updatedRow],
          });
        }
        if (sql.includes("UPDATE memory_records")) {
          return Promise.resolve({
            rows: [{
              id: 42,
              organization_id: "org-a",
              scope_type: "project",
              scope_id: "proj-x",
              project_key: "proj-x",
              kind: "fact",
              title: "After",
              content: "still plain text",
              summary: "after",
              durability: "durable",
              importance: 4,
              source_id: 9,
              created_at: "2026-06-26T00:00:00.000Z",
              updated_at: "2026-06-26T00:00:01.000Z",
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
      release: vi.fn(),
    };
    const mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    };
    const repo = createMemoryRepository(mockPool as never);

    const updated = await repo.updateMemoryRecord({
      id: 42,
      organizationId: "org-a",
      title: "After",
      content: "still plain text",
      summary: "after",
      importance: 4,
      tags: ["urgent", "fresh"],
    });

    const updateCall = clientQueryCalls.find(({ sql }) =>
      sql.includes("UPDATE memory_records"),
    );
    const deleteTagsCall = clientQueryCalls.find(({ sql }) =>
      sql.includes("DELETE FROM memory_tags"),
    );
    const insertTagsCall = clientQueryCalls.find(({ sql }) =>
      sql.includes("INSERT INTO memory_tags"),
    );
    const deleteRelationshipsCall = clientQueryCalls.find(({ sql }) =>
      sql.includes("DELETE FROM entity_relationships"),
    );
    const deleteMentionsCall = clientQueryCalls.find(({ sql }) =>
      sql.includes("DELETE FROM memory_entity_mentions"),
    );

    expect(updateCall?.sql).toMatch(/WHERE id = \$1\s+AND organization_id = \$2/s);
    expect(updateCall?.sql).toContain("updated_at = NOW()");
    expect(deleteTagsCall?.sql).toMatch(/organization_id = \$2/);
    expect(insertTagsCall?.params).toEqual([42, "org-a", "fresh", 42, "org-a", "urgent"]);
    expect(deleteRelationshipsCall?.sql).toMatch(/organization_id = \$2/);
    expect(deleteMentionsCall?.sql).toMatch(/organization_id = \$2/);
    expect(updated).toMatchObject({
      id: 42,
      tags: ["fresh", "urgent"],
      updatedAt: "2026-06-26T00:00:01.000Z",
    });
  });

  it("updateMemoryRecord rejects secret-shaped content before persistence", async () => {
    await expectUpdateSecretRejection(
      { content: `Rotate AWS key ${exampleAwsAccessKey} immediately.` },
      ["aws-access-key"],
    );
  });

  it("updateMemoryRecord rejects secret-shaped titles before persistence", async () => {
    await expectUpdateSecretRejection(
      { title: `Leaked token ${exampleGitHubToken}` },
      ["github-token"],
    );
  });

  it("updateMemoryRecord rejects secret-shaped summaries before persistence", async () => {
    await expectUpdateSecretRejection(
      { summary: "Stripe key " + ["sk", "live", "aaaaaaaaaaaaaaaaaaaaaaaa"].join("_") },
      ["stripe-key"],
    );
  });

  it("updateMemoryRecord reports categories across multiple updated fields", async () => {
    await expectUpdateSecretRejection(
      {
        title: `Rotate ${exampleAwsAccessKey} today`,
        summary: `GitHub token ${exampleGitHubToken}`,
      },
      ["aws-access-key", "github-token"],
    );
  });

  it("archiveMemoryRecord scopes by org and returns qdrant point ids to delete", async () => {
    const queryCalls: { sql: string; params: unknown[] }[] = [];
    const mockPool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        queryCalls.push({ sql, params });
        return Promise.resolve({
          rows: [{
            archived: true,
            found: true,
            qdrant_point_ids: ["chunk:1", "chunk:2"],
          }],
        });
      }),
    };
    const repo = createMemoryRepository(mockPool as never);

    const archived = await repo.archiveMemoryRecord({
      id: 55,
      organizationId: "org-a",
    });

    expect(queryCalls).toHaveLength(1);
    const { sql, params } = queryCalls[0]!;
    expect(sql).toContain("SET durability = 'archived'");
    expect(sql).toMatch(/organization_id = \$2/);
    expect(sql).toContain("WITH target AS");
    expect(sql).toContain("array_agg(mc.qdrant_point_id)");
    expect(sql).toContain("FROM target");
    expect(params).toEqual([55, "org-a"]);
    expect(archived).toEqual({
      archived: true,
      qdrantPointIds: ["chunk:1", "chunk:2"],
    });
  });

  it("archiveMemoryRecord returns point ids with archived false when the row is already archived", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          archived: false,
          found: true,
          qdrant_point_ids: ["chunk:1", "chunk:2"],
        }],
      }),
    };
    const repo = createMemoryRepository(mockPool as never);

    await expect(
      repo.archiveMemoryRecord({ id: 55, organizationId: "org-a" }),
    ).resolves.toEqual({
      archived: false,
      qdrantPointIds: ["chunk:1", "chunk:2"],
    });
  });

  it("archiveMemoryRecord returns an empty not-archived result when no row matches", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          archived: false,
          found: false,
          qdrant_point_ids: [],
        }],
      }),
    };
    const repo = createMemoryRepository(mockPool as never);

    await expect(
      repo.archiveMemoryRecord({ id: 55, organizationId: "org-a" }),
    ).resolves.toEqual({
      archived: false,
      qdrantPointIds: [],
    });
  });

  it("searchMemory tokenizes query terms into parameterized lexical OR clauses", async () => {
    const queryCalls: { sql: string; params: unknown[] }[] = [];
    const mockPool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        queryCalls.push({ sql, params });
        return Promise.resolve({ rows: [] });
      }),
    };
    const repo = createMemoryRepository(mockPool as never);

    await repo.searchMemory({
      query: "timeout retry backoff",
      scopes: [{ scopeType: "project", scopeId: "proj-x" }],
      organizationId: "org-a",
      limit: 5,
    });

    expect(queryCalls).toHaveLength(1);
    const { sql, params } = queryCalls[0]!;

    expect(sql).toContain("websearch_to_tsquery('simple', $1)");
    expect(sql).toContain("mr.search_vector @@ lexical.query");
    expect(sql).toContain("ts_rank_cd(mr.search_vector, lexical.query, 32)");
    expect(sql).toContain("ILIKE $2");
    expect(sql).toContain(" OR ");
    expect(sql).toMatch(/ORDER BY \(.+\) DESC, mr\.id DESC/s);
    expect(params).toEqual(
      expect.arrayContaining([
        "timeout retry backoff",
        "%timeout retry backoff%",
        "%timeout%",
        "%retry%",
        "%backoff%",
        "project",
        "proj-x",
        "org-a",
        5,
      ]),
    );
  });

  it("searchMemory excludes archived rows by default", async () => {
    const queryCalls: SqlQueryCall[] = [];
    const mockPool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        queryCalls.push({ sql, params });
        return Promise.resolve({ rows: [] });
      }),
    };
    const repo = createMemoryRepository(mockPool as never);

    await repo.searchMemory({
      query: "timeout retry",
      scopes: [{ scopeType: "project", scopeId: "proj-x" }],
      organizationId: "org-a",
      limit: 5,
    });

    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0]?.sql).toContain("mr.durability <> 'archived'");
  });

  it("searchMemory adds entity graph rescue clauses for deterministic mentions", async () => {
    const queryCalls: { sql: string; params: unknown[] }[] = [];
    const mockPool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        queryCalls.push({ sql, params });
        return Promise.resolve({ rows: [] });
      }),
    };
    const repo = createMemoryRepository(mockPool as never);

    await repo.searchMemory({
      query: "QDRANT_SNAPSHOT_TIMEOUT docs/operations.md",
      scopes: [{ scopeType: "project", scopeId: "proj-x" }],
      organizationId: "org-a",
      limit: 5,
    });

    expect(queryCalls).toHaveLength(1);
    const { sql, params } = queryCalls[0]!;

    expect(sql).toContain("FROM memory_entity_mentions mem");
    expect(sql).toContain("JOIN entities e ON e.id = mem.entity_id");
    expect(sql).toContain("mem.memory_record_id = mr.id");
    expect(sql).toContain("e.kind = $");
    expect(sql).toContain("e.normalized = $");
    expect(sql).toMatch(/CASE WHEN\s+EXISTS[\s\S]+THEN 3 ELSE 0 END/);
    expect(params).toEqual(
      expect.arrayContaining([
        "code_symbol",
        "qdrant_snapshot_timeout",
        "path",
        "docs/operations.md",
      ]),
    );
  });

  it("searchMemory returns no rows for an empty lexical query", async () => {
    const mockPool = { query: vi.fn() };
    const repo = createMemoryRepository(mockPool as never);

    await expect(
      repo.searchMemory({
        query: "   ",
        scopes: [{ scopeType: "project", scopeId: "proj-x" }],
        limit: 5,
      }),
    ).resolves.toEqual([]);
    expect(mockPool.query).not.toHaveBeenCalled();
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

  it("persists entity mentions and temporal relationships in the write transaction", async () => {
    const pool = createPgPool({
      connectionString: testConnectionString,
    });

    try {
      await runMigrations(pool);
      const repository = createMemoryRepository(pool);

      const created = await repository.addMemory({
        organizationId: "org-graph",
        scopeType: "project",
        scopeId: "project-alpha",
        projectKey: "project-alpha",
        memoryType: "fact",
        title: "Snapshot timeout",
        content:
          "Set QDRANT_SNAPSHOT_TIMEOUT in docs/operations.md on 2026-06-26.",
        source: {
          scopeType: "project",
          scopeId: "project-alpha",
          sourceType: "document",
          sourceRef: "docs/operations.md",
          title: "Operations",
        },
        durability: "durable",
        importance: 3,
      });

      const mentions = await pool.query<EntityMentionRow>(
        `
          SELECT e.kind, e.normalized, mem.mention_text
          FROM memory_entity_mentions mem
          JOIN entities e ON e.id = mem.entity_id
          WHERE mem.memory_record_id = $1
            AND mem.organization_id = $2
          ORDER BY e.kind, e.normalized
        `,
        [created.id, "org-graph"],
      );
      const relationships = await pool.query<EntityRelationshipRow>(
        `
          SELECT relation_type, valid_from::text
          FROM entity_relationships
          WHERE evidence_memory_record_id = $1
            AND organization_id = $2
          ORDER BY relation_type, valid_from NULLS FIRST
        `,
        [created.id, "org-graph"],
      );
      const searched = await repository.searchMemory({
        organizationId: "org-graph",
        query: "QDRANT_SNAPSHOT_TIMEOUT docs/operations.md",
        scopes: [{ scopeType: "project", scopeId: "project-alpha" }],
        limit: 10,
      });
      const graph = await repository.inspectMemoryGraph(
        { scopeType: "project", scopeId: "project-alpha" },
        {
          organizationId: "org-graph",
          kind: "code_symbol",
          query: "QDRANT",
          limit: 10,
          relationshipLimit: 10,
        },
      );

      expect(mentions.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "code_symbol",
            normalized: "qdrant_snapshot_timeout",
          }),
          expect.objectContaining({
            kind: "date",
            normalized: "2026-06-26",
          }),
          expect.objectContaining({
            kind: "path",
            normalized: "docs/operations.md",
          }),
        ]),
      );
      expect(relationships.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            relation_type: "co_mentions",
            valid_from: null,
          }),
          expect.objectContaining({
            relation_type: "temporal_context",
            valid_from: "2026-06-26",
          }),
        ]),
      );
      expect(searched.map((record) => record.id)).toContain(created.id);
      expect(graph.entities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "code_symbol",
            normalized: "qdrant_snapshot_timeout",
            mentionCount: 1,
            memoryIds: [created.id],
          }),
        ]),
      );
      expect(graph.relationships).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            relationType: "temporal_context",
            evidenceMemoryRecordId: created.id,
            validFrom: "2026-06-26",
          }),
        ]),
      );
    } finally {
      await pool.end();
    }
  });

  it("updates one memory with fresh tags and entity rows without leaving stale mentions behind", async () => {
    const pool = createPgPool({
      connectionString: testConnectionString,
    });

    try {
      await runMigrations(pool);
      const repository = createMemoryRepository(pool);

      const created = await repository.addMemory({
        organizationId: "org-governance",
        scopeType: "project",
        scopeId: "project-alpha",
        projectKey: "project-alpha",
        memoryType: "fact",
        title: "Initial note",
        content: "Set QDRANT_TIMEOUT in docs/ops.md on 2026-06-26.",
        source: {
          scopeType: "project",
          scopeId: "project-alpha",
          sourceType: "document",
          sourceRef: "docs/ops.md",
          title: "Ops",
        },
        durability: "durable",
        importance: 1,
      });

      const beforeUpdatedAt = created.updatedAt;
      const staleMentions = await pool.query<EntityMentionRow>(
        `
          SELECT e.kind, e.normalized, mem.mention_text
          FROM memory_entity_mentions mem
          JOIN entities e ON e.id = mem.entity_id
          WHERE mem.memory_record_id = $1
            AND mem.organization_id = $2
          ORDER BY e.kind, e.normalized
        `,
        [created.id, "org-governance"],
      );
      expect(staleMentions.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "code_symbol",
            normalized: "qdrant_timeout",
          }),
        ]),
      );

      const updated = await repository.updateMemoryRecord({
        id: created.id,
        organizationId: "org-governance",
        title: "Retuned timeout",
        content: "Set OPENAI_TIMEOUT in docs/runbook.md on 2026-07-01.",
        summary: "Retuned timeout settings.",
        importance: 4,
        tags: ["urgent", "ops"],
      });

      const hydrated = await repository.getMemoryRecordById(
        created.id,
        "org-governance",
      );
      const afterMentions = await pool.query<EntityMentionRow>(
        `
          SELECT e.kind, e.normalized, mem.mention_text
          FROM memory_entity_mentions mem
          JOIN entities e ON e.id = mem.entity_id
          WHERE mem.memory_record_id = $1
            AND mem.organization_id = $2
          ORDER BY e.kind, e.normalized
        `,
        [created.id, "org-governance"],
      );
      const storedTags = await pool.query<{ tag: string }>(
        `
          SELECT tag
          FROM memory_tags
          WHERE memory_record_id = $1
            AND organization_id = $2
          ORDER BY tag
        `,
        [created.id, "org-governance"],
      );

      expect(updated).not.toBeNull();
      expect(updated?.updatedAt).not.toBe(beforeUpdatedAt);
      expect(updated).toMatchObject({
        title: "Retuned timeout",
        importance: 4,
        tags: ["ops", "urgent"],
      });
      expect(hydrated?.tags).toEqual(["ops", "urgent"]);
      expect(storedTags.rows.map((row) => row.tag)).toEqual(["ops", "urgent"]);
      expect(afterMentions.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "code_symbol",
            normalized: "openai_timeout",
          }),
          expect.objectContaining({
            kind: "path",
            normalized: "docs/runbook.md",
          }),
          expect.objectContaining({
            kind: "date",
            normalized: "2026-07-01",
          }),
        ]),
      );
      expect(afterMentions.rows).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            normalized: "qdrant_timeout",
          }),
          expect.objectContaining({
            normalized: "docs/ops.md",
          }),
        ]),
      );
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

      const listed = await repository.listMemory(
        { scopeType: "project", scopeId: "project-alpha" },
        { allowLegacyAnonymous: true },
      );
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

      const hydrated = await repository.getMemoryRecordsByIds(
        [second.id, first.id, 999999],
        undefined,
        true,
      );

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
