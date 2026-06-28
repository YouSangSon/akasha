import { describe, expect, it, vi } from "vitest";
import { createQdrantVectorIndex } from "../../src/vector/qdrant-index.js";
import type {
  VectorDeleteOptions,
  VectorFilter,
  VectorPoint,
} from "../../src/vector/vector-index.js";

// FakeVectorIndex — a minimal in-memory VectorIndex for use by other tests.
// Exported so downstream unit tests can import it instead of building their own.
export function createFakeVectorIndex() {
  const stored = new Map<string, VectorPoint>();
  const queryResults: Map<string, unknown[]> = new Map();

  return {
    async ensureCollection(_dimensions: number) {
      // no-op
    },
    async upsert(points: VectorPoint[]) {
      for (const p of points) {
        stored.set(p.id, p);
      }
    },
    async query(_vector: number[], filter: VectorFilter, _limit: number) {
      const key = JSON.stringify(filter);
      return (queryResults.get(key) ?? []) as never;
    },
    async delete(ids: string[], options: VectorDeleteOptions = {}) {
      for (const id of ids) {
        const point = stored.get(id);
        if (
          point !== undefined &&
          (!options.organizationId ||
            point.payload["organization_id"] === options.organizationId)
        ) {
          stored.delete(id);
        }
      }
    },
    async deleteByRecordIds(
      recordIds: number[],
      options: VectorDeleteOptions = {},
    ) {
      for (const [id, point] of stored) {
        if (
          recordIds.includes(point.payload["memory_record_id"] as number) &&
          (!options.organizationId ||
            point.payload["organization_id"] === options.organizationId)
        ) {
          stored.delete(id);
        }
      }
    },
    // Test helpers
    _stored: stored,
    _setQueryResults(filter: VectorFilter, hits: unknown[]) {
      queryResults.set(JSON.stringify(filter), hits);
    },
  };
}

