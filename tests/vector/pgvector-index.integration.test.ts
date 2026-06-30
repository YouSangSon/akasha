// Integration test for the pgvector adapter.
//
// Gate: only runs when PGVECTOR_TEST_URL is set (e.g. pointing at the Docker
// pgvector/pgvector:pg16 container). Without it the suite is skipped, keeping
// the normal `npm test` run green in environments without pgvector.
//
// To run locally:
//   docker run -d --name cf-pgv -e POSTGRES_PASSWORD=test -e POSTGRES_DB=memtest \
//     -p 55432:5432 pgvector/pgvector:pg16
//   PGVECTOR_TEST_URL=postgres://postgres:test@127.0.0.1:55432/memtest \
//     npx vitest run tests/vector/pgvector-index.integration.test.ts

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPgPool } from "../../src/db/connection.js";
import { createPgVectorIndex } from "../../src/vector/pgvector-index.js";
import type { VectorFilter, VectorPoint } from "../../src/vector/vector-index.js";
import { runMigrations } from "../../src/db/migrate.js";
import { createIngestJobRepository } from "../../src/jobs/ingest-job-repository.js";
import { createMemoryChunkRepository } from "../../src/store/canonical-indexing.js";
import { runIngestSweep } from "../../src/compact/ingest-sweeper.js";
import type { PgPool } from "../../src/db/connection.js";

const TEST_URL = process.env.PGVECTOR_TEST_URL;

function makeMockPool(): { pool: PgPool; query: ReturnType<typeof vi.fn> } {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const pool = {
    query,
    connect: vi.fn(),
    end: vi.fn(),
  } as unknown as PgPool;

  return { pool, query };
}

// Helper: cosine similarity between two equal-length vectors.
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Helper: build a normalised unit vector of `dims` dimensions, with the primary
// signal in the first `dims` coordinates spread as given by `coords`.
function makeVec(dims: number, coords: number[]): number[] {
  const v = new Array<number>(dims).fill(0);
  for (let i = 0; i < coords.length && i < dims; i++) {
    v[i] = coords[i];
  }
  // Normalise to unit length.
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? v : v.map((x) => x / norm);
}

