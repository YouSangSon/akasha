import { describe, expect, it } from "vitest";
import {
  decayScore,
  findDecayCandidates,
} from "../../src/compact/decay-score.js";

const NOW = new Date("2026-04-25T12:00:00.000Z");

describe("decayScore", () => {
  it("returns full importance for a record created right now", () => {
    expect(
      decayScore({
        importance: 10,
        createdAt: NOW.toISOString(),
        now: NOW,
      }),
    ).toBe(10);
  });

  it("halves the score after one half-life", () => {
    const halfLifeDays = 30;
    const halfLifeAgo = new Date(
      NOW.getTime() - halfLifeDays * 24 * 60 * 60 * 1000,
    );
    const score = decayScore({
      importance: 10,
      createdAt: halfLifeAgo.toISOString(),
      now: NOW,
      halfLifeDays,
    });
    expect(score).toBeCloseTo(5, 5);
  });

  it("is 0 when importance is 0 regardless of age", () => {
    expect(
      decayScore({
        importance: 0,
        createdAt: "2020-01-01T00:00:00.000Z",
        now: NOW,
      }),
    ).toBe(0);
  });

  it("clamps negative ages (future timestamp) to age=0 → full importance", () => {
    const future = new Date(NOW.getTime() + 1_000_000).toISOString();
    expect(
      decayScore({ importance: 7, createdAt: future, now: NOW }),
    ).toBe(7);
  });

  it("throws on invalid createdAt", () => {
    expect(() =>
      decayScore({
        importance: 1,
        createdAt: "not-a-date",
        now: NOW,
      }),
    ).toThrow(/ISO 8601/);
  });

  it("throws on non-positive halfLifeDays", () => {
    expect(() =>
      decayScore({
        importance: 1,
        createdAt: NOW.toISOString(),
        now: NOW,
        halfLifeDays: 0,
      }),
    ).toThrow(/positive/);
  });
});

describe("findDecayCandidates", () => {
  type Rec = { id: number; importance: number; createdAt: string };
  const records: Rec[] = [
    { id: 1, importance: 10, createdAt: NOW.toISOString() },
    {
      id: 2,
      importance: 1,
      createdAt: new Date(
        NOW.getTime() - 90 * 24 * 60 * 60 * 1000,
      ).toISOString(), // 90 days old, score ~0.125
    },
    {
      id: 3,
      importance: 5,
      createdAt: new Date(
        NOW.getTime() - 60 * 24 * 60 * 60 * 1000,
      ).toISOString(), // 60 days old, score ~1.25
    },
  ];

  const scoreOf = (r: Rec) => ({
    importance: r.importance,
    createdAt: r.createdAt,
    now: NOW,
    halfLifeDays: 30,
  });

  it("returns records below threshold sorted by score ascending", () => {
    const out = findDecayCandidates(records, scoreOf, 2, NOW);
    // Below threshold 2: id=2 (~0.125), id=3 (~1.25). id=1 (10) excluded.
    expect(out.map((c) => c.record.id)).toEqual([2, 3]);
    expect(out[0].score).toBeLessThan(out[1].score);
  });

  it("returns nothing when threshold is below all scores", () => {
    expect(findDecayCandidates(records, scoreOf, 0, NOW)).toEqual([]);
  });

  it("returns all when threshold is above all scores", () => {
    expect(findDecayCandidates(records, scoreOf, 100, NOW)).toHaveLength(3);
  });
});
