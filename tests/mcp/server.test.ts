import { describe, expect, it, vi } from "vitest";
import { createToolRegistry } from "../../src/mcp/server.js";
import type { MemoryRepository, SearchMemoryResult } from "../../src/types.js";

function createRepository(): MemoryRepository {
  const listedRecords = [
    createRecord({
      id: 11,
      memoryType: "summary",
      content: "Project Alpha keeps context local-first.",
      sourceType: "document",
      externalId: "readme",
    }),
    createRecord({
      id: 12,
      memoryType: "decision",
      content: "Decision: use Postgres for canonical memory state.",
      sourceType: "decision",
      externalId: "adr-1",
    }),
  ];

  return {
    addMemory(input) {
      return {
        id: 101,
        sourceId: 201,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        memoryType: input.memoryType,
        content: input.content,
        createdAt: "2026-03-29T00:00:00.000Z",
        updatedAt: "2026-03-29T00:00:00.000Z",
        source: {
          id: 201,
          scopeType: input.source.scopeType,
          scopeId: input.source.scopeId,
          sourceType: input.source.sourceType,
          externalId: input.source.externalId,
          title: input.source.title ?? null,
          uri: input.source.uri ?? null,
          createdAt: "2026-03-29T00:00:00.000Z",
        },
      };
    },
    searchMemory(input) {
      if (input.query === "project-alpha") {
        return [];
      }

      return [
        ...listedRecords,
      ];
    },
    listMemory(scope) {
      if (scope.scopeId !== "project-alpha") {
        return [];
      }

      return listedRecords;
    },
    getMemoryRecordsByIds(ids) {
      return ids.flatMap((id) => {
        const record = listedRecords.find((candidate) => candidate.id === id);
        return record ? [record] : [];
      });
    },
  };
}

function createProjectRepository(projectKey: string): MemoryRepository {
  const records = [
    createRecord({
      id: projectKey === "project-alpha" ? 21 : 31,
      memoryType: "summary",
      content: `Summary for ${projectKey}.`,
      sourceType: "document",
      externalId: `${projectKey}-summary`,
      scopeId: projectKey,
    }),
  ];

  return {
    addMemory(input) {
      return createRepository().addMemory(input);
    },
    searchMemory(input) {
      return records.filter(() => input.query === "continue work");
    },
    listMemory(scope) {
      return scope.scopeId === projectKey ? records : [];
    },
    getMemoryRecordsByIds(ids) {
      return ids.flatMap((id) => {
        const record = records.find((candidate) => candidate.id === id);
        return record ? [record] : [];
      });
    },
  };
}

function createUserRepository(userScopeId: string): MemoryRepository {
  const records = [
    createRecord({
      id: 41,
      scopeType: "user",
      scopeId: userScopeId,
      memoryType: "fact",
      content: "Use ripgrep first when searching the repository.",
      sourceType: "document",
      externalId: `${userScopeId}-tooling`,
    }),
  ];

  return {
    addMemory(input) {
      return {
        id: 202,
        sourceId: 302,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        memoryType: input.memoryType,
        content: input.content,
        createdAt: "2026-03-29T00:00:00.000Z",
        updatedAt: "2026-03-29T00:00:00.000Z",
        source: {
          id: 302,
          scopeType: input.source.scopeType,
          scopeId: input.source.scopeId,
          sourceType: input.source.sourceType,
          externalId: input.source.externalId,
          title: input.source.title ?? null,
          uri: input.source.uri ?? null,
          createdAt: "2026-03-29T00:00:00.000Z",
        },
      };
    },
    searchMemory(input) {
      return input.query === "continue work" ? records : [];
    },
    listMemory(scope) {
      return scope.scopeType === "user" && scope.scopeId === userScopeId
        ? records
        : [];
    },
    getMemoryRecordsByIds(ids) {
      return ids.flatMap((id) => {
        const record = records.find((candidate) => candidate.id === id);
        return record ? [record] : [];
      });
    },
  };
}

function createRecord(
  overrides: {
    id: number;
    scopeType?: SearchMemoryResult["scopeType"];
    memoryType: SearchMemoryResult["memoryType"];
    content: string;
    sourceType: SearchMemoryResult["source"]["sourceType"];
    externalId: string;
    scopeId?: string;
  },
): SearchMemoryResult {
  return {
    id: overrides.id,
    sourceId: overrides.id + 100,
    scopeType: overrides.scopeType ?? "project",
    scopeId: overrides.scopeId ?? "project-alpha",
    memoryType: overrides.memoryType,
    content: overrides.content,
    createdAt: "2026-03-29T00:00:00.000Z",
    updatedAt: "2026-03-29T00:00:00.000Z",
    source: {
      id: overrides.id + 100,
      scopeType: overrides.scopeType ?? "project",
      scopeId: overrides.scopeId ?? "project-alpha",
      sourceType: overrides.sourceType,
      externalId: overrides.externalId,
      title: overrides.externalId,
      uri: null,
      createdAt: "2026-03-29T00:00:00.000Z",
    },
  };
}

