import { describe, expect, it, vi } from "vitest";
import { retrieveMemory } from "../../src/search/retrieve-memory.js";

describe("retrieveMemory", () => {
  it("hydrates vector hits from postgres and keeps project results ahead of user results", async () => {
    const vectorIndex = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ id: "chunk:12", score: 0.9, payload: { memory_record_id: 12 } }])
        .mockResolvedValueOnce([{ id: "chunk:21", score: 0.8, payload: { memory_record_id: 21 } }]),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
      ensureCollection: vi.fn(),
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
      vectorIndex: vectorIndex as never,
      repository: repository as never,
      vector: [0.1, 0.2, 0.3],
      // Pre-org-binding deployments still rely on legacy single-tenant
      // semantics — opt in explicitly so this test pins that behavior.
      allowLegacyAnonymous: true,
      projectKey: "project-alpha",
      userScopeId: "alice",
      limit: 5,
    });

    // Project scope query: organizationId="" (legacy), scope_type=project, project_key=project-alpha
    expect(vectorIndex.query).toHaveBeenNthCalledWith(
      1,
      [0.1, 0.2, 0.3],
      { organizationId: "", scopes: [{ scopeType: "project", scopeId: "project-alpha" }], projectKey: "project-alpha" },
      5,
    );
    // User scope query: organizationId="" (legacy), scope_type=user, scopeId=alice
    expect(vectorIndex.query).toHaveBeenNthCalledWith(
      2,
      [0.1, 0.2, 0.3],
      { organizationId: "", scopes: [{ scopeType: "user", scopeId: "alice" }], projectKey: null },
      5,
    );
    expect(repository.getMemoryRecordsByIds).toHaveBeenCalledWith(
      [12, 21],
      undefined,
      true,
    );
    expect(results.map((result) => result.id)).toEqual([12, 21]);
  });

  it("keeps project hits ahead when limit is smaller than the combined candidate set", async () => {
    const vectorIndex = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ id: "chunk:12", score: 0.9, payload: { memory_record_id: 12 } }])
        .mockResolvedValueOnce([{ id: "chunk:21", score: 0.8, payload: { memory_record_id: 21 } }]),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
      ensureCollection: vi.fn(),
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
      vectorIndex: vectorIndex as never,
      repository: repository as never,
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
      true,
    );
    expect(results.map((result) => result.id)).toEqual([12]);
  });

  it("passes organizationId through to the repository hydration call", async () => {
    const vectorIndex = {
      query: vi.fn().mockResolvedValue([
        { id: "chunk:12", score: 0.9, payload: { memory_record_id: 12 } },
      ]),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
      ensureCollection: vi.fn(),
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
      vectorIndex: vectorIndex as never,
      repository: repository as never,
      vector: [0.1, 0.2, 0.3],
      organizationId: "dev-team",
      projectKey: "project-alpha",
      limit: 5,
    });

    expect(repository.getMemoryRecordsByIds).toHaveBeenCalledWith(
      [12],
      "dev-team",
      undefined,
    );
  });

  it("throws when organizationId is missing and the legacy anonymous escape hatch is not opted into", async () => {
    const vectorIndex = { query: vi.fn(), upsert: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), ensureCollection: vi.fn() };
    const repository = { getMemoryRecordsByIds: vi.fn() };

    await expect(
      retrieveMemory({
        vectorIndex: vectorIndex as never,
        repository: repository as never,
        vector: [0.1, 0.2, 0.3],
        // organizationId omitted on purpose — default-strict mode rejects.
        projectKey: "project-alpha",
        limit: 5,
      }),
    ).rejects.toThrow(/organizationId/i);

    // Strict mode must not even reach the vector index — the throw guards
    // against accidental cross-org reads silently returning results.
    expect(vectorIndex.query).not.toHaveBeenCalled();
    expect(repository.getMemoryRecordsByIds).not.toHaveBeenCalled();
  });

  it("includes operational guidance in the strict-mode error message", async () => {
    const vectorIndex = { query: vi.fn(), upsert: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), ensureCollection: vi.fn() };
    const repository = { getMemoryRecordsByIds: vi.fn() };

    let caught: unknown;
    try {
      await retrieveMemory({
        vectorIndex: vectorIndex as never,
        repository: repository as never,
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
    const vectorIndex = {
      query: vi.fn().mockResolvedValue([
        { id: "chunk:12", score: 0.9, payload: { memory_record_id: 12 } },
      ]),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
      ensureCollection: vi.fn(),
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
      vectorIndex: vectorIndex as never,
      repository: repository as never,
      vector: [0.1, 0.2, 0.3],
      // organizationId omitted, but explicit opt-in into legacy behavior.
      allowLegacyAnonymous: true,
      projectKey: "project-alpha",
      limit: 5,
    });

    expect(results).toHaveLength(1);
    // No org filter on vector index (empty string), no orgId on PG hydration —
    // preserves the documented legacy single-tenant behavior for explicit opt-ins.
    expect(vectorIndex.query).toHaveBeenCalledWith(
      [0.1, 0.2, 0.3],
      { organizationId: "", scopes: [{ scopeType: "project", scopeId: "project-alpha" }], projectKey: "project-alpha" },
      5,
    );
    expect(repository.getMemoryRecordsByIds).toHaveBeenCalledWith(
      [12],
      undefined,
      true,
    );
  });

  it("preserves vector scores when ranking hydrated records", async () => {
    const vectorIndex = {
      query: vi.fn().mockResolvedValue([
        { id: "chunk:12", score: 0.95, payload: { memory_record_id: 12 } },
        { id: "chunk:13", score: 0.2, payload: { memory_record_id: 13 } },
      ]),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
      ensureCollection: vi.fn(),
    };

    const baseRecord = {
      sourceId: 202,
      scopeType: "project" as const,
      scopeId: "project-alpha",
      memoryType: "summary" as const,
      content: "Project retrieval summary.",
      createdAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:00.000Z",
      source: {
        id: 302,
        scopeType: "project" as const,
        scopeId: "project-alpha",
        sourceType: "document" as const,
        externalId: "doc",
        title: "Doc",
        uri: "file:///tmp/doc.md",
        createdAt: "2026-04-25T00:00:00.000Z",
      },
    };
    const repository = {
      getMemoryRecordsByIds: vi.fn().mockResolvedValue([
        { ...baseRecord, id: 12 },
        { ...baseRecord, id: 13 },
      ]),
    };

    const results = await retrieveMemory({
      vectorIndex: vectorIndex as never,
      repository: repository as never,
      vector: [0.1, 0.2, 0.3],
      organizationId: "dev-team",
      projectKey: "project-alpha",
      limit: 5,
    });

    expect(results.map((result) => result.id)).toEqual([12, 13]);
  });
});
