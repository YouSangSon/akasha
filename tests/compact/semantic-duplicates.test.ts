import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  findSemanticDuplicates,
} from "../../src/compact/semantic-duplicates.js";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBe(0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1, 6);
  });

  it("is invariant to magnitude (cosine measures direction)", () => {
    expect(cosineSimilarity([1, 0, 0], [5, 0, 0])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([2, 2, 0], [1, 1, 0])).toBeCloseTo(1, 6);
  });

  it("returns 0 when either vector is the zero vector", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 1, 1])).toBe(0);
    expect(cosineSimilarity([1, 1, 1], [0, 0, 0])).toBe(0);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("throws on length mismatch", () => {
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow(/length mismatch/);
  });

  it("throws when direct vector inputs are not arrays", () => {
    expect(() =>
      cosineSimilarity("vector" as unknown as number[], []),
    ).toThrow("cosineSimilarity vector a must be an array");
    expect(() =>
      cosineSimilarity([], "vector" as unknown as number[]),
    ).toThrow("cosineSimilarity vector b must be an array");
  });

  it("throws when either vector contains non-finite numbers", () => {
    for (const value of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(() => cosineSimilarity([1, value], [1, 0])).toThrow(
        `cosineSimilarity vector a: vector value at index 1 ` +
          `must be a finite number, got ${String(value)}`,
      );
      expect(() => cosineSimilarity([1, 0], [1, value])).toThrow(
        `cosineSimilarity vector b: vector value at index 1 ` +
          `must be a finite number, got ${String(value)}`,
      );
    }
  });
});