describe("createQdrantVectorIndex — VectorFilter → {must} translation", () => {
  function makeClient() {
    return {
      query: vi.fn().mockResolvedValue({ points: [] }),
      upsert: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      collectionExists: vi.fn().mockResolvedValue({ exists: false }),
      createCollection: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("builds must clauses for project scope with organizationId", async () => {
    const client = makeClient();
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    const filter: VectorFilter = {
      organizationId: "dev-team",
      scopes: [{ scopeType: "project", scopeId: "project-alpha" }],
      projectKey: "project-alpha",
    };
    await index.query([0.1, 0.2, 0.3], filter, 5);

    expect(client.query).toHaveBeenCalledWith("memory_chunks_v1", {
      query: [0.1, 0.2, 0.3],
      limit: 5,
      filter: {
        must: [
          { key: "organization_id", match: { value: "dev-team" } },
          { key: "scope_type", match: { value: "project" } },
          { key: "project_key", match: { value: "project-alpha" } },
        ],
      },
    });
  });

  it("builds must clauses for user scope with organizationId", async () => {
    const client = makeClient();
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    const filter: VectorFilter = {
      organizationId: "dev-team",
      scopes: [{ scopeType: "user", scopeId: "alice" }],
      projectKey: null,
    };
    await index.query([0.1, 0.2, 0.3], filter, 5);

    expect(client.query).toHaveBeenCalledWith("memory_chunks_v1", {
      query: [0.1, 0.2, 0.3],
      limit: 5,
      filter: {
        must: [
          { key: "organization_id", match: { value: "dev-team" } },
          { key: "scope_type", match: { value: "user" } },
          { key: "scope_id", match: { value: "alice" } },
        ],
      },
    });
  });

  it("omits organization_id clause when organizationId is empty string (legacy mode)", async () => {
    const client = makeClient();
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    const filter: VectorFilter = {
      organizationId: "",
      scopes: [{ scopeType: "project", scopeId: "project-alpha" }],
      projectKey: "project-alpha",
    };
    await index.query([0.1, 0.2, 0.3], filter, 5);

    const calledFilter = (client.query.mock.calls[0] as [string, { filter: { must: Array<{ key: string }> } }])[1].filter;
    const keys = calledFilter.must.map((c) => c.key);
    expect(keys).not.toContain("organization_id");
    expect(keys).toContain("scope_type");
    expect(keys).toContain("project_key");
  });

  it("rejects whitespace-only organizationId before Qdrant query", async () => {
    const client = makeClient();
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

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

    expect(client.query).not.toHaveBeenCalled();
  });

  it("returns VectorHit[] with id, score, and payload from Qdrant response", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({
      points: [
        { id: "chunk:15", score: 0.92, payload: { memory_record_id: 15, chunk_id: 100 } },
        { id: "chunk:16", score: 0.85, payload: { memory_record_id: 16, chunk_id: 101 } },
      ],
    });
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    const hits = await index.query(
      [0.1],
      { organizationId: "org-a", scopes: [{ scopeType: "project", scopeId: "p" }], projectKey: "p" },
      10,
    );

    expect(hits).toHaveLength(2);
    expect(hits[0]).toEqual({ id: "chunk:15", score: 0.92, payload: { memory_record_id: 15, chunk_id: 100 } });
    expect(hits[1]).toEqual({ id: "chunk:16", score: 0.85, payload: { memory_record_id: 16, chunk_id: 101 } });
  });
});

describe("createQdrantVectorIndex — point building (upsert)", () => {
  it("passes VectorPoint[] directly to Qdrant upsert", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn(),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    const points: VectorPoint[] = [
      {
        id: "chunk:15",
        vector: [0.1, 0.2, 0.3],
        payload: {
          chunk_id: 15,
          memory_record_id: 9,
          organization_id: "dev-team",
          scope_type: "user",
          scope_id: "alice",
          project_key: "project-alpha",
          kind: "decision",
          durability: "durable",
          tags: ["style"],
          updated_at: "2026-03-29T00:00:00.000Z",
          embedding_version: "v1",
        },
      },
    ];

    await index.upsert(points);

    expect(client.upsert).toHaveBeenCalledWith("memory_chunks_v1", { points });
  });

  it("rejects whitespace-only point organization_id before Qdrant upsert", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

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

    expect(client.upsert).not.toHaveBeenCalled();
  });

  it("rejects missing point organization_id before Qdrant upsert", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.upsert([
        {
          id: "chunk:missing-org",
          vector: [0.1, 0.2, 0.3],
          payload: {
            memory_record_id: 9,
          },
        },
      ]),
    ).rejects.toThrow(/organization_id/);

    expect(client.upsert).not.toHaveBeenCalled();
  });

  it("skips Qdrant upsert call when points array is empty", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await index.upsert([]);
    expect(client.upsert).not.toHaveBeenCalled();
  });
});

describe("createQdrantVectorIndex — delete", () => {
  it("calls Qdrant delete with point ids when organizationId is omitted", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await index.delete(["chunk:1", "chunk:2"]);
    expect(client.delete).toHaveBeenCalledWith("memory_chunks_v1", { points: ["chunk:1", "chunk:2"] });
  });

  it("treats empty organizationId as legacy unscoped Qdrant delete", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await index.delete(["chunk:1", "chunk:2"], { organizationId: "" });

    expect(client.delete).toHaveBeenCalledWith("memory_chunks_v1", { points: ["chunk:1", "chunk:2"] });
  });

  it("calls Qdrant delete with id and organization filters when organizationId is provided", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await index.delete(["chunk:1", "chunk:2"], { organizationId: "org-a" });

    expect(client.delete).toHaveBeenCalledWith("memory_chunks_v1", {
      filter: {
        must: [
          { has_id: ["chunk:1", "chunk:2"] },
          { key: "organization_id", match: { value: "org-a" } },
        ],
      },
    });
  });

  it("rejects whitespace-only organizationId before Qdrant delete", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.delete(["chunk:1"], { organizationId: " \n\t " }),
    ).rejects.toThrow(/organizationId/);

    expect(client.delete).not.toHaveBeenCalled();
  });

  it("skips Qdrant delete call when ids array is empty (guards against Qdrant 400)", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await index.delete([]);
    expect(client.delete).not.toHaveBeenCalled();
  });
});

