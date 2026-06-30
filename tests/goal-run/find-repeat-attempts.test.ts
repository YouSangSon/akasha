import { describe, expect, it } from "vitest";
import {
  DEFAULT_REPEAT_THRESHOLD,
  type FindRepeatAttemptsInput,
  findRepeatAttempts,
} from "../../src/goal-run/find-repeat-attempts.js";

const callFindRepeatAttempts = (input: unknown) => () =>
  findRepeatAttempts(input as FindRepeatAttemptsInput);

describe("findRepeatAttempts", () => {
  it("flags a prior failure whose embedding matches the candidate", () => {
    const matches = findRepeatAttempts({
      candidateEmbedding: [1, 0, 0],
      priorFailures: [
        { iterationIndex: 1, attempt: "use a regex", embedding: [1, 0, 0] },
        { iterationIndex: 2, attempt: "call the api", embedding: [0, 1, 0] },
      ],
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.iterationIndex).toBe(1);
    expect(matches[0]?.score).toBeCloseTo(1);
  });

  it("returns no matches when nothing clears the threshold", () => {
    const matches = findRepeatAttempts({
      candidateEmbedding: [1, 0, 0],
      priorFailures: [
        { iterationIndex: 1, attempt: "orthogonal", embedding: [0, 1, 0] },
      ],
    });
    expect(matches).toEqual([]);
  });

  it("orders matches by similarity, best first", () => {
    const matches = findRepeatAttempts({
      candidateEmbedding: [1, 0],
      threshold: 0.5,
      priorFailures: [
        { iterationIndex: 1, attempt: "weak", embedding: [0.7, 0.7] },
        { iterationIndex: 2, attempt: "strong", embedding: [1, 0.05] },
      ],
    });

    expect(matches.map((m) => m.iterationIndex)).toEqual([2, 1]);
    expect(matches[0]!.score).toBeGreaterThan(matches[1]!.score);
  });

  it("uses the default threshold when none is supplied", () => {
    const justBelow = [Math.cos(0.6), Math.sin(0.6)]; // ~0.825 cosine vs [1,0]
    const matches = findRepeatAttempts({
      candidateEmbedding: [1, 0],
      priorFailures: [
        { iterationIndex: 1, attempt: "x", embedding: justBelow },
      ],
    });
    // cos(0.6) ≈ 0.825 < 0.85 default, so no match.
    expect(DEFAULT_REPEAT_THRESHOLD).toBe(0.85);
    expect(matches).toEqual([]);
  });

  it("rejects an out-of-range threshold", () => {
    expect(() =>
      findRepeatAttempts({
        candidateEmbedding: [1, 0],
        priorFailures: [],
        threshold: 1.5,
      }),
    ).toThrow();
  });

  it.each([undefined, null, "input", 12, true, []])(
    "rejects non-object direct input",
    (input) => {
      expect(callFindRepeatAttempts(input)).toThrow(
        "findRepeatAttempts input must be an object",
      );
    },
  );

  it.each([
    [
      { candidateEmbedding: "vector" },
      "candidateEmbedding must be an array",
    ],
    [
      { candidateEmbedding: [1, Number.NaN] },
      "candidateEmbedding[1] must be a finite number",
    ],
    [{ priorFailures: null }, "priorFailures must be an array"],
    [
      { threshold: Number.POSITIVE_INFINITY },
      "findRepeatAttempts threshold must be in (0, 1], got Infinity",
    ],
    [
      { threshold: "0.8" },
      "findRepeatAttempts threshold must be in (0, 1], got 0.8",
    ],
  ])("rejects invalid top-level field", (overrides, message) => {
    expect(
      callFindRepeatAttempts({
        candidateEmbedding: [1, 0],
        priorFailures: [],
        ...(overrides as Record<string, unknown>),
      }),
    ).toThrow(message);
  });

  it.each([
    [null, "priorFailures[0] must be an object"],
    [
      { iterationIndex: 0, attempt: "retry", embedding: [1, 0] },
      "priorFailures[0].iterationIndex must be a positive safe integer",
    ],
    [
      { iterationIndex: 1, attempt: 12, embedding: [1, 0] },
      "priorFailures[0].attempt must be a string",
    ],
    [
      { iterationIndex: 1, attempt: "retry", embedding: "vector" },
      "priorFailures[0].embedding must be an array",
    ],
    [
      { iterationIndex: 1, attempt: "retry", embedding: [1, Number.NaN] },
      "priorFailures[0].embedding[1] must be a finite number",
    ],
    [
      { iterationIndex: 1, attempt: "retry", embedding: [1, 0, 0] },
      "priorFailures[0].embedding length must match candidateEmbedding length (3 vs 2)",
    ],
  ])("rejects invalid prior failure field", (failure, message) => {
    expect(
      callFindRepeatAttempts({
        candidateEmbedding: [1, 0],
        priorFailures: [failure],
      }),
    ).toThrow(message);
  });
});