describe("pgvector adapter — deleteByRecordIds SQL shape", () => {
  it("upsert rejects whitespace-only point organization_id before opening a client", async () => {
    const { pool, query } = makeMockPool();
    const connect = vi.mocked(pool.connect);
    const index = createPgVectorIndex(pool, { tableName: "memory_vectors_test" });

    await expect(
      index.upsert([
        {
          id: "chunk:blank-org",
          vector: [0.1, 0.2, 0.3],
          payload: {
            memory_record_id: 9,
            organization_id: " \n\t ",
          },
        },
      ]),
    ).rejects.toThrow(/organizationId|organization_id/);

    expect(connect).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("upsert rejects non-string point organization_id before opening a client", async () => {
    const { pool, query } = makeMockPool();
    const connect = vi.mocked(pool.connect);
    const index = createPgVectorIndex(pool, { tableName: "memory_vectors_test" });

    await expect(
      index.upsert([
        {
          id: "chunk:number-org",
          vector: [0.1, 0.2, 0.3],
          payload: {
            memory_record_id: 9,
            organization_id: 123,
          },
        },
      ]),
    ).rejects.toThrow(/organization_id/);

    expect(connect).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("query treats empty organizationId as legacy unscoped lookup", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = {
      query,
      release: vi.fn(),
    };
    const pool = {
      query: vi.fn(),
      connect: vi.fn().mockResolvedValue(client),
      end: vi.fn(),
    } as unknown as PgPool;
    const index = createPgVectorIndex(pool, { tableName: "memory_vectors_test" });

    await expect(
      index.query(
        [0.1, 0.2, 0.3],
        {
          organizationId: "",
          scopes: [{ scopeType: "project", scopeId: "project-alpha" }],
          projectKey: "project-alpha",
        },
        5,
      ),
    ).resolves.toEqual([]);

    expect(pool.connect).toHaveBeenCalledOnce();

    const selectCall = query.mock.calls.find(([sql]) =>
      typeof sql === "string" && sql.includes("FROM memory_vectors_test")
    );
    expect(selectCall).toBeDefined();

    const [sql, params] = selectCall as [string, unknown[]];
    expect(sql).not.toContain("organization_id =");
    expect(params).toEqual(["[0.1,0.2,0.3]", "project", "project-alpha", 5]);
  });

  it("query rejects whitespace-only organizationId before opening a client", async () => {
    const { pool, query } = makeMockPool();
    const connect = vi.mocked(pool.connect);
    const index = createPgVectorIndex(pool, { tableName: "memory_vectors_test" });

    await expect(
      index.query(
        [0.1, 0.2, 0.3],
        {
          organizationId: " \n\t ",
          scopes: [{ scopeType: "project", scopeId: "project-alpha" }],
          projectKey: "project-alpha",
        },
        5,
      ),
    ).rejects.toThrow(/organizationId/);

    expect(connect).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("deletes by record id only when no organizationId is supplied", async () => {
    const { pool, query } = makeMockPool();
    const index = createPgVectorIndex(pool, { tableName: "memory_vectors_test" });

    await index.deleteByRecordIds([101, 202]);

    expect(query).toHaveBeenCalledWith(
      "DELETE FROM memory_vectors_test WHERE memory_record_id = ANY($1)",
      [[101, 202]],
    );
  });

  it("treats empty organizationId as legacy unscoped deleteByRecordIds", async () => {
    const { pool, query } = makeMockPool();
    const index = createPgVectorIndex(pool, { tableName: "memory_vectors_test" });

    await index.deleteByRecordIds([101, 202], { organizationId: "" });

    expect(query).toHaveBeenCalledWith(
      "DELETE FROM memory_vectors_test WHERE memory_record_id = ANY($1)",
      [[101, 202]],
    );
  });

  it("adds organization_id predicate when organizationId is supplied", async () => {
    const { pool, query } = makeMockPool();
    const index = createPgVectorIndex(pool, { tableName: "memory_vectors_test" });

    await index.deleteByRecordIds([101, 202], { organizationId: "org-a" });

    expect(query).toHaveBeenCalledWith(
      "DELETE FROM memory_vectors_test WHERE memory_record_id = ANY($1) AND organization_id = $2",
      [[101, 202], "org-a"],
    );
  });

  it("deleteByRecordIds rejects whitespace-only organizationId before SQL", async () => {
    const { pool, query } = makeMockPool();
    const index = createPgVectorIndex(pool, { tableName: "memory_vectors_test" });

    await expect(
      index.deleteByRecordIds([101], { organizationId: " \n\t " }),
    ).rejects.toThrow(/organizationId/);

    expect(query).not.toHaveBeenCalled();
  });

  it("deleteByRecordIds rejects non-string organizationId before SQL", async () => {
    const { pool, query } = makeMockPool();
    const index = createPgVectorIndex(pool, { tableName: "memory_vectors_test" });

    await expect(
      index.deleteByRecordIds([101], { organizationId: 123 } as never),
    ).rejects.toThrow("organizationId must be a string");

    expect(query).not.toHaveBeenCalled();
  });
});

describe.skipIf(!TEST_URL)("pgvector adapter — integration against real pgvector", () => {
  const TABLE = "test_memory_vectors";
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const pool = createPgPool({ connectionString: TEST_URL! });
  const index = createPgVectorIndex(pool, { tableName: TABLE });

  beforeAll(async () => {
    // Wait for Postgres to be ready (it may still be starting after docker run).
    let lastErr: unknown;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        await pool.query("SELECT 1");
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (lastErr !== undefined) {
      // If we exhausted retries without connecting, surface the error.
      // We check by trying one more time and letting it throw.
      await pool.query("SELECT 1");
    }

    // HIGH 3 fix: ensureCollection no longer creates the extension (requires
    // superuser). In the Docker test container we ARE superuser — create it
    // here so the tests can proceed. In production a DB admin does this once.
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector");

    await index.ensureCollection(3);
  });

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${TABLE}`);
    await pool.end();
  });

  beforeEach(async () => {
    // TRUNCATE between tests so stale rows don't corrupt ranking assertions.
    // ensureCollection is IF-NOT-EXISTS, so it won't reset rows.
    await pool.query(`TRUNCATE ${TABLE}`);
  });

  // ── Test 1: schema + HNSW index created ──────────────────────────────────

  it("creates the vector extension, table, and HNSW index", async () => {
    // Extension
    const extResult = await pool.query<{ extname: string }>(
      "SELECT extname FROM pg_extension WHERE extname = 'vector'",
    );
    expect(extResult.rows).toHaveLength(1);
    expect(extResult.rows[0].extname).toBe("vector");

    // Table
    const tableResult = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_name = $1",
      [TABLE],
    );
    expect(tableResult.rows).toHaveLength(1);

    // HNSW index
    const idxResult = await pool.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE tablename = $1 AND indexdef ILIKE '%hnsw%'",
      [TABLE],
    );
    expect(idxResult.rows.length).toBeGreaterThanOrEqual(1);

    // HIGH 1(a): Composite BTree indexes
    const btreeResult = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = $1 AND indexdef NOT ILIKE '%hnsw%' AND indexdef ILIKE '%organization_id%'`,
      [TABLE],
    );
    expect(btreeResult.rows.length).toBeGreaterThanOrEqual(2);
  });

  // ── Test 2: upsert + ranked query ────────────────────────────────────────

  it("returns points ordered by cosine similarity (nearest first), with score = 1 - distance", async () => {
    // Three 3-dim unit-ish vectors.
    const vA = [1, 0, 0];
    const vB = [0, 1, 0];
    const vC = [0, 0, 1];

    await index.upsert([
      {
        id: "chunk:1",
        vector: vA,
        payload: { memory_record_id: 1, organization_id: "org-a", scope_type: "project", scope_id: null, project_key: "proj", kind: "fact" },
      },
      {
        id: "chunk:2",
        vector: vB,
        payload: { memory_record_id: 2, organization_id: "org-a", scope_type: "project", scope_id: null, project_key: "proj", kind: "fact" },
      },
      {
        id: "chunk:3",
        vector: vC,
        payload: { memory_record_id: 3, organization_id: "org-a", scope_type: "project", scope_id: null, project_key: "proj", kind: "fact" },
      },
    ]);

    // Probe: closest to vA, then vB, then vC.
    const probe = [0.9, 0.3, 0.1];
    const filter: VectorFilter = {
      organizationId: "org-a",
      scopes: [{ scopeType: "project", scopeId: "proj" }],
      projectKey: "proj",
    };

    const hits = await index.query(probe, filter, 3);

    // Assert ranked order by hand-computed cosine similarity.
    const simA = cosineSimilarity(probe, vA);
    const simB = cosineSimilarity(probe, vB);
    const simC = cosineSimilarity(probe, vC);

    // Expected order: A > B > C
    expect(simA).toBeGreaterThan(simB);
    expect(simB).toBeGreaterThan(simC);

    expect(hits).toHaveLength(3);
    expect(hits[0].id).toBe("chunk:1");
    expect(hits[1].id).toBe("chunk:2");
    expect(hits[2].id).toBe("chunk:3");

    // Score semantics: score ≈ cosine similarity (= 1 - distance).
    expect(hits[0].score).toBeCloseTo(simA, 5);
    expect(hits[1].score).toBeCloseTo(simB, 5);
    expect(hits[2].score).toBeCloseTo(simC, 5);

    // Scores decrease monotonically (nearest first).
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
    expect(hits[1].score).toBeGreaterThan(hits[2].score);
  });

  // ── Test 3: multi-tenant isolation ───────────────────────────────────────

  it("filters by organization_id — org-a query returns only org-a points (SEC-1 analog)", async () => {
    // Same scope_id for both orgs — the vector filter must isolate by org.
    await index.upsert([
      {
        id: "chunk:10",
        vector: [1, 0, 0],
        payload: { memory_record_id: 10, organization_id: "org-a", scope_type: "user", scope_id: "alice", project_key: null, kind: "fact" },
      },
      {
        id: "chunk:11",
        vector: [0.99, 0.1, 0],
        payload: { memory_record_id: 11, organization_id: "org-b", scope_type: "user", scope_id: "alice", project_key: null, kind: "fact" },
      },
    ]);

    const filterOrgA: VectorFilter = {
      organizationId: "org-a",
      scopes: [{ scopeType: "user", scopeId: "alice" }],
      projectKey: null,
    };

    const hits = await index.query([1, 0, 0], filterOrgA, 10);

    const ids = hits.map((h) => h.id);
    expect(ids).toContain("chunk:10");
    expect(ids).not.toContain("chunk:11");
  });

  // ── Test 4: delete removes points ────────────────────────────────────────

  it("delete removes the specified points and leaves others intact", async () => {
    await index.upsert([
      {
        id: "chunk:20",
        vector: [1, 0, 0],
        payload: { memory_record_id: 20, organization_id: "org-a", scope_type: "project", scope_id: null, project_key: "p", kind: "fact" },
      },
      {
        id: "chunk:21",
        vector: [0, 1, 0],
        payload: { memory_record_id: 21, organization_id: "org-a", scope_type: "project", scope_id: null, project_key: "p", kind: "fact" },
      },
    ]);

    await index.delete(["chunk:20"]);

    const filter: VectorFilter = {
      organizationId: "org-a",
      scopes: [{ scopeType: "project", scopeId: "p" }],
      projectKey: "p",
    };
    const hits = await index.query([1, 0, 0], filter, 10);

    const ids = hits.map((h) => h.id);
    expect(ids).not.toContain("chunk:20");
    expect(ids).toContain("chunk:21");
  });

  // ── Test 5: upsert is idempotent (ON CONFLICT DO UPDATE) ─────────────────

  it("upsert is idempotent — re-inserting the same point_id updates it", async () => {
    await index.upsert([
      {
        id: "chunk:30",
        vector: [1, 0, 0],
        payload: { memory_record_id: 30, organization_id: "org-a", scope_type: "project", scope_id: null, project_key: "p", kind: "fact" },
      },
    ]);
    // Re-upsert with updated vector.
    await index.upsert([
      {
        id: "chunk:30",
        vector: [0, 1, 0],
        payload: { memory_record_id: 30, organization_id: "org-a", scope_type: "project", scope_id: null, project_key: "p", kind: "decision" },
      },
    ]);

    const result = await pool.query<{ kind: string; embedding: string }>(
      `SELECT kind, embedding::text FROM ${TABLE} WHERE point_id = $1`,
      ["chunk:30"],
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].kind).toBe("decision");
  });

  // ── Test 6: memory_record_id returned as Number, not string ──────────────

  it("payload.memory_record_id is a Number (not a string) to match Qdrant path parity", async () => {
    await index.upsert([
      {
        id: "chunk:40",
        vector: [1, 0, 0],
        payload: { memory_record_id: 42, organization_id: "org-a", scope_type: "project", scope_id: null, project_key: "p", kind: "fact" },
      },
    ]);

    const filter: VectorFilter = {
      organizationId: "org-a",
      scopes: [{ scopeType: "project", scopeId: "p" }],
      projectKey: "p",
    };
    const hits = await index.query([1, 0, 0], filter, 1);

    expect(hits).toHaveLength(1);
    expect(typeof hits[0].payload.memory_record_id).toBe("number");
    expect(hits[0].payload.memory_record_id).toBe(42);
  });

  // ── Test 7: HIGH 1 — small-tenant recall at scale ────────────────────────
  //
  // Reproduces the HNSW post-filter recall hole:
  //   - 2000 "big-org" rows are inserted with vectors clustered tightly near
  //     the probe direction [1, 0, 0]. They occupy the global top-ef_search
  //     (default 40) candidates.
  //   - "org-small" has 5 rows far from the probe — would fall outside the
  //     global top-ef_search without the fix, yielding 0 results.
  //   - With fix: composite BTree lets planner do an exact filtered scan for
  //     the selective small tenant; iterative_scan is the safety net.
  //   - Assertion: querying as org-small returns exactly its 5 nearest points
  //     in correct ranked order (NOT 0 results).
  //
  // This test table uses 3 dimensions to stay fast; the recall problem is
  // dimension-agnostic (it's a candidate-count issue, not a dim issue).

  it("HIGH 1 scale: small-tenant with 5 rows returns correct neighbors despite 2000 other-org rows near the probe", async () => {
    // The probe direction.
    const probeVec = [1, 0, 0];

    // 2000 big-org rows clustered tightly near the probe — they dominate
    // the HNSW top-ef_search global candidates.
    const bigOrgPoints: VectorPoint[] = [];
    for (let i = 0; i < 2000; i++) {
      // Slightly perturbed probe direction, normalised.
      const noise = (i % 100) / 10000; // tiny: 0..0.0099
      bigOrgPoints.push({
        id: `big:${i}`,
        vector: makeVec(3, [1 - noise, noise, 0]),
        payload: {
          memory_record_id: 1000 + i,
          organization_id: "org-big",
          scope_type: "user",
          scope_id: "user-big",
          project_key: null,
          kind: "fact",
        },
      });
    }

    // 5 org-small rows placed far from the probe (near [0,0,1] direction).
    // Without the fix, HNSW never surfaces them in top-40 global candidates.
    const smallOrgPoints: VectorPoint[] = [
      { id: "small:0", vector: makeVec(3, [0.1, 0.2, 0.97]), payload: { memory_record_id: 5000, organization_id: "org-small", scope_type: "user", scope_id: "user-small", project_key: null, kind: "fact" } },
      { id: "small:1", vector: makeVec(3, [0.05, 0.15, 0.98]), payload: { memory_record_id: 5001, organization_id: "org-small", scope_type: "user", scope_id: "user-small", project_key: null, kind: "fact" } },
      { id: "small:2", vector: makeVec(3, [0.12, 0.10, 0.99]), payload: { memory_record_id: 5002, organization_id: "org-small", scope_type: "user", scope_id: "user-small", project_key: null, kind: "fact" } },
      { id: "small:3", vector: makeVec(3, [0.08, 0.18, 0.96]), payload: { memory_record_id: 5003, organization_id: "org-small", scope_type: "user", scope_id: "user-small", project_key: null, kind: "fact" } },
      { id: "small:4", vector: makeVec(3, [0.06, 0.22, 0.95]), payload: { memory_record_id: 5004, organization_id: "org-small", scope_type: "user", scope_id: "user-small", project_key: null, kind: "fact" } },
    ];

    // Insert big-org rows in batches (respects UPSERT_BATCH_ROWS internally).
    await index.upsert(bigOrgPoints);
    await index.upsert(smallOrgPoints);

    const filterSmall: VectorFilter = {
      organizationId: "org-small",
      scopes: [{ scopeType: "user", scopeId: "user-small" }],
      projectKey: null,
    };

    const hits = await index.query(probeVec, filterSmall, 5);

    // Must return exactly the 5 org-small rows (not 0).
    expect(hits).toHaveLength(5);

    const returnedIds = new Set(hits.map((h) => h.id));
    expect(returnedIds).toContain("small:0");
    expect(returnedIds).toContain("small:1");
    expect(returnedIds).toContain("small:2");
    expect(returnedIds).toContain("small:3");
    expect(returnedIds).toContain("small:4");

    // Scores decrease monotonically (nearest first).
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }

    // No org-big rows leaked through.
    for (const hit of hits) {
      expect(hit.payload.organization_id).toBe("org-small");
    }
  }, 60_000); // 60s timeout for 2000-row seed

  // ── Test 8: HIGH 2 — batch upsert > 8191 rows ────────────────────────────
  //
  // With 8 params/row, >8191 rows in one INSERT would overflow the 65535 bind-
  // param cap and abort. This test verifies the batching path handles it.

  it("HIGH 2 batch: upserts 8500 rows (>8191 per-batch limit) without bind-param overflow", async () => {
    const points: VectorPoint[] = [];
    for (let i = 0; i < 8500; i++) {
      points.push({
        id: `batch:${i}`,
        vector: makeVec(3, [Math.cos(i * 0.001), Math.sin(i * 0.001), 0]),
        payload: {
          memory_record_id: i,
          organization_id: "org-batch",
          scope_type: "user",
          scope_id: "user-batch",
          project_key: null,
          kind: "fact",
        },
      });
    }

    // Should not throw despite exceeding 8191 rows.
    await expect(index.upsert(points)).resolves.toBeUndefined();

    // Spot-check: count stored rows for org-batch.
    const countResult = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM ${TABLE} WHERE organization_id = 'org-batch'`,
    );
    expect(Number(countResult.rows[0].n)).toBe(8500);
  }, 120_000); // 120s timeout for 8500-row seed

  // ── Test 9: LOW 5 — empty embedding throws before SQL ────────────────────

  it("LOW 5: upsert with an empty vector throws a descriptive error", async () => {
    await expect(
      index.upsert([
        {
          id: "chunk:empty",
          vector: [],
          payload: { memory_record_id: 99, organization_id: "org-a", scope_type: "user", scope_id: "u", project_key: null, kind: "fact" },
        },
      ]),
    ).rejects.toThrow(/empty embedding vector/);
  });
});

describe("pgvector adapter — delete SQL", () => {
  it("deletes by point ids only when organizationId is omitted", async () => {
    const { pool, query } = makeMockPool();
    const index = createPgVectorIndex(pool, { tableName: "test_memory_vectors" });

    await index.delete(["chunk:1", "chunk:2"]);

    expect(query).toHaveBeenCalledWith(
      "DELETE FROM test_memory_vectors WHERE point_id = ANY($1)",
      [["chunk:1", "chunk:2"]],
    );
  });

  it("treats empty organizationId as legacy unscoped delete", async () => {
    const { pool, query } = makeMockPool();
    const index = createPgVectorIndex(pool, { tableName: "test_memory_vectors" });

    await index.delete(["chunk:1", "chunk:2"], { organizationId: "" });

    expect(query).toHaveBeenCalledWith(
      "DELETE FROM test_memory_vectors WHERE point_id = ANY($1)",
      [["chunk:1", "chunk:2"]],
    );
  });

  it("adds an organization_id predicate when organizationId is provided", async () => {
    const { pool, query } = makeMockPool();
    const index = createPgVectorIndex(pool, { tableName: "test_memory_vectors" });

    await index.delete(["chunk:1", "chunk:2"], { organizationId: "org-a" });

    expect(query).toHaveBeenCalledWith(
      "DELETE FROM test_memory_vectors WHERE point_id = ANY($1) AND organization_id = $2",
      [["chunk:1", "chunk:2"], "org-a"],
    );
  });

  it("rejects whitespace-only organizationId before SQL", async () => {
    const { pool, query } = makeMockPool();
    const index = createPgVectorIndex(pool, { tableName: "test_memory_vectors" });

    await expect(
      index.delete(["chunk:1"], { organizationId: " \n\t " }),
    ).rejects.toThrow(/organizationId/);

    expect(query).not.toHaveBeenCalled();
  });

  it("skips SQL when ids are empty", async () => {
    const { pool, query } = makeMockPool();
    const index = createPgVectorIndex(pool, { tableName: "test_memory_vectors" });

    await index.delete([], { organizationId: "org-a" });

    expect(query).not.toHaveBeenCalled();
  });
});

// ── Ingest sweeper recovery integration test ──────────────────────────────────
//
// Verifies that runIngestSweep correctly re-indexes a pending ingest job into
// the pgvector backend, making the record queryable. This proves the VectorIndex
// abstraction works end-to-end for the VECTOR_BACKEND=pgvector path.

describe.skipIf(!TEST_URL)("ingest sweeper recovery — integration against real pgvector", () => {
  const VECTOR_TABLE = "test_sweeper_vectors";
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const pool = createPgPool({ connectionString: TEST_URL! });
  const vectorIndex = createPgVectorIndex(pool, { tableName: VECTOR_TABLE });

  const DIMS = 3;

  beforeAll(async () => {
    // Wait for Postgres to be ready.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        await pool.query("SELECT 1");
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (lastErr !== undefined) {
      await pool.query("SELECT 1");
    }

    // Create the vector extension (superuser in Docker container).
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector");

    // Run all migrations to create memory_records, memory_chunks, ingest_jobs.
    await runMigrations(pool);

    // Create the vector table for this suite.
    await vectorIndex.ensureCollection(DIMS);
  });

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${VECTOR_TABLE}`);
    await pool.end();
  });

  beforeEach(async () => {
    // Clean all relevant tables between tests.
    await pool.query(`TRUNCATE ${VECTOR_TABLE}`);
    // ingest_jobs references memory_records via FK; memory_chunks also references
    // memory_records. CASCADE on memory_records delete handles the rest.
    await pool.query("DELETE FROM ingest_jobs");
    await pool.query("DELETE FROM memory_chunks");
    await pool.query("DELETE FROM memory_records");
    await pool.query("DELETE FROM sources");
  });

  it("re-indexes a pending ingest job into pgvector, making the record queryable", async () => {
    // Seed: insert a source, memory_record, memory_chunk, and ingest_job row
    // that looks like it was left pending (process crashed after PG write but
    // before Qdrant/vectorIndex upsert).
    const orgId = "org-sweeper";
    const scopeType = "project";
    const scopeId = "proj-sweeper";
    const projectKey = "proj-sweeper";

    // 1. Insert source row (required FK for memory_records).
    const sourceResult = await pool.query<{ id: number }>(
      `INSERT INTO sources (organization_id, scope_type, scope_id, source_type, source_ref, content_hash)
       VALUES ($1, $2, $3, 'conversation', 'manual://test', 'hash-sweeper')
       RETURNING id`,
      [orgId, scopeType, scopeId],
    );
    const sourceId = sourceResult.rows[0]!.id;

    // 2. Insert memory_record.
    const recordResult = await pool.query<{ id: number }>(
      `INSERT INTO memory_records (organization_id, scope_type, scope_id, project_key, kind, content, durability, source_id)
       VALUES ($1, $2, $3, $4, 'fact', 'sweeper integration test content', 'durable', $5)
       RETURNING id`,
      [orgId, scopeType, scopeId, projectKey, sourceId],
    );
    const recordId = recordResult.rows[0]!.id;

    // 3. Insert memory_chunk for the record.
    const chunkResult = await pool.query<{ id: number }>(
      `INSERT INTO memory_chunks
         (organization_id, memory_record_id, chunk_index, content, start_offset, end_offset,
          embedding_provider, embedding_model, embedding_dimensions, embedding_version)
       VALUES ($1, $2, 0, 'sweeper integration test content', 0, 35,
               'openai', 'text-embedding-3-small', $3, 'v1')
       RETURNING id`,
      [orgId, recordId, DIMS],
    );
    const chunkId = chunkResult.rows[0]!.id;

    // 4. Insert ingest_job in 'pending' state with qdrant_next_retry_at in the
    //    past so claimPendingForRetry picks it up immediately.
    const pastTime = new Date(Date.now() - 60_000); // 1 minute ago
    await pool.query(
      `INSERT INTO ingest_jobs
         (memory_record_id, organization_id, status, qdrant_status, qdrant_attempts, qdrant_next_retry_at)
       VALUES ($1, $2, 'processing', 'pending', 0, $3)`,
      [recordId, orgId, pastTime],
    );

    // 5. Build real repositories that talk to the seeded DB.
    const ingestJobs = createIngestJobRepository(pool);
    const chunkRepository = createMemoryChunkRepository(pool);

    // 6. Fake embedder: returns a fixed 3-dim unit vector for any input.
    const fakeVector = [1, 0, 0];
    const embeddings = {
      embed: vi.fn().mockResolvedValue(fakeVector),
      embedBatch: vi.fn().mockResolvedValue([fakeVector]),
    };

    const silentLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    };

    // 7. Run the sweeper against real pgvector.
    const result = await runIngestSweep({
      ingestJobs,
      chunkRepository,
      embeddings,
      vectorIndex,
      logger: silentLogger as never,
    });

    // 8. Assert sweep completed the job (not retried or failed).
    expect(result).toEqual({ scanned: 1, completed: 1, retried: 0, failed: 0 });

    // 9. Assert the chunk is now queryable in pgvector.
    const filter: VectorFilter = {
      organizationId: orgId,
      scopes: [{ scopeType, scopeId }],
      projectKey,
    };
    const hits = await vectorIndex.query(fakeVector, filter, 5);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].id).toBe(`chunk:${chunkId}`);
    // pgvector adapter converts memory_record_id to Number (BIGINT→string in
    // node-postgres, then Number() in the adapter). Compare as number.
    expect(hits[0].payload.memory_record_id).toBe(Number(recordId));

    // 10. Assert the ingest_job row was marked qdrant_status='completed'.
    const jobRow = await pool.query<{ qdrant_status: string }>(
      `SELECT qdrant_status FROM ingest_jobs WHERE memory_record_id = $1`,
      [recordId],
    );
    expect(jobRow.rows[0]!.qdrant_status).toBe("completed");
  });
});

