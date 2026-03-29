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