describe("createToolRegistry", () => {
  it("registers the four MVP tools", () => {
    const registry = createToolRegistry();

    expect(registry).toHaveProperty("add_memory");
    expect(registry).toHaveProperty("search_memory");
    expect(registry).toHaveProperty("build_context_pack");
    expect(registry).toHaveProperty("compact_memory");
  });

  it("adds memory using the Task 6 public tool contract", async () => {
    const registry = createToolRegistry({ repository: createRepository() });

    const result = await registry.add_memory({
      projectKey: "project-alpha",
      kind: "decision",
      content: "Use Postgres for canonical memory state.",
    });

    expect(result).toEqual({
      ok: true,
      memoryId: "101",
      summary: "Use Postgres for canonical memory state.",
    });
  });

  it("searches memory using the Task 6 public tool contract", async () => {
    const registry = createToolRegistry({ repository: createRepository() });

    const result = await registry.search_memory({
      projectKey: "project-alpha",
      query: "Postgres",
    });

    expect(result).toEqual({
      ok: true,
      projectKey: "project-alpha",
      query: "Postgres",
      results: [
        expect.objectContaining({ id: 12 }),
        expect.objectContaining({ id: 11 }),
      ],
    });
  });

  it("builds a context pack using the retrieve-memory service", async () => {
    const retrieveMemory = vi.fn().mockResolvedValue([
      createRecord({
        id: 12,
        memoryType: "decision",
        content: "Decision: keep project memory ahead of user memory.",
        sourceType: "decision",
        externalId: "adr-2",
      }),
    ]);
    const registry = createToolRegistry({
      defaultUserScopeId: "alice",
      retrieveMemory,
    });

    const result = await registry.build_context_pack({
      projectKey: "project-alpha",
      task: "continue work",
    });

    expect(retrieveMemory).toHaveBeenCalledWith({
      projectKey: "project-alpha",
      userScopeId: "alice",
      query: "continue work",
      limit: 10,
    });
    expect(result.ok).toBe(true);
    expect(result.projectKey).toBe("project-alpha");
    expect(result.packMarkdown).toContain("# Context Pack");
    expect(result.packMarkdown).toContain("Task: continue work");
    expect(result.selectedMemoryIds).toEqual(["project:project-alpha:12"]);
    expect(result.sections.recent_decisions).toEqual([
      expect.objectContaining({ id: 12 }),
    ]);
  });

  it("omits user scope from injected retrieval when includeUser is false", async () => {
    const retrieveMemory = vi.fn().mockResolvedValue([
      createRecord({
        id: 21,
        memoryType: "summary",
        content: "Summary for project-alpha.",
        sourceType: "document",
        externalId: "project-alpha-summary",
      }),
    ]);
    const registry = createToolRegistry({
      defaultUserScopeId: "alice",
      retrieveMemory,
    });

    const result = await registry.build_context_pack({
      projectKey: "project-alpha",
      task: "continue work",
      includeUser: false,
    });

    expect(retrieveMemory).toHaveBeenCalledWith({
      projectKey: "project-alpha",
      userScopeId: undefined,
      query: "continue work",
      limit: 10,
    });
    expect(result.selectedMemoryIds).toEqual(["project:project-alpha:21"]);
  });

  it("combines project and user memory when building a context pack", async () => {
    const registry = createToolRegistry({
      defaultUserScopeId: "alice",
      projectRepository: createProjectRepository("project-alpha"),
      userRepository: createUserRepository("alice"),
    });

    const result = await registry.build_context_pack({
      projectKey: "project-alpha",
      task: "continue work",
    });

    expect(result.selectedMemoryIds).toEqual([
      "project:project-alpha:21",
      "user:alice:41",
    ]);
    expect(result.sections.project_summary).toEqual([
      expect.objectContaining({ id: 21, scopeType: "project" }),
    ]);
    expect(result.sections.relevant_notes).toEqual([
      expect.objectContaining({ id: 41, scopeType: "user", scopeId: "alice" }),
    ]);
    expect(result.packMarkdown).toContain("project scope");
    expect(result.packMarkdown).toContain("user scope");
  });

  it("routes add_memory to the user store when scope is user", async () => {
    const registry = createToolRegistry({
      defaultUserScopeId: "alice",
      projectRepository: createProjectRepository("project-alpha"),
      userRepository: createUserRepository("alice"),
    });

    const result = await registry.add_memory({
      scope: "user",
      kind: "fact",
      content: "Always answer in Korean unless the repo says otherwise.",
    });

    expect(result).toEqual({
      ok: true,
      memoryId: "202",
      summary: "Always answer in Korean unless the repo says otherwise.",
    });
  });

  it("writes canonical memory through the indexing pipeline when using service-backed storage", async () => {
    const services = createCanonicalServices();
    const registry = createToolRegistry({
      resolveCanonicalServices: async () => services,
    });

    const result = await registry.add_memory({
      projectKey: "project-alpha",
      kind: "decision",
      content: "Decision: index canonical memory into qdrant on write.",
    });

    expect(result).toEqual({
      ok: true,
      memoryId: "501",
      summary: "Decision: index canonical memory into qdrant on write.",
    });
    expect(services.repository.addMemory).toHaveBeenCalledOnce();
    expect(services.ingestJobs.create).toHaveBeenCalledWith({ memoryRecordId: 501 });
    expect(services.chunkRepository.insertChunks).toHaveBeenCalledOnce();
    expect(services.embeddings.embed).toHaveBeenCalled();
    expect(services.qdrantClient.upsert).toHaveBeenCalledWith(
      "memory_chunks_v1",
      expect.objectContaining({
        points: expect.arrayContaining([
          expect.objectContaining({
            payload: expect.objectContaining({
              memory_record_id: 501,
            }),
          }),
        ]),
      }),
    );
  });

  it("searches project and user memories together by default", async () => {
    const registry = createToolRegistry({
      defaultUserScopeId: "alice",
      projectRepository: createProjectRepository("project-alpha"),
      userRepository: createUserRepository("alice"),
    });

    const result = await registry.search_memory({
      projectKey: "project-alpha",
      query: "continue work",
    });

    expect(result.results).toEqual([
      expect.objectContaining({ id: 21, scopeType: "project" }),
      expect.objectContaining({ id: 41, scopeType: "user", scopeId: "alice" }),
    ]);
  });

  it("resolves the repository using the requested project key", async () => {
    const registry = createToolRegistry({
      resolveRepository(projectKey) {
        return createProjectRepository(projectKey);
      },
    });

    const result = await registry.build_context_pack({
      projectKey: "project-beta",
      task: "continue work",
    });

    expect(result.projectKey).toBe("project-beta");
    expect(result.selectedMemoryIds).toEqual(["project:project-beta:31"]);
    expect(result.sections.project_summary).toEqual([
      expect.objectContaining({ scopeId: "project-beta" }),
    ]);
  });

  it("persists context pack runs when using service-backed retrieval", async () => {
    const services = createCanonicalServices();
    services.qdrantClient.query.mockResolvedValue({
      points: [{ payload: { memory_record_id: 12 } }],
    });
    services.repository.getMemoryRecordsByIds.mockResolvedValue([
      createRecord({
        id: 12,
        memoryType: "decision",
        content: "Decision: keep project memory ahead of user memory.",
        sourceType: "decision",
        externalId: "adr-2",
      }),
    ]);
    const registry = createToolRegistry({
      defaultUserScopeId: "alice",
      resolveCanonicalServices: async () => services,
    });

    const result = await registry.build_context_pack({
      projectKey: "project-alpha",
      task: "continue work",
    });

    expect(result.selectedMemoryIds).toEqual(["project:project-alpha:12"]);
    expect(services.chunkRepository.createContextPackRun).toHaveBeenCalledWith({
      projectKey: "project-alpha",
      task: "continue work",
      selectedMemoryIds: ["project:project-alpha:12"],
      packMarkdown: result.packMarkdown,
    });
  });

  it("reindexes project and user chunks through canonical services", async () => {
    const services = createCanonicalServices();
    services.chunkRepository.listChunks.mockResolvedValue([
      {
        id: 701,
        memoryRecordId: 501,
        chunkIndex: 0,
        content: "Project chunk",
        startOffset: 0,
        endOffset: 13,
        embeddingVersion: "v1",
        scopeType: "project",
        scopeId: "project-alpha",
        projectKey: "project-alpha",
        durability: "durable",
        kind: "decision",
        updatedAt: "2026-03-29T00:00:00.000Z",
      },
      {
        id: 702,
        memoryRecordId: 502,
        chunkIndex: 0,
        content: "User chunk",
        startOffset: 0,
        endOffset: 10,
        embeddingVersion: "v1",
        scopeType: "user",
        scopeId: "alice",
        projectKey: null,
        durability: "ephemeral",
        kind: "fact",
        updatedAt: "2026-03-29T00:00:00.000Z",
      },
    ]);
    const registry = createToolRegistry({
      defaultUserScopeId: "alice",
      resolveCanonicalServices: async () => services,
    });

    const result = await registry.reindex_memory({
      projectKey: "project-alpha",
    });

    expect(result).toEqual({
      ok: true,
      projectKey: "project-alpha",
      chunkCount: 2,
      scopes: ["project:project-alpha", "user:alice"],
    });
    expect(services.chunkRepository.listChunks).toHaveBeenCalledWith([
      { scopeType: "project", scopeId: "project-alpha" },
      { scopeType: "user", scopeId: "alice" },
    ]);
    expect(services.qdrantClient.upsert).toHaveBeenCalledWith(
      "memory_chunks_v1",
      expect.objectContaining({
        points: expect.arrayContaining([
          expect.objectContaining({
            payload: expect.objectContaining({
              memory_record_id: 501,
            }),
          }),
          expect.objectContaining({
            payload: expect.objectContaining({
              memory_record_id: 502,
            }),
          }),
        ]),
      }),
    );
  });

  it("compacts memory using the narrower Task 6 public tool contract", async () => {
    const registry = createToolRegistry({ repository: createRepository() });

    const result = await registry.compact_memory({
      projectKey: "project-alpha",
    });

    expect(result.ok).toBe(true);
    expect(result.projectKey).toBe("project-alpha");
    expect(result.dryRun).toBe(true);
    expect(result.archivedIds).toEqual([]);
    expect(result.mergedIds).toEqual([]);
    expect(result.promotionCandidates).toEqual(["12"]);
    expect(result.summary).toContain("Dry run");
  });

  it("compacts user memory when explicitly requested", async () => {
    const registry = createToolRegistry({
      defaultUserScopeId: "alice",
      projectRepository: createProjectRepository("project-alpha"),
      userRepository: createUserRepository("alice"),
    });

    const result = await registry.compact_memory({
      scope: "user",
      userScopeId: "alice",
    });

    expect(result.promotionCandidates).toEqual([]);
    expect(result.summary).toContain("alice");
  });
});

