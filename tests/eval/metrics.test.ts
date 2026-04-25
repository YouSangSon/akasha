import { describe, expect, it } from "vitest";
import { mrrAtK, recallAtK } from "../../src/eval/metrics.js";

describe("recallAtK", () => {
  it("returns 1 when all relevant items are within top-k", () => {
    expect(recallAtK([1, 2, 3, 4], [1, 3], 4)).toBe(1);
  });

  it("returns the fraction of relevant items present in top-k", () => {
    expect(recallAtK([1, 2, 3, 4, 5], [1, 6, 7], 5)).toBeCloseTo(1 / 3);
  });

  it("truncates retrieved to k before checking", () => {
    expect(recallAtK([1, 2, 3, 4, 5], [4, 5], 3)).toBe(0);
    expect(recallAtK([1, 2, 3, 4, 5], [3], 3)).toBe(1);
  });

  it("returns 0 when no relevant items are retrieved", () => {
    expect(recallAtK([1, 2, 3], [99], 3)).toBe(0);
  });

  it("returns 0 when relevant set is empty (avoids division by zero)", () => {
    expect(recallAtK([1, 2, 3], [], 3)).toBe(0);
  });

  it("returns 0 when retrieved is empty", () => {
    expect(recallAtK([], [1, 2], 5)).toBe(0);
  });

  it("treats duplicate relevant ids as a single distinct relevance target", () => {
    expect(recallAtK([1, 2], [1, 1, 1], 2)).toBe(1);
  });
});

describe("mrrAtK", () => {
  it("returns reciprocal rank of the first relevant item in top-k", () => {
    expect(mrrAtK([1, 2, 3], [3], 3)).toBeCloseTo(1 / 3);
    expect(mrrAtK([5, 7, 9], [7], 3)).toBeCloseTo(1 / 2);
    expect(mrrAtK([5, 7, 9], [5], 3)).toBe(1);
  });

  it("returns 0 when no relevant item is within top-k", () => {
    expect(mrrAtK([1, 2, 3], [99], 3)).toBe(0);
  });

  it("respects k by ignoring relevant items beyond top-k", () => {
    expect(mrrAtK([1, 2, 3, 4], [4], 3)).toBe(0);
  });

  it("returns 0 on empty retrieved or empty relevant", () => {
    expect(mrrAtK([], [1], 5)).toBe(0);
    expect(mrrAtK([1, 2], [], 5)).toBe(0);
  });
});
