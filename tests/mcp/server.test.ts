import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod/v4";
import { createMcpServer, createToolRegistry } from "../../src/mcp/server.js";
import { createToolRegistry as createToolRegistryDirect } from "../../src/mcp/tool-registry.js";
import type { AuditLogRepository } from "../../src/audit/audit-log-repository.js";
import type { Logger } from "../../src/logger.js";
import { TOOL_DESCRIPTORS } from "../../src/mcp/tool-schemas.js";
import type { ToolRegistry } from "../../src/mcp/types.js";
import type { MemoryRepository, SearchMemoryResult } from "../../src/types.js";

async function createInMemoryClient(server: McpServer): Promise<Client> {
  const client = new Client({ name: "akasha-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

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
    organizationId?: string;
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
    ...(overrides.organizationId
      ? { organizationId: overrides.organizationId }
      : {}),
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

function buildAuditLog(): AuditLogRepository {
  return {
    record: vi.fn().mockResolvedValue(undefined),
    listByOrganization: vi.fn().mockResolvedValue([]),
  };
}

function buildLogger(): Logger {
  const childLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  return {
    child: vi.fn(() => childLogger),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger;
}

describe("createToolRegistry", () => {
  it("keeps createToolRegistry available from the split registry module and server re-export", async () => {
    const directRegistry = createToolRegistryDirect({
      repository: createRepository(),
      defaultUserScopeId: "user-a",
    });
    const serverRegistry = createToolRegistry({
      repository: createRepository(),
      defaultUserScopeId: "user-a",
    });

    expect(Object.keys(directRegistry).sort()).toEqual(Object.keys(serverRegistry).sort());
    await expect(
      directRegistry.add_memory({
        projectKey: "p",
        kind: "decision",
        content: "split registry works",
      }),
    ).resolves.toMatchObject({ ok: true });
  });

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
    expect(services.ingestJobs.create).toHaveBeenCalledWith({
      memoryRecordId: 501,
      organizationId: "default",
    });
    expect(services.chunkRepository.insertChunks).toHaveBeenCalledOnce();
    // F4: writeCanonicalMemory now batches per-chunk embeddings into a single
    // embedBatch call instead of N sequential embed calls.
    expect(services.embeddings.embedBatch).toHaveBeenCalled();
    expect(services.vectorIndex.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            memory_record_id: 501,
          }),
        }),
      ]),
    );
  });

  it("preserves a non-default organization on service-backed ingest jobs", async () => {
    const services = createCanonicalServices();
    services.repository.addMemory.mockResolvedValueOnce(
      createRecord({
        id: 501,
        organizationId: "org-a",
        memoryType: "decision",
        content: "Decision: index canonical memory into the active vector backend.",
        sourceType: "conversation",
        externalId: "decision:manual",
      }),
    );
    const registry = createToolRegistry({
      resolveCanonicalServices: async () => services,
    });

    await registry.add_memory({
      organizationId: "org-a",
      projectKey: "project-alpha",
      kind: "decision",
      content: "Decision: index canonical memory into the active vector backend.",
    });

    expect(services.repository.addMemory).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-a" }),
    );
    expect(services.ingestJobs.create).toHaveBeenCalledWith({
      memoryRecordId: 501,
      organizationId: "org-a",
    });
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
    services.vectorIndex.query.mockResolvedValue([
      { id: "chunk:12", score: 0.9, payload: { memory_record_id: 12 } },
    ]);
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
      // escape hatch. Use a non-default tenant so the persistence row proves it
      // keeps the request's org attribution instead of falling back to "default".
      organizationId: "org-a",
      task: "continue work",
    });

    expect(result.selectedMemoryIds).toEqual(["project:project-alpha:12"]);
    expect(services.chunkRepository.createContextPackRun).toHaveBeenCalledWith({
      organizationId: "org-a",
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
        organizationId: "org-a",
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
        organizationId: "org-a",
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
      organizationId: "org-a",
      projectKey: "project-alpha",
    });

    expect(result).toEqual({
      ok: true,
      projectKey: "project-alpha",
      chunkCount: 2,
      scopes: ["project:project-alpha", "user:alice"],
    });
    const scopes = [
      { scopeType: "project", scopeId: "project-alpha" },
      { scopeType: "user", scopeId: "alice" },
    ];
    expect(services.chunkRepository.listChunks).toHaveBeenNthCalledWith(
      1,
      "org-a",
      scopes,
      { limit: 500 },
    );
    expect(services.chunkRepository.listChunks).toHaveBeenNthCalledWith(
      2,
      "org-a",
      scopes,
      { limit: 500 },
    );
    expect(services.vectorIndex.deleteByRecordIds).toHaveBeenCalledWith(
      [501, 502],
      { organizationId: "org-a" },
    );
    const deleteOrder =
      services.vectorIndex.deleteByRecordIds.mock.invocationCallOrder[0]!;
    const upsertOrder = services.vectorIndex.upsert.mock.invocationCallOrder[0]!;
    expect(deleteOrder).toBeLessThan(upsertOrder);
    expect(services.vectorIndex.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
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
    expect(services.vectorIndex.delete).toHaveBeenCalledWith(["pt-902"], {
      organizationId: "dev-team",
    });
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
    // computeSemanticGroups now calls embedBatch once with all 3 contents
    // in input order (para1, para2, distinct), so return all 3 vectors.
    (services.embeddings.embedBatch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        [1, 0, 0],        // para1
        [0.99, 0.01, 0],  // para2 — near-identical to para1
        [0, 1, 0],        // distinct — orthogonal
      ]);

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
    // Single batch call replaced 3 sequential embed() calls.
    expect(services.embeddings.embedBatch).toHaveBeenCalledOnce();
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

