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
    searchMemory() {
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

function createRecord(
  overrides: {
    id: number;
    memoryType: SearchMemoryResult["memoryType"];
    content: string;
    sourceType: SearchMemoryResult["source"]["sourceType"];
    externalId: string;
  },
): SearchMemoryResult {
  return {
    id: overrides.id,
    sourceId: overrides.id + 100,
    scopeType: "project",
    scopeId: "project-alpha",
    memoryType: overrides.memoryType,
    content: overrides.content,
    createdAt: "2026-03-29T00:00:00.000Z",
    updatedAt: "2026-03-29T00:00:00.000Z",
    source: {
      id: overrides.id + 100,
      scopeType: "project",
      scopeId: "project-alpha",
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
