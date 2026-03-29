import { describe, expect, it } from "vitest";
import { createToolRegistry } from "../../src/mcp/server.js";
import type { MemoryRepository, SearchMemoryResult } from "../../src/types.js";

function createRepository(): MemoryRepository {
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
          content: "Decision: use SQLite with FTS for retrieval.",
          sourceType: "decision",
          externalId: "adr-1",
        }),
      ];
    },
    listMemory(scope) {
      if (scope.scopeId !== "project-alpha") {
        return [];
      }

      return [
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
          content: "Decision: use SQLite with FTS for retrieval.",
          sourceType: "decision",
          externalId: "adr-1",
        }),
      ];
    },
  };
}

function createProjectRepository(projectKey: string): MemoryRepository {
  return {
    addMemory(input) {
      return createRepository().addMemory(input);
    },
    searchMemory(input) {
      return [
        createRecord({
          id: projectKey === "project-alpha" ? 21 : 31,
          memoryType: "summary",
          content: `Summary for ${projectKey}.`,
          sourceType: "document",
          externalId: `${projectKey}-summary`,
          scopeId: projectKey,
        }),
      ].filter((record) => input.query === "continue work");
    },
    listMemory(scope) {
      return scope.scopeId === projectKey
        ? [
            createRecord({
              id: projectKey === "project-alpha" ? 21 : 31,
              memoryType: "summary",
              content: `Summary for ${projectKey}.`,
              sourceType: "document",
              externalId: `${projectKey}-summary`,
              scopeId: projectKey,
            }),
          ]
        : [];
    },
  };
}

function createRecord(
  overrides: {
    id: number;
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
    scopeType: "project",
    scopeId: overrides.scopeId ?? "project-alpha",
    memoryType: overrides.memoryType,
    content: overrides.content,
    createdAt: "2026-03-29T00:00:00.000Z",
    updatedAt: "2026-03-29T00:00:00.000Z",
    source: {
      id: overrides.id + 100,
      scopeType: "project",
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

  it("adds memory using the Task 6 public tool contract", () => {
    const registry = createToolRegistry({ repository: createRepository() });

    const result = registry.add_memory({
      projectKey: "project-alpha",
      kind: "decision",
      content: "Use SQLite for local-first memory retrieval.",
    });

    expect(result).toEqual({
      ok: true,
      memoryId: "101",
      summary: "Use SQLite for local-first memory retrieval.",
    });
  });

  it("searches memory using the Task 6 public tool contract", () => {
    const registry = createToolRegistry({ repository: createRepository() });

    const result = registry.search_memory({
      projectKey: "project-alpha",
      query: "SQLite",
    });

    expect(result).toEqual({
      ok: true,
      projectKey: "project-alpha",
      query: "SQLite",
      results: [
        expect.objectContaining({ id: 11 }),
        expect.objectContaining({ id: 12 }),
      ],
    });
  });

  it("builds a context pack using the Task 6 public tool contract", () => {
    const registry = createToolRegistry({ repository: createRepository() });

    const result = registry.build_context_pack({
      projectKey: "project-alpha",
      task: "continue work",
    });

    expect(result.ok).toBe(true);
    expect(result.projectKey).toBe("project-alpha");
    expect(result.packMarkdown).toContain("# Context Pack");
    expect(result.packMarkdown).toContain("Task: continue work");
    expect(result.selectedMemoryIds).toEqual(["11", "12"]);
    expect(result.sections.project_summary).toEqual([
      expect.objectContaining({ id: 11 }),
    ]);
  });

  it("resolves the repository using the requested project key", () => {
    const registry = createToolRegistry({
      resolveRepository(projectKey) {
        return createProjectRepository(projectKey);
      },
    });

    const result = registry.build_context_pack({
      projectKey: "project-beta",
      task: "continue work",
    });

    expect(result.projectKey).toBe("project-beta");
    expect(result.selectedMemoryIds).toEqual(["31"]);
    expect(result.sections.project_summary).toEqual([
      expect.objectContaining({ scopeId: "project-beta" }),
    ]);
  });

  it("compacts memory using the narrower Task 6 public tool contract", () => {
    const registry = createToolRegistry({ repository: createRepository() });

    const result = registry.compact_memory({
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
});
