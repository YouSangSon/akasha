import { describe, expect, it, vi } from "vitest";
import {
  retrieveMemory,
  type RetrieveMemoryInput,
} from "../../src/search/retrieve-memory.js";

const callRetrieveMemory = (input: unknown) =>
  retrieveMemory(input as RetrieveMemoryInput);

function createValidRetrieveInput(
  overrides: Record<string, unknown> = {},
): RetrieveMemoryInput {
  return ({
    vectorIndex: {
      query: vi.fn().mockResolvedValue([]),
    },
    repository: {
      getMemoryRecordsByIds: vi.fn().mockResolvedValue([]),
    },
    vector: [0.1, 0.2, 0.3],
    organizationId: "dev-team",
    projectKey: "project-alpha",
    limit: 5,
    ...overrides,
  } as unknown) as RetrieveMemoryInput;
}

describe("retrieveMemory", () => {
  it.each([undefined, null, "input", 12, true, []])(
    "rejects non-object direct input",
    async (input) => {
      await expect(callRetrieveMemory(input)).rejects.toThrow(
        "retrieveMemory input must be an object",
      );
    },
  );

  it.each([
    [{ vectorIndex: null }, "vectorIndex must be an object"],
    [
      { vectorIndex: { query: "search" } },
      "vectorIndex.query must be a function",
    ],
    [{ repository: null }, "repository must be an object"],
    [
      { repository: {} },
      "repository.getMemoryRecordsByIds must be a function",
    ],
    [
      {
        repository: {
          getMemoryRecordsByIds: vi.fn().mockResolvedValue([]),
          searchMemory: true,
        },
      },
      "repository.searchMemory must be a function",
    ],
    [{ vector: [] }, "vector must be a non-empty array"],
    [{ vector: [0.1, Infinity] }, "vector[1] must be a finite number"],
    [{ organizationId: 12 }, "organizationId must be a string"],
    [{ query: 12 }, "query must be a string"],
    [{ allowLegacyAnonymous: "true" }, "allowLegacyAnonymous must be a boolean"],
    [
      { projectKey: " \n\t " },
      "projectKey must contain non-whitespace text",
    ],
    [{ userScopeId: "" }, "userScopeId must contain non-whitespace text"],
    [{ limit: 0 }, "limit must be a positive safe integer"],
  ])("rejects invalid direct input field", async (overrides, message) => {
    await expect(
      retrieveMemory(
        createValidRetrieveInput(overrides as Record<string, unknown>),
      ),
    ).rejects.toThrow(message);
  });

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

  it("ignores vector hits with invalid memory record ids before hydration", async () => {
    const vectorIndex = {
      query: vi.fn().mockResolvedValue([
        { id: "chunk:no-payload", score: 0.99, payload: {} },
        { id: "chunk:string", score: 0.98, payload: { memory_record_id: "12" } },
        { id: "chunk:zero", score: 0.97, payload: { memory_record_id: 0 } },
        {
          id: "chunk:fraction",
          score: 0.96,
          payload: { memory_record_id: 12.5 },
        },
        { id: "chunk:nan", score: 0.95, payload: { memory_record_id: NaN } },
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
          content: "Only valid vector payload ids should hydrate.",
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

    const results = await retrieveMemory({
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
    expect(results.map((result) => result.id)).toEqual([12]);
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

  it("throws when organizationId is whitespace-only before vector lookup", async () => {
    const vectorIndex = { query: vi.fn(), upsert: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), ensureCollection: vi.fn() };
    const repository = { getMemoryRecordsByIds: vi.fn() };

    await expect(
      retrieveMemory({
        vectorIndex: vectorIndex as never,
        repository: repository as never,
        vector: [0.1, 0.2, 0.3],
        organizationId: " \n\t ",
        allowLegacyAnonymous: true,
        projectKey: "project-alpha",
        limit: 5,
      }),
    ).rejects.toThrow(/organizationId/i);

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

  it("returns lexical-only candidates when vector search misses", async () => {
    const vectorIndex = {
      query: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
      ensureCollection: vi.fn(),
    };

    const lexicalRecord = {
      id: 44,
      sourceId: 204,
      scopeType: "project" as const,
      scopeId: "project-alpha",
      memoryType: "decision" as const,
      title: "Timeout retry ADR",
      content: "Decision: fix timeout failures with bounded retry backoff.",
      summary: "Timeout retry backoff",
      createdAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:00.000Z",
      source: {
        id: 304,
        scopeType: "project" as const,
        scopeId: "project-alpha",
        sourceType: "decision" as const,
        externalId: "adr-timeout",
        sourceRef: "adr-timeout",
        title: "Timeout ADR",
        uri: "file:///tmp/timeout.md",
        createdAt: "2026-04-25T00:00:00.000Z",
      },
    };
    const repository = {
      searchMemory: vi.fn().mockResolvedValue([lexicalRecord]),
      getMemoryRecordsByIds: vi.fn(),
    };

    const results = await retrieveMemory({
      vectorIndex: vectorIndex as never,
      repository: repository as never,
      vector: [0.1, 0.2, 0.3],
      query: "timeout retry backoff",
      organizationId: "dev-team",
      projectKey: "project-alpha",
      limit: 5,
    });

    expect(repository.searchMemory).toHaveBeenCalledWith({
      query: "timeout retry backoff",
      scopes: [{ scopeType: "project", scopeId: "project-alpha" }],
      organizationId: "dev-team",
      limit: 20,
    });
    expect(repository.getMemoryRecordsByIds).not.toHaveBeenCalled();
    expect(results.map((result) => result.id)).toEqual([44]);
  });

  it("caps lexical oversampling before calling the repository", async () => {
    const vectorIndex = {
      query: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
      ensureCollection: vi.fn(),
    };
    const repository = {
      searchMemory: vi.fn().mockResolvedValue([]),
      getMemoryRecordsByIds: vi.fn(),
    };

    await retrieveMemory({
      vectorIndex: vectorIndex as never,
      repository: repository as never,
      vector: [0.1, 0.2, 0.3],
      query: "timeout retry backoff",
      organizationId: "dev-team",
      projectKey: "project-alpha",
      limit: 26,
    });

    expect(repository.searchMemory).toHaveBeenCalledWith({
      query: "timeout retry backoff",
      scopes: [{ scopeType: "project", scopeId: "project-alpha" }],
      organizationId: "dev-team",
      limit: 100,
    });
  });

  it("fuses vector and lexical evidence for the same record", async () => {
    const vectorIndex = {
      query: vi.fn().mockResolvedValue([
        { id: "chunk:12", score: 0.68, payload: { memory_record_id: 12 } },
        { id: "chunk:13", score: 0.95, payload: { memory_record_id: 13 } },
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
    const hybridRecord = {
      ...baseRecord,
      id: 12,
      title: "Qdrant retry policy",
      content: "Retry Qdrant snapshot cleanup with bounded backoff.",
    };
    const vectorOnlyRecord = {
      ...baseRecord,
      id: 13,
      title: "General retrieval note",
      content: "Project retrieval summary.",
    };
    const repository = {
      searchMemory: vi.fn().mockResolvedValue([hybridRecord]),
      getMemoryRecordsByIds: vi.fn().mockResolvedValue([
        hybridRecord,
        vectorOnlyRecord,
      ]),
    };

    const results = await retrieveMemory({
      vectorIndex: vectorIndex as never,
      repository: repository as never,
      vector: [0.1, 0.2, 0.3],
      query: "qdrant retry cleanup",
      organizationId: "dev-team",
      projectKey: "project-alpha",
      limit: 5,
    });

    expect(results.map((result) => result.id)).toEqual([12, 13]);
  });
});
