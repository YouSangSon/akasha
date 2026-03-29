import { describe, expect, it } from "vitest";
import { compactMemory } from "../../src/compact/compact-memory.js";

describe("compactMemory", () => {
  it("returns archive and promotion candidates in dry-run mode using the Task 5 public contract", () => {
    const result = compactMemory({
      dryRun: true,
      records: [
        {
          id: "1",
          kind: "summary",
          durability: "ephemeral",
          summary: "Decision: use durable project memory",
        },
        {
          id: "2",
          kind: "note",
          durability: "ephemeral",
          summary: "repeat note",
        },
        {
          id: "3",
          kind: "note",
          durability: "ephemeral",
          summary: "repeat note",
        },
        {
          id: "4",
          kind: "note",
          durability: "ephemeral",
          summary: "unique note",
        },
      ],
    });

    expect(result.promotionCandidates).toEqual(["1"]);
    expect(result.mergeGroups).toEqual([["2", "3"]]);
    expect(result.archivedIds).toEqual([]);
    expect(result.applied).toBe(false);
  });

  it("sets applied based on dryRun and promotes matching summaries without extra source restrictions", () => {
    const result = compactMemory({
      dryRun: false,
      records: [
        {
          id: "decision-1",
          kind: "summary",
          durability: "ephemeral",
          summary: "Decision: keep compaction conservative",
        },
        {
          id: "constraint-1",
          kind: "summary",
          durability: "ephemeral",
          summary: "Constraint: avoid automatic durable promotion",
        },
      ],
    });

    expect(result.applied).toBe(true);
    expect(result.promotionCandidates).toEqual([
      "decision-1",
      "constraint-1",
    ]);
    expect(result.archivedIds).toEqual([]);
    expect(result.mergeGroups).toEqual([]);
  });
});
