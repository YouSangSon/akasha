import { describe, expect, it } from "vitest";
import {
  DEFAULT_REPEAT_THRESHOLD,
  findRepeatAttempts,
} from "../../src/goal-run/find-repeat-attempts.js";

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
});
