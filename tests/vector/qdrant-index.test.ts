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
      with_payload: ["memory_record_id"],
      with_vector: false,
    });
  });

  it("trims organizationId before building query filters", async () => {
    const client = makeClient();
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await index.query(
      [0.1, 0.2, 0.3],
      {
        organizationId: " dev-team ",
        scopes: [{ scopeType: "project", scopeId: "project-alpha" }],
        projectKey: "project-alpha",
      },
      5,
    );

    expect(client.query).toHaveBeenCalledWith(
      "memory_chunks_v1",
      expect.objectContaining({
        filter: expect.objectContaining({
          must: expect.arrayContaining([
            { key: "organization_id", match: { value: "dev-team" } },
          ]),
        }),
      }),
    );
  });

  it("trims scope filters before building query filters", async () => {
    const client = makeClient();
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await index.query(
      [0.1, 0.2, 0.3],
      {
        organizationId: "dev-team",
        scopes: [{ scopeType: " user ", scopeId: " alice " }],
        projectKey: null,
      } as never,
      5,
    );

    expect(client.query).toHaveBeenCalledWith(
      "memory_chunks_v1",
      expect.objectContaining({
        filter: expect.objectContaining({
          must: expect.arrayContaining([
            { key: "scope_type", match: { value: "user" } },
            { key: "scope_id", match: { value: "alice" } },
          ]),
        }),
      }),
    );
  });

  it("trims projectKey before building query filters", async () => {
    const client = makeClient();
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await index.query(
      [0.1, 0.2, 0.3],
      {
        organizationId: "dev-team",
        scopes: [{ scopeType: "project", scopeId: "project-alpha" }],
        projectKey: " project-alpha ",
      },
      5,
    );

    expect(client.query).toHaveBeenCalledWith(
      "memory_chunks_v1",
      expect.objectContaining({
        filter: expect.objectContaining({
          must: expect.arrayContaining([
            { key: "project_key", match: { value: "project-alpha" } },
          ]),
        }),
      }),
    );
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
      with_payload: ["memory_record_id"],
      with_vector: false,
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

  it("rejects non-object query filters before Qdrant query", async () => {
    const client = makeClient();
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.query([0.1, 0.2, 0.3], null as never, 5),
    ).rejects.toThrow("filter must be an object");

    expect(client.query).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "non-array",
      vector: null as never,
      message: "query vector must be an array",
    },
    {
      label: "empty",
      vector: [],
      message: "query vector must be a non-empty array",
    },
    {
      label: "NaN",
      vector: [0.1, Number.NaN, 0.3],
      message: "query vector[1] must be a finite number",
    },
  ])("rejects malformed query vectors before Qdrant query: $label", async ({ vector, message }) => {
    const client = makeClient();
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.query(
        vector,
        {
          organizationId: "org-a",
          scopes: [{ scopeType: "project", scopeId: "p" }],
          projectKey: "p",
        },
        10,
      ),
    ).rejects.toThrow(message);

    expect(client.query).not.toHaveBeenCalled();
  });

  it.each([
    { label: "zero", limit: 0 },
    { label: "fractional", limit: 1.5 },
  ])("rejects malformed query limits before Qdrant query: $label", async ({ limit }) => {
    const client = makeClient();
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.query(
        [0.1, 0.2, 0.3],
        {
          organizationId: "org-a",
          scopes: [{ scopeType: "project", scopeId: "p" }],
          projectKey: "p",
        },
        limit,
      ),
    ).rejects.toThrow("limit must be a positive safe integer");

    expect(client.query).not.toHaveBeenCalled();
  });

  it("rejects non-array query filter scopes before Qdrant query", async () => {
    const client = makeClient();
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.query(
        [0.1, 0.2, 0.3],
        {
          organizationId: "org-a",
          scopes: null,
          projectKey: "p",
        } as never,
        10,
      ),
    ).rejects.toThrow("filter.scopes must be an array");

    expect(client.query).not.toHaveBeenCalled();
  });

  it("rejects empty query filter scopes before Qdrant query", async () => {
    const client = makeClient();
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.query(
        [0.1, 0.2, 0.3],
        {
          organizationId: "org-a",
          scopes: [],
          projectKey: "p",
        },
        10,
      ),
    ).rejects.toThrow("filter.scopes must be a non-empty array");

    expect(client.query).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "non-object",
      scopes: [null],
      message: "filter.scopes[0] must be an object",
    },
    {
      label: "blank scopeType",
      scopes: [{ scopeType: " \n\t ", scopeId: "p" }],
      message: "filter.scopes[0].scopeType must be a non-empty string",
    },
    {
      label: "invalid scopeType",
      scopes: [{ scopeType: "team", scopeId: "p" }],
      message: "filter.scopes[0].scopeType must be one of: user, project",
    },
    {
      label: "blank scopeId",
      scopes: [{ scopeType: "project", scopeId: " \n\t " }],
      message: "filter.scopes[0].scopeId must be a non-empty string",
    },
  ])("rejects malformed query filter scope entries before Qdrant query: $label", async ({ scopes, message }) => {
    const client = makeClient();
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.query(
        [0.1, 0.2, 0.3],
        {
          organizationId: "org-a",
          scopes,
          projectKey: "p",
        } as never,
        10,
      ),
    ).rejects.toThrow(message);

    expect(client.query).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "non-string",
      projectKey: 123,
      message: "filter.projectKey must be a string or null",
    },
    {
      label: "blank",
      projectKey: " \n\t ",
      message: "filter.projectKey must be a non-empty string",
    },
  ])("rejects malformed query filter projectKey before Qdrant query: $label", async ({ projectKey, message }) => {
    const client = makeClient();
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.query(
        [0.1, 0.2, 0.3],
        {
          organizationId: "org-a",
          scopes: [{ scopeType: "project", scopeId: "p" }],
          projectKey,
        } as never,
        10,
      ),
    ).rejects.toThrow(message);

    expect(client.query).not.toHaveBeenCalled();
  });

  it("rejects malformed Qdrant query responses before reading point lists", async () => {
    const client = makeClient();
    client.query.mockResolvedValue(null);
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.query(
        [0.1],
        {
          organizationId: "org-a",
          scopes: [{ scopeType: "project", scopeId: "p" }],
          projectKey: "p",
        },
        10,
      ),
    ).rejects.toThrow("query response must be an object");
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

  it("maps array Qdrant payloads to empty VectorHit payload objects", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({
      points: [
        { id: "chunk:15", score: 0.92, payload: [{ memory_record_id: 15 }] },
      ],
    });
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    const hits = await index.query(
      [0.1],
      {
        organizationId: "org-a",
        scopes: [{ scopeType: "project", scopeId: "p" }],
        projectKey: "p",
      },
      10,
    );

    expect(hits[0]).toEqual({ id: "chunk:15", score: 0.92, payload: {} });
  });

  it("coerces numeric Qdrant point ids to VectorHit string ids", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({
      points: [
        { id: 15, score: 0.92, payload: { memory_record_id: 15 } },
      ],
    });
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    const hits = await index.query(
      [0.1],
      {
        organizationId: "org-a",
        scopes: [{ scopeType: "project", scopeId: "p" }],
        projectKey: "p",
      },
      10,
    );

    expect(hits[0]).toEqual({ id: "15", score: 0.92, payload: { memory_record_id: 15 } });
  });

  it.each([
    { label: "string", memoryRecordId: "15" },
    { label: "zero", memoryRecordId: 0 },
    { label: "unsafe integer", memoryRecordId: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects malformed Qdrant hit memory_record_id before returning VectorHit[]: $label", async ({ memoryRecordId }) => {
    const client = makeClient();
    client.query.mockResolvedValue({
      points: [
        { id: "chunk:15", score: 0.92, payload: { memory_record_id: memoryRecordId } },
      ],
    });
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.query(
        [0.1],
        {
          organizationId: "org-a",
          scopes: [{ scopeType: "project", scopeId: "p" }],
          projectKey: "p",
        },
        10,
      ),
    ).rejects.toThrow("memory_record_id must be a positive safe integer");
  });

  it("rejects malformed Qdrant point ids before returning VectorHit[]", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({
      points: [
        { id: undefined, score: 0.92, payload: { memory_record_id: 15 } },
      ],
    });
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.query(
        [0.1],
        {
          organizationId: "org-a",
          scopes: [{ scopeType: "project", scopeId: "p" }],
          projectKey: "p",
        },
        10,
      ),
    ).rejects.toThrow("id must be a non-empty string or non-negative safe integer");
  });

  it("rejects non-array Qdrant point lists before mapping VectorHit[]", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ points: null });
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.query(
        [0.1],
        {
          organizationId: "org-a",
          scopes: [{ scopeType: "project", scopeId: "p" }],
          projectKey: "p",
        },
        10,
      ),
    ).rejects.toThrow("points must be an array");
  });

  it("rejects malformed Qdrant point objects before reading fields", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ points: [null] });
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.query(
        [0.1],
        {
          organizationId: "org-a",
          scopes: [{ scopeType: "project", scopeId: "p" }],
          projectKey: "p",
        },
        10,
      ),
    ).rejects.toThrow("points[0] must be an object");
  });

  it("rejects non-finite Qdrant scores before returning VectorHit[]", async () => {
    const client = makeClient();
    client.query.mockResolvedValue({
      points: [
        { id: "chunk:15", score: Number.NaN, payload: { memory_record_id: 15 } },
      ],
    });
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.query(
        [0.1],
        {
          organizationId: "org-a",
          scopes: [{ scopeType: "project", scopeId: "p" }],
          projectKey: "p",
        },
        10,
      ),
    ).rejects.toThrow("score must be a finite number");
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

  it("rejects non-object point payloads before Qdrant upsert", async () => {
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
          id: "chunk:bad-payload",
          vector: [0.1, 0.2, 0.3],
          payload: null,
        } as never,
      ]),
    ).rejects.toThrow('upsert: point "chunk:bad-payload" payload must be an object');

    expect(client.upsert).not.toHaveBeenCalled();
  });

  it("rejects non-object point entries before Qdrant upsert", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.upsert([null] as never),
    ).rejects.toThrow("upsert: points[0] must be an object");

    expect(client.upsert).not.toHaveBeenCalled();
  });

  it("rejects non-array point lists before Qdrant upsert", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.upsert(null as never),
    ).rejects.toThrow("upsert: points must be an array");

    expect(client.upsert).not.toHaveBeenCalled();
  });

  it.each([
    { label: "missing", memoryRecordId: undefined },
    { label: "zero", memoryRecordId: 0 },
    { label: "fractional", memoryRecordId: 1.5 },
  ])("rejects malformed point memory_record_id before Qdrant upsert: $label", async ({ memoryRecordId }) => {
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
          id: "chunk:bad-record-id",
          vector: [0.1, 0.2, 0.3],
          payload: {
            ...(memoryRecordId === undefined ? {} : { memory_record_id: memoryRecordId }),
            organization_id: "org-a",
          },
        },
      ]),
    ).rejects.toThrow("point.payload.memory_record_id must be a positive safe integer");

    expect(client.upsert).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "missing",
      payload: {},
      message: "point.payload.scope_type must be a non-empty string",
    },
    {
      label: "blank",
      payload: { scope_type: " \n\t " },
      message: "point.payload.scope_type must be a non-empty string",
    },
    {
      label: "invalid",
      payload: { scope_type: "team", project_key: null, kind: "fact" },
      message: "point.payload.scope_type must be one of: user, project",
    },
  ])("rejects malformed point scope_type before Qdrant upsert: $label", async ({ payload, message }) => {
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
          id: "chunk:bad-scope-type",
          vector: [0.1, 0.2, 0.3],
          payload: {
            memory_record_id: 9,
            organization_id: "org-a",
            ...payload,
          },
        },
      ]),
    ).rejects.toThrow(message);

    expect(client.upsert).not.toHaveBeenCalled();
  });

  it.each([
    { label: "missing", payload: {} },
    { label: "blank", payload: { scope_id: " \n\t " } },
  ])("rejects malformed user point scope_id before Qdrant upsert: $label", async ({ payload }) => {
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
          id: "chunk:bad-scope-id",
          vector: [0.1, 0.2, 0.3],
          payload: {
            memory_record_id: 9,
            organization_id: "org-a",
            scope_type: "user",
            project_key: null,
            kind: "fact",
            ...payload,
          },
        },
      ]),
    ).rejects.toThrow("point.payload.scope_id must be a non-empty string");

    expect(client.upsert).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "missing",
      payload: {},
      message: "point.payload.project_key must be a string or null",
    },
    {
      label: "non-string",
      payload: { project_key: 123 },
      message: "point.payload.project_key must be a string or null",
    },
    {
      label: "blank",
      payload: { project_key: " \n\t " },
      message: "point.payload.project_key must be a non-empty string",
    },
  ])("rejects malformed point project_key before Qdrant upsert: $label", async ({ payload, message }) => {
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
          id: "chunk:bad-project-key",
          vector: [0.1, 0.2, 0.3],
          payload: {
            memory_record_id: 9,
            organization_id: "org-a",
            scope_type: "project",
            ...payload,
          },
        },
      ]),
    ).rejects.toThrow(message);

    expect(client.upsert).not.toHaveBeenCalled();
  });

  it.each([
    { label: "missing", payload: {} },
    { label: "blank", payload: { scope_id: " \n\t " } },
  ])("rejects project points without project_key or scope_id before Qdrant upsert: $label", async ({ payload }) => {
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
          id: "chunk:bad-project-identity",
          vector: [0.1, 0.2, 0.3],
          payload: {
            memory_record_id: 9,
            organization_id: "org-a",
            scope_type: "project",
            project_key: null,
            kind: "fact",
            ...payload,
          },
        },
      ]),
    ).rejects.toThrow("point.payload.scope_id must be a non-empty string");

    expect(client.upsert).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "missing",
      payload: {},
      message: "point.payload.kind must be a non-empty string",
    },
    {
      label: "blank",
      payload: { kind: " \n\t " },
      message: "point.payload.kind must be a non-empty string",
    },
    {
      label: "invalid",
      payload: { kind: "note" },
      message: "point.payload.kind must be one of: decision, summary, fact",
    },
  ])("rejects malformed point kind before Qdrant upsert: $label", async ({ payload, message }) => {
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
          id: "chunk:bad-kind",
          vector: [0.1, 0.2, 0.3],
          payload: {
            memory_record_id: 9,
            organization_id: "org-a",
            scope_type: "project",
            project_key: "project-alpha",
            ...payload,
          },
        },
      ]),
    ).rejects.toThrow(message);

    expect(client.upsert).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "blank",
      durability: " \n\t ",
      message: "point.payload.durability must be a non-empty string",
    },
    {
      label: "invalid",
      durability: "permanent",
      message: "point.payload.durability must be one of: ephemeral, durable, archived",
    },
  ])("rejects malformed provided point durability before Qdrant upsert: $label", async ({ durability, message }) => {
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
          id: "chunk:bad-durability",
          vector: [0.1, 0.2, 0.3],
          payload: {
            memory_record_id: 9,
            organization_id: "org-a",
            scope_type: "project",
            project_key: "project-alpha",
            kind: "fact",
            durability,
          },
        },
      ]),
    ).rejects.toThrow(message);

    expect(client.upsert).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "non-array",
      tags: "ops",
      message: "point.payload.tags must be an array",
    },
    {
      label: "non-string entry",
      tags: ["ops", 12],
      message: "point.payload.tags[1] must be a string",
    },
    {
      label: "blank entry",
      tags: ["ops", " \n\t "],
      message: "point.payload.tags[1] must contain non-whitespace text",
    },
  ])("rejects malformed provided point tags before Qdrant upsert: $label", async ({ tags, message }) => {
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
          id: "chunk:bad-tags",
          vector: [0.1, 0.2, 0.3],
          payload: {
            memory_record_id: 9,
            organization_id: "org-a",
            scope_type: "project",
            project_key: "project-alpha",
            kind: "fact",
            tags,
          },
        },
      ]),
    ).rejects.toThrow(message);

    expect(client.upsert).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "title undefined",
      payload: { title: undefined },
      message: "point.payload.title must be a string or null",
    },
    {
      label: "title non-string",
      payload: { title: 12 },
      message: "point.payload.title must be a string or null",
    },
    {
      label: "title blank",
      payload: { title: " \n\t " },
      message: "point.payload.title must be a non-empty string",
    },
    {
      label: "summary non-string",
      payload: { summary: false },
      message: "point.payload.summary must be a string or null",
    },
    {
      label: "summary undefined",
      payload: { summary: undefined },
      message: "point.payload.summary must be a string or null",
    },
    {
      label: "summary blank",
      payload: { summary: " \n\t " },
      message: "point.payload.summary must be a non-empty string",
    },
  ])("rejects malformed provided point text metadata before Qdrant upsert: $label", async ({ payload, message }) => {
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
          id: "chunk:bad-text",
          vector: [0.1, 0.2, 0.3],
          payload: {
            memory_record_id: 9,
            organization_id: "org-a",
            scope_type: "project",
            project_key: "project-alpha",
            kind: "fact",
            ...payload,
          },
        },
      ]),
    ).rejects.toThrow(message);

    expect(client.upsert).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "updated_at undefined",
      payload: { updated_at: undefined },
      message: "point.payload.updated_at must be a string or null",
    },
    {
      label: "updated_at non-string",
      payload: { updated_at: 12 },
      message: "point.payload.updated_at must be a string or null",
    },
    {
      label: "updated_at blank",
      payload: { updated_at: " \n\t " },
      message: "point.payload.updated_at must be a non-empty string",
    },
    {
      label: "embedding_version undefined",
      payload: { embedding_version: undefined },
      message: "point.payload.embedding_version must be a string or null",
    },
    {
      label: "embedding_version non-string",
      payload: { embedding_version: false },
      message: "point.payload.embedding_version must be a string or null",
    },
    {
      label: "embedding_version blank",
      payload: { embedding_version: " \n\t " },
      message: "point.payload.embedding_version must be a non-empty string",
    },
  ])("rejects malformed provided point storage metadata before Qdrant upsert: $label", async ({ payload, message }) => {
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
          id: "chunk:bad-storage",
          vector: [0.1, 0.2, 0.3],
          payload: {
            memory_record_id: 9,
            organization_id: "org-a",
            scope_type: "project",
            project_key: "project-alpha",
            kind: "fact",
            ...payload,
          },
        },
      ]),
    ).rejects.toThrow(message);

    expect(client.upsert).not.toHaveBeenCalled();
  });

  it.each([
    { label: "empty", id: "" },
    { label: "blank", id: " \n\t " },
  ])("rejects malformed point ids before Qdrant upsert: $label", async ({ id }) => {
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
          id,
          vector: [0.1, 0.2, 0.3],
          payload: {
            memory_record_id: 9,
            organization_id: "org-a",
          },
        },
      ]),
    ).rejects.toThrow("point.id must be a non-empty string");

    expect(client.upsert).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "non-array",
      vector: null as never,
      message: 'upsert: point "chunk:bad-vector" vector must be an array',
    },
    {
      label: "empty",
      vector: [],
      message: /empty embedding vector/,
    },
    {
      label: "NaN",
      vector: [0.1, Number.NaN, 0.3],
      message: "vector[1] must be a finite number",
    },
    {
      label: "Infinity",
      vector: [0.1, Number.POSITIVE_INFINITY, 0.3],
      message: "vector[1] must be a finite number",
    },
  ])("rejects malformed upsert vectors before Qdrant upsert: $label", async ({ vector, message }) => {
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
          id: "chunk:bad-vector",
          vector,
          payload: {
            memory_record_id: 9,
            organization_id: "org-a",
          },
        },
      ]),
    ).rejects.toThrow(message);

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
  const pointId1 = "00000000-0000-8000-8000-000000000001";
  const pointId2 = "00000000-0000-8000-8000-000000000002";

  it("calls Qdrant delete with point ids when organizationId is omitted", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await index.delete([pointId1, pointId2]);
    expect(client.delete).toHaveBeenCalledWith("memory_chunks_v1", {
      points: [pointId1, pointId2],
    });
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

    await index.delete([pointId1, pointId2], { organizationId: "" });

    expect(client.delete).toHaveBeenCalledWith("memory_chunks_v1", {
      points: [pointId1, pointId2],
    });
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

    await index.delete([pointId1, pointId2], { organizationId: "org-a" });

    expect(client.delete).toHaveBeenCalledWith("memory_chunks_v1", {
      filter: {
        must: [
          { has_id: [pointId1, pointId2] },
          { key: "organization_id", match: { value: "org-a" } },
        ],
      },
    });
  });

  it("trims organizationId before Qdrant delete filters", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await index.delete([pointId1], { organizationId: " org-a " });

    expect(client.delete).toHaveBeenCalledWith("memory_chunks_v1", {
      filter: {
        must: [
          { has_id: [pointId1] },
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

  it.each([
    { label: "empty", ids: [""] },
    { label: "blank", ids: [" \n\t "] },
  ])("rejects malformed point ids before Qdrant delete: $label", async ({ ids }) => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.delete(ids),
    ).rejects.toThrow("ids[0] must be a non-empty string");

    expect(client.delete).not.toHaveBeenCalled();
  });

  it("rejects non-array point id lists before Qdrant delete", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.delete(null as never),
    ).rejects.toThrow("delete: ids must be an array");

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

  it("trims organizationId before Qdrant deleteByRecordIds filters", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await index.deleteByRecordIds([101], { organizationId: " org-a " });

    expect(client.delete).toHaveBeenCalledWith("memory_chunks_v1", {
      filter: {
        must: [
          {
            should: [
              { key: "memory_record_id", match: { value: 101 } },
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

  it("rejects non-string organizationId before Qdrant deleteByRecordIds", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.deleteByRecordIds([101], { organizationId: 123 } as never),
    ).rejects.toThrow("organizationId must be a string");

    expect(client.delete).not.toHaveBeenCalled();
  });

  it.each([
    { label: "zero", recordIds: [0] },
    { label: "fractional", recordIds: [1.5] },
    { label: "NaN", recordIds: [Number.NaN] },
  ])("rejects malformed recordIds before Qdrant deleteByRecordIds: $label", async ({ recordIds }) => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.deleteByRecordIds(recordIds),
    ).rejects.toThrow("recordIds[0] must be a positive safe integer");

    expect(client.delete).not.toHaveBeenCalled();
  });

  it("rejects non-array record id lists before Qdrant deleteByRecordIds", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.deleteByRecordIds(null as never),
    ).rejects.toThrow("deleteByRecordIds: recordIds must be an array");

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

  it("rejects malformed collectionExists responses before create decisions", async () => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      collectionExists: vi.fn().mockResolvedValue({ exists: "false" }),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(index.ensureCollection(1536)).rejects.toThrow(
      "collectionExists.exists must be a boolean",
    );
    expect(client.createCollection).not.toHaveBeenCalled();
  });

  it.each([
    { label: "zero", dimensions: 0 },
    { label: "fractional", dimensions: 3.5 },
    { label: "NaN", dimensions: Number.NaN },
  ])("rejects malformed dimensions before Qdrant collection checks: $label", async ({ dimensions }) => {
    const client = {
      query: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      collectionExists: vi.fn(),
      createCollection: vi.fn(),
    };
    const index = createQdrantVectorIndex(client as never, "memory_chunks_v1");

    await expect(
      index.ensureCollection(dimensions),
    ).rejects.toThrow("dimensions must be a positive safe integer");

    expect(client.collectionExists).not.toHaveBeenCalled();
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