describe("createMcpServer", () => {
  it("declares one descriptor for every ToolRegistry method", () => {
    const descriptorNames = TOOL_DESCRIPTORS.map((descriptor) => descriptor.name).sort();
    expect(descriptorNames).toEqual([
      "add_memory",
      "build_context_pack",
      "compact_memory",
      "list_audit_log",
      "reindex_memory",
      "search_memory",
      "unarchive_memory",
    ]);

    for (const descriptor of TOOL_DESCRIPTORS) {
      expect(descriptor.description.length).toBeGreaterThan(20);
      expect(Object.keys(descriptor.inputSchema).length).toBeGreaterThan(0);
    }
  });

  it("registers all 7 tools on the MCP stdio transport", () => {
    const registeredNames: string[] = [];
    const spy = vi
      .spyOn(McpServer.prototype, "registerTool")
      .mockImplementation((name: string) => {
        registeredNames.push(name);
        return undefined as unknown as ReturnType<McpServer["registerTool"]>;
      });

    createMcpServer();

    spy.mockRestore();

    expect(registeredNames.sort()).toEqual(
      [
        "add_memory",
        "search_memory",
        "build_context_pack",
        "reindex_memory",
        "compact_memory",
        "unarchive_memory",
        "list_audit_log",
      ].sort(),
    );
  });

  it("forwards auditLog, defaultActor, and logger to the auto-created registry", async () => {
    const auditLog = buildAuditLog();
    const logger = buildLogger();
    const handlers: Map<string, (input: unknown) => Promise<unknown>> = new Map();
    const spy = vi
      .spyOn(McpServer.prototype, "registerTool")
      .mockImplementation((name: string, _schema: unknown, handler: (input: unknown) => Promise<unknown>) => {
        handlers.set(name, handler);
        return undefined as unknown as ReturnType<McpServer["registerTool"]>;
      });

    createMcpServer({
      repository: createRepository(),
      auditLog,
      defaultActor: "alice@example.com",
      logger,
    });
    spy.mockRestore();

    await handlers.get("add_memory")!({
      organizationId: "dev-team",
      projectKey: "project-alpha",
      kind: "decision",
      content: "Decision: audit MCP-created registries.",
    });

    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "dev-team",
        actor: "alice@example.com",
        tool: "add_memory",
        projectKey: "project-alpha",
        outcome: "ok",
      }),
    );
    expect(logger.child).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: "add_memory",
        projectKey: "project-alpha",
      }),
    );
  });

  it("dispatches reindex_memory to the registry handler", async () => {
    const registry: ToolRegistry = {
      add_memory: vi.fn(),
      search_memory: vi.fn(),
      build_context_pack: vi.fn(),
      reindex_memory: vi.fn().mockResolvedValue({
        ok: true,
        projectKey: "p",
        scopes: ["project:p"],
        chunkCount: 3,
      }),
      compact_memory: vi.fn(),
      list_audit_log: vi.fn(),
      unarchive_memory: vi.fn(),
    } as unknown as ToolRegistry;

    const handlers: Map<string, (input: unknown) => Promise<unknown>> = new Map();
    const spy = vi
      .spyOn(McpServer.prototype, "registerTool")
      .mockImplementation((name: string, _schema: unknown, handler: (input: unknown) => Promise<unknown>) => {
        handlers.set(name, handler);
        return undefined as unknown as ReturnType<McpServer["registerTool"]>;
      });

    createMcpServer({ registry });
    spy.mockRestore();

    const handler = handlers.get("reindex_memory")!;
    expect(handler).toBeDefined();

    const result = await handler({ organizationId: "org-a", projectKey: "p" });

    expect(registry.reindex_memory).toHaveBeenCalledWith({
      organizationId: "org-a",
      projectKey: "p",
    });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { ok: true, projectKey: "p", scopes: ["project:p"], chunkCount: 3 },
            null,
            2,
          ),
        },
      ],
      structuredContent: {
        ok: true,
        projectKey: "p",
        scopes: ["project:p"],
        chunkCount: 3,
      },
    });
  });

  it("dispatches unarchive_memory to the registry handler", async () => {
    const registry: ToolRegistry = {
      add_memory: vi.fn(),
      search_memory: vi.fn(),
      build_context_pack: vi.fn(),
      reindex_memory: vi.fn(),
      compact_memory: vi.fn(),
      list_audit_log: vi.fn(),
      unarchive_memory: vi.fn().mockResolvedValue({
        ok: true,
        outcomes: [{ archiveId: 7, status: "restored", restoredRecordId: 100, sourceRecordId: 5, chunkCount: 2 }],
        restoredCount: 1,
        skippedCount: 0,
        failedCount: 0,
      }),
    } as unknown as ToolRegistry;

    const handlers: Map<string, (input: unknown) => Promise<unknown>> = new Map();
    const spy = vi
      .spyOn(McpServer.prototype, "registerTool")
      .mockImplementation((name: string, _schema: unknown, handler: (input: unknown) => Promise<unknown>) => {
        handlers.set(name, handler);
        return undefined as unknown as ReturnType<McpServer["registerTool"]>;
      });

    createMcpServer({ registry });
    spy.mockRestore();

    const handler = handlers.get("unarchive_memory")!;
    expect(handler).toBeDefined();

    const result = await handler({ archiveIds: [7] });

    expect(registry.unarchive_memory).toHaveBeenCalledWith({ archiveIds: [7] });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: true,
              outcomes: [{ archiveId: 7, status: "restored", restoredRecordId: 100, sourceRecordId: 5, chunkCount: 2 }],
              restoredCount: 1,
              skippedCount: 0,
              failedCount: 0,
            },
            null,
            2,
          ),
        },
      ],
      structuredContent: {
        ok: true,
        outcomes: [{ archiveId: 7, status: "restored", restoredRecordId: 100, sourceRecordId: 5, chunkCount: 2 }],
        restoredCount: 1,
        skippedCount: 0,
        failedCount: 0,
      },
    });
  });

  it("semanticDedupThreshold is present in the compact_memory inputSchema and survives z.object() parse", async () => {
    // The MCP SDK wraps registerTool's inputSchema in z.object() before parsing
    // incoming tool calls. If semanticDedupThreshold is absent from inputSchema,
    // z.object().strict() would strip it (and our real SDK call would silently drop
    // it). This test captures the raw schema object and replicates that parse so
    // the assertion fails when the field is removed from src/mcp/server.ts.
    type SchemaArg = { inputSchema: Record<string, z.ZodTypeAny> };
    let capturedSchema: SchemaArg | undefined;

    const spy = vi
      .spyOn(McpServer.prototype, "registerTool")
      .mockImplementation((name: string, schema: unknown, _handler: unknown) => {
        if (name === "compact_memory") {
          capturedSchema = schema as SchemaArg;
        }
        return undefined as unknown as ReturnType<McpServer["registerTool"]>;
      });

    createMcpServer({ registry: {} as unknown as ToolRegistry });
    spy.mockRestore();

    expect(capturedSchema).toBeDefined();

    // Replicate what the MCP SDK does: wrap inputSchema fields in z.object() and
    // parse — this strips any unknown fields not declared in the schema.
    const parsed = z.object(capturedSchema!.inputSchema).parse({
      projectKey: "p",
      semanticDedupThreshold: 0.95,
    });

    // If semanticDedupThreshold were missing from inputSchema, z.object() would
    // strip it and this assertion would fail.
    expect(parsed).toMatchObject({ projectKey: "p", semanticDedupThreshold: 0.95 });
  });

  it("requires organizationId in the reindex_memory inputSchema", async () => {
    type SchemaArg = { inputSchema: Record<string, z.ZodTypeAny> };
    let capturedSchema: SchemaArg | undefined;

    const spy = vi
      .spyOn(McpServer.prototype, "registerTool")
      .mockImplementation((name: string, schema: unknown, _handler: unknown) => {
        if (name === "reindex_memory") {
          capturedSchema = schema as SchemaArg;
        }
        return undefined as unknown as ReturnType<McpServer["registerTool"]>;
      });

    createMcpServer({ registry: {} as unknown as ToolRegistry });
    spy.mockRestore();

    expect(capturedSchema).toBeDefined();

    const schema = z.object(capturedSchema!.inputSchema);
    expect(() => schema.parse({ projectKey: "p" })).toThrow();
    expect(
      schema.parse({ organizationId: "org-a", projectKey: "p" }),
    ).toMatchObject({
      organizationId: "org-a",
      projectKey: "p",
    });
  });
});

