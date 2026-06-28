import { describe, expect, it } from "vitest";
import { resolveEvalThreshold } from "./env.js";

describe("resolveEvalThreshold", () => {
  it("uses the fallback when the threshold env var is unset", () => {
    expect(resolveEvalThreshold({}, "EVAL_RECALL_THRESHOLD", 0.7)).toBe(0.7);
  });

  it.each([
    ["0", 0],
    ["0.50", 0.5],
    ["1", 1],
    ["1.0", 1],
  ])("accepts decimal threshold %s", (rawValue, expected) => {
    expect(
      resolveEvalThreshold(
        { EVAL_MRR_THRESHOLD: rawValue },
        "EVAL_MRR_THRESHOLD",
        0.5,
      ),
    ).toBe(expected);
  });

  it.each(["", " \n\t ", "NaN", "Infinity", "-0.1", "1.01", ".7", "70%"])(
    "rejects invalid threshold %s",
    (rawValue) => {
      expect(() =>
        resolveEvalThreshold(
          { EVAL_RECALL_THRESHOLD: rawValue },
          "EVAL_RECALL_THRESHOLD",
          0.7,
        ),
      ).toThrow(
        "EVAL_RECALL_THRESHOLD must be a decimal number from 0 to 1",
      );
    },
  );
});
