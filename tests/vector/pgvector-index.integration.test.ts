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

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPgPool } from "../../src/db/connection.js";
import { createPgVectorIndex } from "../../src/vector/pgvector-index.js";
import type { VectorFilter } from "../../src/vector/vector-index.js";

const TEST_URL = process.env.PGVECTOR_TEST_URL;

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
});