describe("createQdrantVectorIndex — deleteByRecordIds", () => {
  it("deletes by memory_record_id payload filter using should clauses", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await index.deleteByRecordIds([101, 202]);

    expect(client.delete).toHaveBeenCalledWith("memory_chunks_v1", {
      filter: {
        should: [
          { key: "memory_record_id", match: { value: 101 } },
          { key: "memory_record_id", match: { value: 202 } },
        ],
      },
    });
  });

  it("treats empty organizationId as legacy unscoped Qdrant deleteByRecordIds", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await index.deleteByRecordIds([101, 202], { organizationId: "" });

    expect(client.delete).toHaveBeenCalledWith("memory_chunks_v1", {
      filter: {
        should: [
          { key: "memory_record_id", match: { value: 101 } },
          { key: "memory_record_id", match: { value: 202 } },
        ],
      },
    });
  });

  it("deletes by memory_record_id and organization_id when scoped", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await index.deleteByRecordIds([101, 202], { organizationId: "org-a" });

    expect(client.delete).toHaveBeenCalledWith("memory_chunks_v1", {
      filter: {
        must: [
          {
            should: [
              { key: "memory_record_id", match: { value: 101 } },
              { key: "memory_record_id", match: { value: 202 } },
            ],
          },
          {
            key: "organization_id",
            match: { value: "org-a" },
          },
        ],
      },
    });
  });

  it("rejects whitespace-only organizationId before Qdrant deleteByRecordIds", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.deleteByRecordIds([101], { organizationId: " \n\t " }),
    ).rejects.toThrow(/organizationId/);

    expect(client.delete).not.toHaveBeenCalled();
  });

  it("skips Qdrant call when recordIds array is empty (data-loss guard)", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await index.deleteByRecordIds([]);
    expect(client.delete).not.toHaveBeenCalled();
  });
});

describe("createQdrantVectorIndex — ensureCollection", () => {
  it("creates the collection when it does not exist", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      collectionExists: vi.fn().mockResolvedValue({ exists: false }),
      createCollection: vi.fn().mockResolvedValue(undefined),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await index.ensureCollection(1536);

    expect(client.collectionExists).toHaveBeenCalledWith("memory_chunks_v1");
    expect(client.createCollection).toHaveBeenCalledWith("memory_chunks_v1", {
      vectors: { size: 1536, distance: "Cosine" },
    });
  });

  it("skips createCollection when collection already exists", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      collectionExists: vi.fn().mockResolvedValue({ exists: true }),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await index.ensureCollection(1536);

    expect(client.collectionExists).toHaveBeenCalledWith("memory_chunks_v1");
    expect(client.createCollection).not.toHaveBeenCalled();
  });
});

describe("FakeVectorIndex", () => {
  it("stores and retrieves points", async () => {
    const fake = createFakeVectorIndex();
    const point: VectorPoint = { id: "chunk:1", vector: [1, 0], payload: { memory_record_id: 42 } };
    await fake.upsert([point]);
    expect(fake._stored.get("chunk:1")).toEqual(point);
  });

  it("deletes points by id", async () => {
    const fake = createFakeVectorIndex();
    await fake.upsert([{ id: "chunk:1", vector: [1], payload: {} }]);
    await fake.delete(["chunk:1"]);
    expect(fake._stored.has("chunk:1")).toBe(false);
  });

  it("deleteByRecordIds removes all points matching the record id", async () => {
    const fake = createFakeVectorIndex();
    await fake.upsert([
      { id: "chunk:1", vector: [1], payload: { memory_record_id: 10 } },
      { id: "chunk:2", vector: [2], payload: { memory_record_id: 10 } },
      { id: "chunk:3", vector: [3], payload: { memory_record_id: 20 } },
    ]);

    await fake.deleteByRecordIds([10]);

    expect(fake._stored.has("chunk:1")).toBe(false);
    expect(fake._stored.has("chunk:2")).toBe(false);
    // Record 20 is unaffected.
    expect(fake._stored.has("chunk:3")).toBe(true);
  });
});