describe.skipIf(!TEST_URL)("pgvector adapter — deleteByRecordIds prevents orphan vectors", () => {
  const TABLE = "test_orphan_vectors";
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const pool = createPgPool({ connectionString: TEST_URL! });
  const index = createPgVectorIndex(pool, { tableName: TABLE });

  beforeAll(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        await pool.query("SELECT 1");
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (lastErr !== undefined) {
      await pool.query("SELECT 1");
    }
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    await index.ensureCollection(3);
  });

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${TABLE}`);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE TABLE ${TABLE}`);
  });

  it("removes orphan vectors when chunk count shrinks from 3 to 2", async () => {
    const fakeVec = [0.1, 0.2, 0.3];
    const recordId = 9001;

    // Arrange: upsert 3 chunks for record 9001.
    const initial: VectorPoint[] = [
      { id: "chunk:1001", vector: fakeVec, payload: { memory_record_id: recordId, organization_id: "org-a", scope_type: "project", scope_id: "p1", project_key: "p1", kind: "fact", embedding_version: "v1" } },
      { id: "chunk:1002", vector: fakeVec, payload: { memory_record_id: recordId, organization_id: "org-a", scope_type: "project", scope_id: "p1", project_key: "p1", kind: "fact", embedding_version: "v1" } },
      { id: "chunk:1003", vector: fakeVec, payload: { memory_record_id: recordId, organization_id: "org-a", scope_type: "project", scope_id: "p1", project_key: "p1", kind: "fact", embedding_version: "v1" } },
    ];
    await index.upsert(initial);

    const before = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ${TABLE} WHERE memory_record_id = $1`,
      [recordId],
    );
    expect(Number(before.rows[0]!.count)).toBe(3);

    // Act: deleteByRecordIds then re-upsert only 2 chunks (simulates reindex after shrink).
    await index.deleteByRecordIds([recordId]);

    const updated: VectorPoint[] = [
      { id: "chunk:1001", vector: fakeVec, payload: { memory_record_id: recordId, organization_id: "org-a", scope_type: "project", scope_id: "p1", project_key: "p1", kind: "fact", embedding_version: "v1" } },
      { id: "chunk:1002", vector: fakeVec, payload: { memory_record_id: recordId, organization_id: "org-a", scope_type: "project", scope_id: "p1", project_key: "p1", kind: "fact", embedding_version: "v1" } },
    ];
    await index.upsert(updated);

    // Assert: exactly 2 points remain — no orphan.
    const after = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ${TABLE} WHERE memory_record_id = $1`,
      [recordId],
    );
    expect(Number(after.rows[0]!.count)).toBe(2);

    // Also assert chunk:1003 is gone.
    const orphan = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ${TABLE} WHERE point_id = $1`,
      ["chunk:1003"],
    );
    expect(Number(orphan.rows[0]!.count)).toBe(0);
  });

  it("is a no-op when recordIds is empty (does not wipe the table)", async () => {
    const fakeVec = [0.1, 0.2, 0.3];
    const recordId = 9002;

    await index.upsert([
      { id: "chunk:2001", vector: fakeVec, payload: { memory_record_id: recordId, organization_id: "org-a", scope_type: "project", scope_id: "p1", project_key: "p1", kind: "fact", embedding_version: "v1" } },
    ]);

    // Act: empty delete — should be a no-op.
    await index.deleteByRecordIds([]);

    const count = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ${TABLE}`,
    );
    expect(Number(count.rows[0]!.count)).toBe(1);
  });
});