describe("createMcpServer structured outputs", () => {
  it("advertises output schemas for all registered tools", async () => {
    const server = createMcpServer({
      registry: buildRegistryForMcpProtocol(),
    });
    const client = await createInMemoryClient(server);

    const tools = await client.listTools();

    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(
      TOOL_DESCRIPTORS.map((tool) => tool.name).sort(),
    );
    for (const tool of tools.tools) {
      expect(tool.outputSchema).toEqual(expect.objectContaining({ type: "object" }));
    }

    const compactMemory = tools.tools.find((tool) => tool.name === "compact_memory");
    expect(compactMemory?.outputSchema).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          duplicateGroups: expect.objectContaining({
            items: expect.objectContaining({
              properties: expect.objectContaining({
                keepId: expect.any(Object),
                archiveIds: expect.any(Object),
              }),
            }),
          }),
          decayCandidates: expect.objectContaining({
            items: expect.objectContaining({
              properties: expect.objectContaining({
                id: expect.any(Object),
                score: expect.any(Object),
              }),
            }),
          }),
          applyStats: expect.objectContaining({
            properties: expect.objectContaining({
              archived: expect.any(Object),
              skipped: expect.any(Object),
              qdrantPointsDeleted: expect.any(Object),
              qdrantPointsPending: expect.any(Object),
              durationMs: expect.any(Object),
            }),
          }),
        }),
      }),
    );

    const unarchiveMemory = tools.tools.find((tool) => tool.name === "unarchive_memory");
    expect(unarchiveMemory?.outputSchema).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          outcomes: expect.objectContaining({
            items: expect.objectContaining({
              anyOf: expect.arrayContaining([
                expect.objectContaining({
                  properties: expect.objectContaining({
                    status: expect.objectContaining({ const: "restored" }),
                    restoredRecordId: expect.any(Object),
                    sourceRecordId: expect.any(Object),
                    chunkCount: expect.any(Object),
                  }),
                }),
                expect.objectContaining({
                  properties: expect.objectContaining({
                    status: expect.objectContaining({ const: "skipped" }),
                    reason: expect.any(Object),
                  }),
                }),
                expect.objectContaining({
                  properties: expect.objectContaining({
                    status: expect.objectContaining({ const: "failed" }),
                    error: expect.any(Object),
                  }),
                }),
              ]),
            }),
          }),
        }),
      }),
    );

    await client.close();
    await server.close();
  });

  it("returns structuredContent while retaining JSON text content", async () => {
    const server = createMcpServer({
      registry: buildRegistryForMcpProtocol(),
    });
    const client = await createInMemoryClient(server);

    const result = await client.callTool({
      name: "search_memory",
      arguments: {
        organizationId: "org-a",
        projectKey: "project-alpha",
        query: "Postgres",
      },
    });

    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: true,
        projectKey: "project-alpha",
        query: "Postgres",
      }),
    );
    expect(result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify(result.structuredContent, null, 2),
      },
    ]);

    await client.close();
    await server.close();
  });
});

