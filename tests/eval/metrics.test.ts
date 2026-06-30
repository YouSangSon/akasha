import { describe, expect, it } from "vitest";
import { mrrAtK, recallAtK } from "../../src/eval/metrics.js";

type MetricCaller = (
  retrieved: unknown,
  relevant: unknown,
  k: unknown,
) => number;

const metricCallers = [
  {
    name: "recallAtK",
    call: (retrieved: unknown, relevant: unknown, k: unknown) =>
      recallAtK(
        retrieved as readonly number[],
        relevant as readonly number[],
        k as number,
      ),
  },
  {
    name: "mrrAtK",
    call: (retrieved: unknown, relevant: unknown, k: unknown) =>
      mrrAtK(
        retrieved as readonly number[],
        relevant as readonly number[],
        k as number,
      ),
  },
] satisfies Array<{ name: string; call: MetricCaller }>;

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

  it("treats duplicate retrieved ids as a single hit", () => {
    expect(recallAtK([1, 1, 1], [1, 2], 3)).toBeCloseTo(1 / 2);
  });
});

describe.each(metricCallers)("$name input validation", ({ call }) => {
  it("rejects non-array direct inputs", () => {
    expect(() => call("not-array", [1], 1)).toThrow(
      "retrieved must be an array",
    );
    expect(() => call([1], "not-array", 1)).toThrow("relevant must be an array");
  });

  it("rejects invalid record ids in both arrays", () => {
    expect(() => call([1, "2"], [1], 1)).toThrow(
      "retrieved[1] must be a positive safe integer",
    );
    expect(() => call([1, Number.NaN], [1], 1)).toThrow(
      "retrieved[1] must be a positive safe integer",
    );
    expect(() => call([1], [1, Number.POSITIVE_INFINITY], 1)).toThrow(
      "relevant[1] must be a positive safe integer",
    );
    expect(() => call([1], [1, undefined], 1)).toThrow(
      "relevant[1] must be a positive safe integer",
    );
    expect(() => call([0], [1], 1)).toThrow(
      "retrieved[0] must be a positive safe integer",
    );
    expect(() => call([1], [-1], 1)).toThrow(
      "relevant[0] must be a positive safe integer",
    );
    expect(() => call([1.5], [1], 1)).toThrow(
      "retrieved[0] must be a positive safe integer",
    );
  });

  it.each([
    ["non-number", "1"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["decimal", 1.5],
    ["zero", 0],
    ["negative", -1],
  ])("rejects invalid k values: %s", (_label, k) => {
    expect(() => call([], [], k)).toThrow("k must be a positive integer");
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
