import { describe, expect, it } from "vitest";
import { findExactContentDuplicates } from "../../src/compact/detect-duplicates.js";

describe("findExactContentDuplicates", () => {
  it("returns empty when all records are distinct", () => {
    const groups = findExactContentDuplicates([
      { id: 1, content: "Decision: A" },
      { id: 2, content: "Decision: B" },
      { id: 3, content: "Decision: C" },
    ]);
    expect(groups).toEqual([]);
  });

  it("groups records with identical content (whitespace-normalized)", () => {
    const groups = findExactContentDuplicates([
      { id: 1, content: "Decision:   use Postgres" },
      { id: 2, content: "Decision: use Postgres" },
      { id: 3, content: "Decision: use Postgres   " },
      { id: 4, content: "Decision: something else" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].keep.id).toBe(1);
    expect(groups[0].archive.map((r) => r.id).sort()).toEqual([2, 3]);
  });

  it("ignores case differences", () => {
    const groups = findExactContentDuplicates([
      { id: 1, content: "Decision: ship" },
      { id: 2, content: "DECISION: SHIP" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].archive).toHaveLength(1);
  });

  it("keeps the highest-importance record (tie-break: lowest id)", () => {
    const groups = findExactContentDuplicates([
      { id: 1, content: "same", importance: 1 },
      { id: 2, content: "same", importance: 5 },
      { id: 3, content: "same", importance: 5 },
    ]);
    expect(groups).toHaveLength(1);
    // importance 5 wins over 1, then id=2 < id=3 wins on tie.
    expect(groups[0].keep.id).toBe(2);
    expect(groups[0].archive.map((r) => r.id).sort()).toEqual([1, 3]);
  });

  it("returns multiple groups when several content classes have duplicates", () => {
    const groups = findExactContentDuplicates([
      { id: 1, content: "A" },
      { id: 2, content: "A" },
      { id: 3, content: "B" },
      { id: 4, content: "B" },
      { id: 5, content: "C" }, // unique
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.archive).flat().map((r) => r.id).sort()).toEqual([
      2, 4,
    ]);
  });
});