describe("createMcpServer resources and prompts", () => {
  it("lists and reads Akasha memory resources", async () => {
    const registry = buildRegistryForMcpProtocol();
    const server = createMcpServer({ registry });
    const client = await createInMemoryClient(server);

    const templates = await client.listResourceTemplates();
    expect(templates.resourceTemplates.map((resource) => resource.name)).toEqual(
      expect.arrayContaining(["recent-project-memory", "context-pack"]),
    );

    const recent = await client.readResource({
      uri: "akasha://memory/recent/project-alpha?organizationId=org-a&query=Postgres",
    });
    const [recentContent] = recent.contents;
    expect(recentContent).toEqual(
      expect.objectContaining({
        uri: "akasha://memory/recent/project-alpha?organizationId=org-a&query=Postgres",
        mimeType: "application/json",
      }),
    );
    expect(
      JSON.parse(recentContent && "text" in recentContent ? recentContent.text : "{}"),
    ).toEqual(
      expect.objectContaining({ ok: true, projectKey: "project-alpha" }),
    );

    await client.close();
    await server.close();
  });

  it("lists and returns Akasha prompts", async () => {
    const server = createMcpServer({ registry: buildRegistryForMcpProtocol() });
    const client = await createInMemoryClient(server);

    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((prompt) => prompt.name)).toEqual(
      expect.arrayContaining(["akasha_session_start", "akasha_store_memory"]),
    );

    const prompt = await client.getPrompt({
      name: "akasha_session_start",
      arguments: {
        projectKey: "project-alpha",
        task: "continue implementation",
        organizationId: "org-a",
      },
    });
    expect(prompt.messages[0]?.content).toEqual(
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("continue implementation"),
      }),
    );

    await client.close();
    await server.close();
  });
});