describe("findSemanticDuplicates", () => {
  it("returns empty when no records cluster above threshold", () => {
    const records = [
      { id: 1, importance: 0 },
      { id: 2, importance: 0 },
      { id: 3, importance: 0 },
    ];
    const embeddings = new Map([
      [1, [1, 0, 0]],
      [2, [0, 1, 0]],
      [3, [0, 0, 1]],
    ]);
    expect(findSemanticDuplicates(records, embeddings, 0.9)).toEqual([]);
  });

  it("clusters records whose cosine similarity is above threshold", () => {
    const records = [
      { id: 1, importance: 5 },
      { id: 2, importance: 0 }, // near-paraphrase of 1
      { id: 3, importance: 0 }, // distinct
    ];
    // Vec 1 and 2 are nearly identical (cosine ~1.0); vec 3 is orthogonal.
    const embeddings = new Map([
      [1, [1, 0, 0]],
      [2, [0.99, 0.01, 0]],
      [3, [0, 1, 0]],
    ]);
    const groups = findSemanticDuplicates(records, embeddings, 0.95);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.keep.id).toBe(1); // higher importance wins
    expect(groups[0]!.archive.map((r) => r.id)).toEqual([2]);
  });

  it("uses default threshold (0.95) when omitted", () => {
    const records = [
      { id: 1, importance: 0 },
      { id: 2, importance: 0 },
    ];
    const embeddings = new Map([
      [1, [1, 0, 0]],
      [2, [0.5, 0.866, 0]], // cosine ≈ 0.5; below 0.95 default
    ]);
    expect(findSemanticDuplicates(records, embeddings)).toEqual([]);
  });

  it("keeps highest-importance record (tie-break: lowest id)", () => {
    const records = [
      { id: 3, importance: 1 },
      { id: 1, importance: 5 }, // highest importance
      { id: 2, importance: 5 }, // same importance, higher id → loses tie-break
    ];
    const embeddings = new Map([
      [1, [1, 0, 0]],
      [2, [1, 0, 0]],
      [3, [1, 0, 0]],
    ]);
    const groups = findSemanticDuplicates(records, embeddings, 0.99);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.keep.id).toBe(1);
    expect(groups[0]!.archive.map((r) => r.id).sort()).toEqual([2, 3]);
  });

  it("skips records that have no embedding (does not throw)", () => {
    const records = [
      { id: 1, importance: 0 },
      { id: 2, importance: 0 },
      { id: 3, importance: 0 },
    ];
    const embeddings = new Map([
      [1, [1, 0, 0]],
      // id=2 missing
      [3, [1, 0, 0]],
    ]);
    const groups = findSemanticDuplicates(records, embeddings, 0.9);
    expect(groups).toHaveLength(1);
    // Cluster of {1, 3}; 2 dropped silently.
    expect(groups[0]!.keep.id).toBe(1);
    expect(groups[0]!.archive.map((r) => r.id)).toEqual([3]);
  });

  it("rejects malformed embeddings even when no comparison is needed", () => {
    const records = [{ id: 1, importance: 0 }];
    const embeddings = new Map([[1, [Number.NaN]]]);

    expect(() => findSemanticDuplicates(records, embeddings, 0.9)).toThrow(
      "findSemanticDuplicates embedding for record 1: vector value at index 0 " +
        "must be a finite number, got NaN",
    );
  });

  it("rejects invalid semantic duplicate records before clustering", () => {
    expect(() =>
      findSemanticDuplicates({} as unknown as [], new Map(), 0.9),
    ).toThrow("records must be an array");
    expect(() =>
      findSemanticDuplicates([null as never], new Map(), 0.9),
    ).toThrow("records[0] must be an object");
    expect(() =>
      findSemanticDuplicates([{ id: 0 }], new Map(), 0.9),
    ).toThrow("records[0].id must be a positive safe integer");
    expect(() =>
      findSemanticDuplicates(
        [{ id: 1, importance: Number.POSITIVE_INFINITY }],
        new Map(),
        0.9,
      ),
    ).toThrow("records[0].importance must be a finite number");
  });

  it("rejects invalid embedding maps and vectors before clustering", () => {
    expect(() =>
      findSemanticDuplicates(
        [{ id: 1 }],
        {} as ReadonlyMap<number, number[]>,
        0.9,
      ),
    ).toThrow("embeddings must be a map");
    expect(() =>
      findSemanticDuplicates(
        [{ id: 1 }],
        new Map([[1, "vector" as unknown as number[]]]),
        0.9,
      ),
    ).toThrow("findSemanticDuplicates embedding for record 1 must be an array");
    expect(() =>
      findSemanticDuplicates(
        [{ id: 1 }],
        new Map([[1, null as unknown as number[]]]),
        0.9,
      ),
    ).toThrow("findSemanticDuplicates embedding for record 1 must be an array");
  });

  it("forms multiple clusters when there are multiple paraphrase groups", () => {
    const records = [
      { id: 1 }, { id: 2 },
      { id: 3 }, { id: 4 },
      { id: 5 },
    ];
    const embeddings = new Map([
      [1, [1, 0]], [2, [0.99, 0.01]],     // cluster A
      [3, [0, 1]], [4, [0.01, 0.99]],     // cluster B
      [5, [0.7, 0.7]],                    // alone (cosine ~0.7 to A and B)
    ]);
    const groups = findSemanticDuplicates(records, embeddings, 0.95);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => [g.keep.id, ...g.archive.map((r) => r.id)].sort()))
      .toEqual([
        [1, 2],
        [3, 4],
      ]);
  });

  it("rejects threshold ≤ 0 or > 1", () => {
    expect(() => findSemanticDuplicates([], new Map(), 0)).toThrow(/threshold/);
    expect(() => findSemanticDuplicates([], new Map(), 1.5)).toThrow(/threshold/);
    expect(() => findSemanticDuplicates([], new Map(), -0.1)).toThrow(
      /threshold/,
    );
  });

  it("rejects non-finite thresholds", () => {
    for (const threshold of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(() => findSemanticDuplicates([], new Map(), threshold)).toThrow(
        `findSemanticDuplicates threshold must be in (0, 1], got ${String(threshold)}`,
      );
    }
  });
});