function createCanonicalServices() {
  const createdRecord = createRecord({
    id: 501,
    memoryType: "decision",
    content: "Decision: index canonical memory into qdrant on write.",
    sourceType: "conversation",
    externalId: "decision:manual",
  });

  return {
    repository: {
      addMemory: vi.fn().mockResolvedValue(createdRecord),
      searchMemory: vi.fn().mockResolvedValue([createdRecord]),
      listMemory: vi.fn().mockResolvedValue([createdRecord]),
      getMemoryRecordsByIds: vi.fn().mockResolvedValue([createdRecord]),
    },
    chunkRepository: {
      insertChunks: vi.fn().mockResolvedValue([
        {
          id: 701,
          memoryRecordId: createdRecord.id,
          chunkIndex: 0,
          content: createdRecord.content,
          startOffset: 0,
          endOffset: createdRecord.content.length,
          embeddingVersion: "v1",
        },
      ]),
      updatePointIds: vi.fn().mockResolvedValue(undefined),
      listChunks: vi.fn().mockResolvedValue([]),
      createContextPackRun: vi.fn().mockResolvedValue(undefined),
    },
    ingestJobs: {
      create: vi.fn().mockResolvedValue({
        id: 801,
        memoryRecordId: createdRecord.id,
        status: "pending",
        attempts: 0,
        lastError: null,
        createdAt: "2026-03-29T00:00:00.000Z",
        updatedAt: "2026-03-29T00:00:00.000Z",
      }),
      markCompleted: vi.fn().mockResolvedValue({
        id: 801,
        memoryRecordId: createdRecord.id,
        status: "completed",
        attempts: 0,
        lastError: null,
        createdAt: "2026-03-29T00:00:00.000Z",
        updatedAt: "2026-03-29T00:00:01.000Z",
      }),
    },
    embeddings: {
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    },
    qdrantClient: {
      upsert: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({
        points: [],
      }),
    },
    config: {
      qdrant: {
        collectionName: "memory_chunks_v1",
      },
      embedding: {
        provider: "openai" as const,
        model: "text-embedding-3-small",
        dimensions: 1536 as const,
        version: "v1" as const,
        chunkTargetTokens: 800 as const,
        chunkOverlapTokens: 120 as const,
      },
    },
    close: vi.fn().mockResolvedValue(undefined),
  };
}