function buildRegistryForMcpProtocol(): ToolRegistry {
  return {
    add_memory: vi.fn().mockResolvedValue({
      ok: true,
      memoryId: "101",
      summary: "stored",
    }),
    search_memory: vi.fn().mockResolvedValue({
      ok: true,
      projectKey: "project-alpha",
      query: "Postgres",
      results: [
        createRecord({
          id: 12,
          organizationId: "org-a",
          memoryType: "decision",
          content: "Decision: use Postgres for canonical state.",
          sourceType: "decision",
          externalId: "adr-1",
        }),
      ],
    }),
    build_context_pack: vi.fn().mockResolvedValue({
      ok: true,
      projectKey: "project-alpha",
      packMarkdown: "# Context Pack\n\n- Decision: use Postgres",
      selectedMemoryIds: ["project:project-alpha:12"],
      sections: {
        project_summary: [],
        recent_decisions: [],
        constraints: [],
        open_questions: [],
        relevant_notes: [],
      },
    }),
    reindex_memory: vi.fn().mockResolvedValue({
      ok: true,
      projectKey: "project-alpha",
      scopes: ["project:project-alpha"],
      chunkCount: 1,
    }),
    compact_memory: vi.fn().mockResolvedValue({
      ok: true,
      projectKey: "project-alpha",
      dryRun: true,
      archivedIds: [],
      duplicateGroups: [],
      decayCandidates: [],
      promotionCandidates: [],
      summary: "noop",
    }),
    unarchive_memory: vi.fn().mockResolvedValue({
      ok: true,
      outcomes: [],
      restoredCount: 0,
      skippedCount: 0,
      failedCount: 0,
    }),
    list_audit_log: vi.fn().mockResolvedValue({
      ok: true,
      organizationId: "org-a",
      entries: [],
    }),
  };
}

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
      // Rollback path stub (resolves to undefined). The shared canonical-services
      // factory must satisfy the full CanonicalMemoryRepository interface so
      // the strongly-typed mock continues to typecheck across all suites.
      deleteMemoryRecord: vi.fn().mockResolvedValue(undefined),
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
      getChunksByRecordId: vi.fn().mockResolvedValue([]),
      createContextPackRun: vi.fn().mockResolvedValue(undefined),
    },
    ingestJobs: {
      create: vi.fn().mockResolvedValue({
        id: 801,
        memoryRecordId: createdRecord.id,
        status: "pending",
        attempts: 0,
        lastError: null,
        qdrantStatus: "pending",
        qdrantAttempts: 0,
        qdrantNextRetryAt: null,
        qdrantLastError: null,
        createdAt: "2026-03-29T00:00:00.000Z",
        updatedAt: "2026-03-29T00:00:00.000Z",
      }),
      markCompleted: vi.fn().mockResolvedValue({
        id: 801,
        memoryRecordId: createdRecord.id,
        status: "completed",
        attempts: 0,
        lastError: null,
        qdrantStatus: "pending",
        qdrantAttempts: 0,
        qdrantNextRetryAt: null,
        qdrantLastError: null,
        createdAt: "2026-03-29T00:00:00.000Z",
        updatedAt: "2026-03-29T00:00:01.000Z",
      }),
      markFailed: vi.fn().mockResolvedValue({
        id: 801,
        memoryRecordId: createdRecord.id,
        status: "failed",
        attempts: 1,
        lastError: "test failure",
        qdrantStatus: "pending",
        qdrantAttempts: 0,
        qdrantNextRetryAt: null,
        qdrantLastError: null,
        createdAt: "2026-03-29T00:00:00.000Z",
        updatedAt: "2026-03-29T00:00:01.000Z",
      }),
      // Outbox sweeper hooks. Not called on the current canonical-indexing
      // path (Part 4/5 will wire markQdrantPending into the catch block); the
      // stubs exist to satisfy the IngestJobRepository contract.
      markQdrantCompleted: vi.fn(),
      markQdrantPending: vi.fn(),
      markQdrantFailed: vi.fn(),
      listPendingForRetry: vi.fn().mockResolvedValue([]),
      claimPendingForRetry: vi.fn().mockResolvedValue([]),
    },
    auditLog: {
      record: vi.fn().mockResolvedValue(undefined),
      listByOrganization: vi.fn().mockResolvedValue([]),
    },
    embeddings: {
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      // F4: writeCanonicalMemory + reindexCanonicalMemory now use embedBatch.
      // Mock returns the same 3-dim vector for every input so suites that vary
      // chunk count don't need provider arithmetic.
      embedBatch: vi
        .fn()
        .mockImplementation(async (inputs: string[]) =>
          inputs.map(() => [0.1, 0.2, 0.3]),
        ),
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
      claimPendingQdrantCleanup: vi.fn().mockResolvedValue([]),
      acquireScopeLock: vi.fn().mockResolvedValue(true),
      countRecentApplyRuns: vi.fn().mockResolvedValue(0),
      findArchiveByIds: vi.fn().mockResolvedValue([]),
      restoreToCanonical: vi.fn(),
      markUnarchived: vi.fn().mockResolvedValue(undefined),
    },
    vectorIndex: {
      upsert: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
      ensureCollection: vi.fn().mockResolvedValue(undefined),
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
