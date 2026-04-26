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
    // Task line MUST be at the bottom (after body + separator) so the stable
    // prefix is cache-eligible. Regression guard for /perf review fix.
    const taskIndex = result.packMarkdown.indexOf("Task: continue work");
    const headerIndex = result.packMarkdown.indexOf("# Context Pack");
    const separatorIndex = result.packMarkdown.lastIndexOf("---");
    expect(taskIndex).toBeGreaterThan(headerIndex);
    expect(taskIndex).toBeGreaterThan(separatorIndex);
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
      // Strict-org guard demands either organizationId or the LEGACY_ANONYMOUS_SEARCH
      // escape hatch — pass the explicit "default" tenant so this test stays
      // focused on context-pack persistence, not legacy-anonymous behavior.
      organizationId: "default",
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

  it("applies compaction (dryRun=false) via canonical services and returns archivedIds", async () => {
    const services = createCanonicalServices();

    // Two records with identical content → one duplicate group.
    const dup1 = createRecord({
      id: 901,
      content: "Decision: ship Friday",
      memoryType: "decision",
      sourceType: "decision",
      externalId: "ship-1",
    });
    const dup2 = createRecord({
      id: 902,
      content: "Decision: ship Friday",
      memoryType: "decision",
      sourceType: "decision",
      externalId: "ship-2",
    });
    services.repository.listMemory.mockResolvedValue([dup1, dup2]);
    // Override applyCompactionRecord to simulate a successful archive.
    (
      services.archiveRepository.applyCompactionRecord as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      archived: true,
      archiveId: 50,
      qdrantPointIds: ["pt-902"],
    });

    const registry = createToolRegistry({
      resolveCanonicalServices: async () => services,
    });

    const result = await registry.compact_memory({
      projectKey: "project-alpha",
      dryRun: false,
      organizationId: "dev-team",
      decayThreshold: 0,
    });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.archivedIds).toEqual(["902"]);
    expect(result.compactionRunId).toBeTypeOf("string");
    expect(result.applyStats?.archived).toBe(1);
    expect(result.applyStats?.qdrantPointsDeleted).toBe(1);
    expect(services.archiveRepository.createCompactionRun).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "dev-team", dryRun: false }),
    );
    expect(services.qdrantClient.deletePoints).toHaveBeenCalledWith(
      "memory_chunks_v1",
      ["pt-902"],
    );
  });

  it("apply path enforces multi-tenancy: organizationId flows to archiveRepository.applyCompactionRecord", async () => {
    const services = createCanonicalServices();
    const dup1 = createRecord({
      id: 1,
      content: "x",
      memoryType: "summary",
      sourceType: "document",
      externalId: "rec-1",
    });
    const dup2 = createRecord({
      id: 2,
      content: "x",
      memoryType: "summary",
      sourceType: "document",
      externalId: "rec-2",
    });
    services.repository.listMemory.mockResolvedValue([dup1, dup2]);
    (
      services.archiveRepository.applyCompactionRecord as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      archived: true,
      archiveId: 1,
      qdrantPointIds: [],
    });

    const registry = createToolRegistry({
      resolveCanonicalServices: async () => services,
    });

    await registry.compact_memory({
      projectKey: "project-alpha",
      dryRun: false,
      organizationId: "finance-team",
      decayThreshold: 0,
    });

    expect(services.archiveRepository.applyCompactionRecord).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "finance-team" }),
    );
  });

  it("apply path replay: when run.status='completed', no archiveRepository.applyCompactionRecord call", async () => {
    const services = createCanonicalServices();
    services.repository.listMemory.mockResolvedValue([
      createRecord({
        id: 1,
        content: "x",
        memoryType: "summary",
        sourceType: "document",
        externalId: "rec-1",
      }),
      createRecord({
        id: 2,
        content: "x",
        memoryType: "summary",
        sourceType: "document",
        externalId: "rec-2",
      }),
    ]);
    (
      services.archiveRepository.createCompactionRun as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: 99,
      organizationId: "default",
      status: "completed",
      archivedCount: 7,
      duplicateCount: 7,
      decayCount: 0,
      qdrantFailed: 0,
    });

    const registry = createToolRegistry({
      resolveCanonicalServices: async () => services,
    });

    const result = await registry.compact_memory({
      projectKey: "project-alpha",
      dryRun: false,
      decayThreshold: 0,
    });

    expect(result.summary).toContain("Replay");
    expect(result.applyStats?.archived).toBe(7);
    expect(
      services.archiveRepository.applyCompactionRecord,
    ).not.toHaveBeenCalled();
  });

  it("apply path refuses with rate-limit error when org has a recent run", async () => {
    const services = createCanonicalServices();
    services.repository.listMemory.mockResolvedValue([
      createRecord({
        id: 1,
        content: "x",
        memoryType: "summary",
        sourceType: "document",
        externalId: "rec-1",
      }),
      createRecord({
        id: 2,
        content: "x",
        memoryType: "summary",
        sourceType: "document",
        externalId: "rec-2",
      }),
    ]);
    (
      services.archiveRepository.countRecentApplyRuns as ReturnType<typeof vi.fn>
    ).mockResolvedValue(1);

    const registry = createToolRegistry({
      resolveCanonicalServices: async () => services,
    });

    await expect(
      registry.compact_memory({
        projectKey: "project-alpha",
        dryRun: false,
        decayThreshold: 0,
      }),
    ).rejects.toThrow(/rate-limited/);
    expect(
      services.archiveRepository.createCompactionRun,
    ).not.toHaveBeenCalled();
  });

  it("applies semantic dedup (P18) when semanticDedupThreshold is set", async () => {
    const services = createCanonicalServices();

    // Three records — two are paraphrases of each other; one is unrelated.
    // Content has no exact-string match, so exact-dedup would find zero.
    const para1 = createRecord({
      id: 11,
      content: "Use Postgres for canonical persistence.",
      memoryType: "decision",
      sourceType: "decision",
      externalId: "p-1",
    });
    const para2 = createRecord({
      id: 12,
      content: "PostgreSQL is the canonical store of record.",
      memoryType: "decision",
      sourceType: "decision",
      externalId: "p-2",
    });
    const distinct = createRecord({
      id: 13,
      content: "API rate limit is 60 req/min.",
      memoryType: "summary",
      sourceType: "document",
      externalId: "d-1",
    });
    services.repository.listMemory.mockResolvedValue([para1, para2, distinct]);

    // Embedding mock: paraphrase records share a near-identical vector;
    // distinct record gets an orthogonal one. Above 0.95 threshold the
    // first two cluster together; the third stays alone.
    (services.embeddings.embed as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(async () => [1, 0, 0])      // para1
      .mockImplementationOnce(async () => [0.99, 0.01, 0]) // para2 — near
      .mockImplementationOnce(async () => [0, 1, 0]);      // distinct

    const registry = createToolRegistry({
      resolveCanonicalServices: async () => services,
    });

    const result = await registry.compact_memory({
      projectKey: "project-alpha",
      dryRun: true,
      semanticDedupThreshold: 0.95,
      decayThreshold: 0,
    });

    expect(result.duplicateGroups).toHaveLength(1);
    // higher importance? both 0 — tie-break: lower id wins.
    expect(result.duplicateGroups[0]!.keepId).toBe("11");
    expect(result.duplicateGroups[0]!.archiveIds).toEqual(["12"]);
    expect(services.embeddings.embed).toHaveBeenCalledTimes(3);
  });

  it("rejects semantic dedup in legacy repository-override mode (no embedding client)", async () => {
    const registry = createToolRegistry({ repository: createRepository() });

    await expect(
      registry.compact_memory({
        projectKey: "project-alpha",
        semanticDedupThreshold: 0.95,
      }),
    ).rejects.toThrow(/semantic dedup requires canonical services/);
  });

  it("apply path errors when only legacy repository overrides are configured", async () => {
    const registry = createToolRegistry({ repository: createRepository() });

    await expect(
      registry.compact_memory({ projectKey: "project-alpha", dryRun: false }),
    ).rejects.toThrow(/legacy repository overrides are read-only/);
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

  it("invokes the resolveCanonicalServices factory once per tool call (test path contract)", async () => {
    const services = createCanonicalServices();
    const factory = vi.fn(async () => services);
    const registry = createToolRegistry({
      resolveCanonicalServices: factory,
    });

    await registry.add_memory({
      projectKey: "project-alpha",
      kind: "decision",
      content: "first decision",
    });
    await registry.add_memory({
      projectKey: "project-alpha",
      kind: "decision",
      content: "second decision",
    });

    expect(factory).toHaveBeenCalledTimes(2);
    expect(services.close).toHaveBeenCalledTimes(2);
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
      markFailed: vi.fn().mockResolvedValue({
        id: 801,
        memoryRecordId: createdRecord.id,
        status: "failed",
        attempts: 1,
        lastError: "test failure",
        createdAt: "2026-03-29T00:00:00.000Z",
        updatedAt: "2026-03-29T00:00:01.000Z",
      }),
    },
    embeddings: {
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    },
    archiveRepository: {
      createCompactionRun: vi.fn().mockResolvedValue({
        id: 1,
        organizationId: "default",
        status: "pending",
        archivedCount: 0,
        duplicateCount: 0,
        decayCount: 0,
        qdrantFailed: 0,
      }),
      findRunByIdempotencyKey: vi.fn().mockResolvedValue(null),
      applyCompactionRecord: vi
        .fn()
        .mockResolvedValue({ archived: false, qdrantPointIds: [] }),
      markQdrantStatus: vi.fn().mockResolvedValue(undefined),
      completeCompactionRun: vi.fn().mockResolvedValue(undefined),
      findPendingQdrantCleanup: vi.fn().mockResolvedValue([]),
      acquireScopeLock: vi.fn().mockResolvedValue(true),
      countRecentApplyRuns: vi.fn().mockResolvedValue(0),
      findArchiveByIds: vi.fn().mockResolvedValue([]),
      restoreToCanonical: vi.fn(),
      markUnarchived: vi.fn().mockResolvedValue(undefined),
    },
    qdrantClient: {
      upsert: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({
        points: [],
      }),
      deletePoints: vi.fn().mockResolvedValue(undefined),
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
