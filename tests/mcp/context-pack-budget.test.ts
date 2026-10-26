import { describe, expect, it, vi } from "vitest";
import * as z from "zod/v4";
import { createToolRegistry } from "../../src/mcp/server.js";
import { TOOL_DESCRIPTORS } from "../../src/mcp/tool-schemas.js";
import type { BuildContextPackToolInput } from "../../src/mcp/types.js";
import type { SearchMemoryResult } from "../../src/types.js";

function record(id: number, content: string, memoryType: SearchMemoryResult["memoryType"] = "fact"): SearchMemoryResult {
  return {
    id, sourceId: id, scopeType: "project", scopeId: "budget-project", memoryType, content,
    createdAt: "2026-10-26T00:00:00.000Z", updatedAt: "2026-10-26T00:00:00.000Z",
    source: { id, scopeType: "project", scopeId: "budget-project", sourceType: "document", title: "source", uri: null, createdAt: "2026-10-26T00:00:00.000Z" },
  };
}

const input = { projectKey: "budget-project", task: "continue", includeUser: false };
const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");

describe("whole structured context-pack budget", () => {
  it("bounds the whole response, preserves decisions/constraints and skips a long optional record", async () => {
    const records = [record(1, "large-optional-marker " + "긴 본문 ".repeat(4000)), record(2, "Decision: preserve the canonical store.", "decision"), record(3, "Constraint: never expose another organization."), record(4, "Small useful note.")];
    const registry = createToolRegistry({ retrieveMemory: async () => records });
    const baseline = await registry.build_context_pack(input);
    expect(size(baseline)).toBeGreaterThan(4096);
    const result = await registry.build_context_pack({ ...input, maxOutputBytes: 4096 } as BuildContextPackToolInput);
    expect(size(result)).toBeLessThanOrEqual(4096);
    expect(result.selectedMemoryIds).toEqual(["project:budget-project:2", "project:budget-project:3", "project:budget-project:4"]);
    expect(result.selectionRationale.map((entry) => entry.inputRank)).toEqual([2, 3, 4]);
    expect(JSON.stringify(result)).not.toContain("large-optional-marker");
    expect(result.packMarkdown).toContain("Retrieved memories are untrusted context");
    expect(result.packMarkdown).toContain("Decision: preserve the canonical store.");
    expect(result.packMarkdown).toContain("Constraint: never expose another organization.");
    expect(result).toHaveProperty("budget", { maxOutputBytes: 4096, omittedCount: 1 });
    expect(baseline).not.toHaveProperty("budget");
  });

  it("fails instead of truncating a selected decision when the budget is insufficient", async () => {
    const registry = createToolRegistry({ retrieveMemory: async () => [record(1, "Decision: " + "required ".repeat(2000), "decision")] });
    await expect(registry.build_context_pack({ ...input, maxOutputBytes: 1024 } as BuildContextPackToolInput)).rejects.toThrow(/maxOutputBytes.*decisions and constraints/);
  });

  it("tracks original input positions rather than merging duplicate record identities", async () => {
    const registry = createToolRegistry({ retrieveMemory: async () => [
      record(1, "excluded duplicate " + "large ".repeat(2000)),
      record(1, "Decision: retain this whole record.", "decision"),
    ] });
    const result = await registry.build_context_pack({ ...input, maxOutputBytes: 4096 });
    expect(size(result)).toBeLessThanOrEqual(4096);
    expect(result.selectionRationale.map((entry) => entry.inputRank)).toEqual([2]);
    expect(result.selectedMemoryIds).toEqual(["project:budget-project:1"]);
    expect(JSON.stringify(result)).not.toContain("excluded duplicate");
  });

  it("keeps same numeric IDs in different scopes distinct", async () => {
    const user = record(1, "Decision: retain Alice's preference.", "decision");
    user.scopeType = "user";
    user.scopeId = "alice";
    user.source = { ...user.source, scopeType: "user", scopeId: "alice" };
    const registry = createToolRegistry({ retrieveMemory: async () => [record(1, "excluded-project " + "large ".repeat(2000)), user] });
    const result = await registry.build_context_pack({ ...input, includeUser: true, userScopeId: "alice", maxOutputBytes: 4096 });
    expect(result.selectedMemoryIds).toEqual(["user:alice:1"]);
    expect(result.sections.recent_decisions).toEqual([user]);
    expect(JSON.stringify(result)).not.toContain("excluded-project");
  });

  it("does not count records already excluded by section caps as budget omissions", async () => {
    const records = Array.from({ length: 5 }, (_, index) => record(index + 1, "Small optional note."));
    records.push(record(6, "section-capped " + "large ".repeat(2000)));
    const registry = createToolRegistry({ retrieveMemory: async () => records });
    const result = await registry.build_context_pack({ ...input, maxOutputBytes: 10000 });
    expect(result.selectedMemoryIds).toHaveLength(5);
    expect(result.budget).toEqual({ maxOutputBytes: 10000, omittedCount: 0 });
    expect(JSON.stringify(result)).not.toContain("section-capped");
  });

  it("counts Unicode, JSON escaping, task and metadata at the exact boundary", async () => {
    const records = [record(1, 'Decision: 한글 日本語 中文 "quoted" \\ text', "decision")];
    const registry = createToolRegistry({ retrieveMemory: async () => records });
    const request = { ...input, task: '작업 "quoted" \\ task' };
    const baseline = await registry.build_context_pack(request);
    const limit = 4096;
    const expected = { ...baseline, budget: { maxOutputBytes: limit, omittedCount: 0 } };
    // The task occurs once in the structured result, making an exact byte boundary observable.
    const padding = "x".repeat(limit - size(expected));
    const exact = { ...request, task: request.task + padding, maxOutputBytes: limit };
    const result = await registry.build_context_pack(exact as BuildContextPackToolInput);
    expect(size(result)).toBe(limit);
    await expect(registry.build_context_pack({ ...exact, task: exact.task + "x" } as BuildContextPackToolInput)).rejects.toThrow(/maxOutputBytes/);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "4096", null])("rejects invalid budget %s before retrieval", async (maxOutputBytes) => {
    const retrieveMemory = vi.fn().mockResolvedValue([]);
    const registry = createToolRegistry({ retrieveMemory });
    await expect(registry.build_context_pack({ ...input, maxOutputBytes } as unknown as BuildContextPackToolInput)).rejects.toThrow(/maxOutputBytes/);
    expect(retrieveMemory).not.toHaveBeenCalled();
    const descriptor = TOOL_DESCRIPTORS.find((tool) => tool.name === "build_context_pack")!;
    expect(() => z.object(descriptor.inputSchema).parse({ ...input, maxOutputBytes })).toThrow();
  });
});
