import { describe, expect, it, vi } from "vitest";
import { retrieveMemory } from "../../src/search/retrieve-memory.js";

describe("retrieveMemory", () => {
  it("hydrates qdrant hits from postgres and keeps project results ahead of user results", async () => {
    const qdrant = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          points: [{ payload: { memory_record_id: 12 } }],
        })
        .mockResolvedValueOnce({
          points: [{ payload: { memory_record_id: 21 } }],
        }),
    };

    const repository = {
      getMemoryRecordsByIds: vi.fn().mockResolvedValue([
        {
          id: 21,
          sourceId: 201,
          scopeType: "user",
          scopeId: "alice",
          memoryType: "fact",
          content: "Use ripgrep first.",
          createdAt: "2026-03-29T00:00:00.000Z",
          updatedAt: "2026-03-29T00:00:00.000Z",
          source: {
            id: 301,
            scopeType: "user",
            scopeId: "alice",
            sourceType: "document",
            externalId: "tooling",
            title: "Tooling",
            uri: "file:///tmp/tooling.md",
            createdAt: "2026-03-29T00:00:00.000Z",
          },
        },
        {
          id: 12,
          sourceId: 202,
          scopeType: "project",
          scopeId: "project-alpha",
          memoryType: "decision",
          content: "Decision: keep project memory ahead of user memory.",
          createdAt: "2026-03-29T00:00:00.000Z",
          updatedAt: "2026-03-29T00:00:00.000Z",
          source: {
            id: 302,
            scopeType: "project",
            scopeId: "project-alpha",
            sourceType: "decision",
            externalId: "adr-2",
            title: "ADR 2",
            uri: "file:///tmp/adr-2.md",
            createdAt: "2026-03-29T00:00:00.000Z",
          },
        },
      ]),
    };

    const results = await retrieveMemory({
      qdrantClient: qdrant as never,
      repository: repository as never,
      collectionName: "memory_chunks_v1",
      vector: [0.1, 0.2, 0.3],
      // Pre-org-binding deployments still rely on legacy single-tenant
      // semantics — opt in explicitly so this test pins that behavior.
      allowLegacyAnonymous: true,
      projectKey: "project-alpha",
      userScopeId: "alice",
      limit: 5,
    });

    expect(qdrant.query).toHaveBeenNthCalledWith(1, "memory_chunks_v1", {
      query: [0.1, 0.2, 0.3],
      limit: 5,
      filter: {
        must: [
          { key: "scope_type", match: { value: "project" } },
          { key: "project_key", match: { value: "project-alpha" } },
        ],
      },
    });
    expect(qdrant.query).toHaveBeenNthCalledWith(2, "memory_chunks_v1", {
      query: [0.1, 0.2, 0.3],
      limit: 5,
      filter: {
        must: [
          { key: "scope_type", match: { value: "user" } },
          { key: "scope_id", match: { value: "alice" } },
        ],
      },
    });
    expect(repository.getMemoryRecordsByIds).toHaveBeenCalledWith(
      [12, 21],
      undefined,
    );
    expect(results.map((result) => result.id)).toEqual([12, 21]);
  });

  it("keeps project hits ahead when limit is smaller than the combined candidate set", async () => {
    const qdrant = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          points: [{ payload: { memory_record_id: 12 } }],
        })
        .mockResolvedValueOnce({
          points: [{ payload: { memory_record_id: 21 } }],
        }),
    };

    const repository = {
      getMemoryRecordsByIds: vi.fn().mockResolvedValue([
        {
          id: 21,
          sourceId: 201,
          scopeType: "user",
          scopeId: "alice",
          memoryType: "decision",
          content: "Decision: Always prefer the freshest user workflow hint.",
          createdAt: "2026-03-29T00:00:00.000Z",
          updatedAt: "2026-03-29T12:00:00.000Z",
          source: {
            id: 301,
            scopeType: "user",
            scopeId: "alice",
            sourceType: "decision",
            externalId: "tooling",
            title: "Tooling",
            uri: "file:///tmp/tooling.md",
            createdAt: "2026-03-29T00:00:00.000Z",
          },
        },
        {
          id: 12,
          sourceId: 202,
          scopeType: "project",
          scopeId: "project-alpha",
          memoryType: "summary",
          content: "Project summary: retrieval must prioritize project context.",
          createdAt: "2026-03-29T00:00:00.000Z",
          updatedAt: "2026-03-28T00:00:00.000Z",
          source: {
            id: 302,
            scopeType: "project",
            scopeId: "project-alpha",
            sourceType: "document",
            externalId: "adr-2",
            title: "ADR 2",
            uri: "file:///tmp/adr-2.md",
            createdAt: "2026-03-29T00:00:00.000Z",
          },
        },
      ]),
    };

    const results = await retrieveMemory({
      qdrantClient: qdrant as never,
      repository: repository as never,
      collectionName: "memory_chunks_v1",
      vector: [0.1, 0.2, 0.3],
      // Legacy anonymous test path — pinned via the escape hatch.
      allowLegacyAnonymous: true,
      projectKey: "project-alpha",
      userScopeId: "alice",
      limit: 1,
    });

    expect(repository.getMemoryRecordsByIds).toHaveBeenCalledWith(
      [12, 21],
      undefined,
    );
    expect(results.map((result) => result.id)).toEqual([12]);
  });

  it("passes organizationId through to the repository hydration call", async () => {
    const qdrant = {
      query: vi.fn().mockResolvedValue({
        points: [{ payload: { memory_record_id: 12 } }],
      }),
    };

    const repository = {
      getMemoryRecordsByIds: vi.fn().mockResolvedValue([
        {
          id: 12,
          sourceId: 202,
          scopeType: "project",
          scopeId: "project-alpha",
          memoryType: "decision",
          content: "Org-scoped record.",
          createdAt: "2026-04-25T00:00:00.000Z",
          updatedAt: "2026-04-25T00:00:00.000Z",
          source: {
            id: 302,
            scopeType: "project",
            scopeId: "project-alpha",
            sourceType: "decision",
            externalId: "adr-1",
            title: "ADR 1",
            uri: "file:///tmp/adr-1.md",
            createdAt: "2026-04-25T00:00:00.000Z",
          },
        },
      ]),
    };

    await retrieveMemory({
      qdrantClient: qdrant as never,
      repository: repository as never,
      collectionName: "memory_chunks_v1",
      vector: [0.1, 0.2, 0.3],
      organizationId: "dev-team",
      projectKey: "project-alpha",
      limit: 5,
    });

    expect(repository.getMemoryRecordsByIds).toHaveBeenCalledWith(
      [12],
      "dev-team",
    );
  });

  it("throws when organizationId is missing and the legacy anonymous escape hatch is not opted into", async () => {
    const qdrant = { query: vi.fn() };
    const repository = { getMemoryRecordsByIds: vi.fn() };

    await expect(
      retrieveMemory({
        qdrantClient: qdrant as never,
        repository: repository as never,
        collectionName: "memory_chunks_v1",
        vector: [0.1, 0.2, 0.3],
        // organizationId omitted on purpose — default-strict mode rejects.
        projectKey: "project-alpha",
        limit: 5,
      }),
    ).rejects.toThrow(/organizationId/i);

    // Strict mode must not even reach Qdrant — the throw guards against
    // accidental cross-org reads silently returning results.
    expect(qdrant.query).not.toHaveBeenCalled();
    expect(repository.getMemoryRecordsByIds).not.toHaveBeenCalled();
  });

  it("includes operational guidance in the strict-mode error message", async () => {
    const qdrant = { query: vi.fn() };
    const repository = { getMemoryRecordsByIds: vi.fn() };

    let caught: unknown;
    try {
      await retrieveMemory({
        qdrantClient: qdrant as never,
        repository: repository as never,
        collectionName: "memory_chunks_v1",
        vector: [0.1, 0.2, 0.3],
        projectKey: "project-alpha",
        limit: 5,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    // Operator should learn how to satisfy the guard from the message alone.
    expect(message).toMatch(/token:org|x-organization-id|LEGACY_ANONYMOUS_SEARCH/i);
  });

  it("allows org-blind reads when allowLegacyAnonymous is explicitly true", async () => {
    const qdrant = {
      query: vi.fn().mockResolvedValue({
        points: [{ payload: { memory_record_id: 12 } }],
      }),
    };
    const repository = {
      getMemoryRecordsByIds: vi.fn().mockResolvedValue([
        {
          id: 12,
          sourceId: 202,
          scopeType: "project" as const,
          scopeId: "project-alpha",
          memoryType: "decision" as const,
          content: "Legacy single-tenant read.",
          createdAt: "2026-04-25T00:00:00.000Z",
          updatedAt: "2026-04-25T00:00:00.000Z",
          source: {
            id: 302,
            scopeType: "project" as const,
            scopeId: "project-alpha",
            sourceType: "decision" as const,
            externalId: "adr-1",
            title: "ADR 1",
            uri: "file:///tmp/adr-1.md",
            createdAt: "2026-04-25T00:00:00.000Z",
          },
        },
      ]),
    };

    const results = await retrieveMemory({
      qdrantClient: qdrant as never,
      repository: repository as never,
      collectionName: "memory_chunks_v1",
      vector: [0.1, 0.2, 0.3],
      // organizationId omitted, but explicit opt-in into legacy behavior.
      allowLegacyAnonymous: true,
      projectKey: "project-alpha",
      limit: 5,
    });

    expect(results).toHaveLength(1);
    // No org filter on Qdrant, no orgId on PG hydration — preserves the
    // documented legacy single-tenant behavior for explicit opt-ins.
    expect(qdrant.query).toHaveBeenCalledWith("memory_chunks_v1", {
      query: [0.1, 0.2, 0.3],
      limit: 5,
      filter: {
        must: [
          { key: "scope_type", match: { value: "project" } },
          { key: "project_key", match: { value: "project-alpha" } },
        ],
      },
    });
    expect(repository.getMemoryRecordsByIds).toHaveBeenCalledWith(
      [12],
      undefined,
    );
  });
});
