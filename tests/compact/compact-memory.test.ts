import { describe, expect, it } from "vitest";
import {
  buildCompactionPlan,
  type BuildCompactionPlanInput,
  shouldPromoteRecord,
} from "../../src/compact/compact-memory.js";
import type { SearchMemoryResult } from "../../src/types.js";

const NOW = new Date("2026-04-25T12:00:00.000Z");
const callBuildCompactionPlan = (input: unknown) => () =>
  buildCompactionPlan(input as BuildCompactionPlanInput);
const callShouldPromoteRecord = (record: unknown) => () =>
  shouldPromoteRecord(record as SearchMemoryResult);

function makeRecord(overrides: Partial<SearchMemoryResult> = {}): SearchMemoryResult {
  return {
    id: 1,
    organizationId: "org-a",
    sourceId: 100,
    scopeType: "project",
    scopeId: "project-alpha",
    memoryType: "summary",
    content: "default content",
    createdAt: "2026-04-25T00:00:00.000Z",
    updatedAt: "2026-04-25T00:00:00.000Z",
    importance: 0,
    durability: "durable",
    source: {
      id: 200,
      scopeType: "project",
      scopeId: "project-alpha",
      sourceType: "document",
      externalId: "doc-1",
      title: "Doc 1",
      uri: "file:///tmp/doc-1.md",
      createdAt: "2026-04-25T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("buildCompactionPlan", () => {
  it("returns dryRun=true with empty plan when no records", () => {
    const result = buildCompactionPlan({
      records: [],
      scope: "project",
      scopeLabel: "project-alpha",
      projectKey: "project-alpha",
      dryRun: true,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.archivedIds).toEqual([]);
    expect(result.duplicateGroups).toEqual([]);
    expect(result.decayCandidates).toEqual([]);
    expect(result.promotionCandidates).toEqual([]);
    expect(result.summary).toContain("Dry run");
    expect(result.summary).toContain("project-alpha");
  });

  it("identifies duplicate groups via content equality", () => {
    const result = buildCompactionPlan({
      records: [
        makeRecord({ id: 1, content: "Decision: same" }),
        makeRecord({ id: 2, content: "Decision: same" }),
        makeRecord({ id: 3, content: "Decision: same" }),
      ],
      scope: "project",
      scopeLabel: "project-alpha",
      dryRun: true,
      now: NOW,
    });

    expect(result.duplicateGroups).toHaveLength(1);
    expect(result.duplicateGroups[0]!.keepId).toBe("1");
    expect(result.duplicateGroups[0]!.archiveIds.sort()).toEqual(["2", "3"]);
  });

  it("flags decay candidates below threshold using injected now", () => {
    // Record with low importance + old age → decays below threshold quickly.
    const oldRecord = makeRecord({
      id: 99,
      content: "stale note",
      importance: 1,
      createdAt: "2025-01-01T00:00:00.000Z", // ~1.3 years before NOW
      memoryType: "fact",
    });

    const result = buildCompactionPlan({
      records: [oldRecord],
      scope: "project",
      scopeLabel: "project-alpha",
      dryRun: true,
      decayThreshold: 0.5,
      halfLifeDays: 30,
      now: NOW,
    });

    expect(result.decayCandidates).toHaveLength(1);
    expect(result.decayCandidates[0]!.id).toBe("99");
    expect(result.decayCandidates[0]!.score).toBeLessThan(0.5);
  });

  it("uses default decay threshold (0.5) and half-life (30 days) when omitted", () => {
    const stale = makeRecord({
      id: 7,
      content: "old fact",
      importance: 1,
      createdAt: "2025-01-01T00:00:00.000Z",
      memoryType: "fact",
    });

    const result = buildCompactionPlan({
      records: [stale],
      scope: "project",
      scopeLabel: "project-alpha",
      dryRun: true,
      now: NOW,
    });

    expect(result.decayCandidates).toHaveLength(1);
  });

  it("returns dryRun=false summary line when caller asks to apply", () => {
    const result = buildCompactionPlan({
      records: [],
      scope: "user",
      scopeLabel: "alice",
      dryRun: false,
      now: NOW,
    });

    expect(result.dryRun).toBe(false);
    expect(result.summary).toContain("Applied");
    expect(result.summary).toContain("user scope alice");
    // archivedIds remains [] in this PR — apply path lands in P17 step 3.
    expect(result.archivedIds).toEqual([]);
  });

  it("falls back to scopeLabel when projectKey is omitted", () => {
    const result = buildCompactionPlan({
      records: [],
      scope: "user",
      scopeLabel: "alice",
      dryRun: true,
      now: NOW,
    });

    expect(result.projectKey).toBe("alice");
  });

  it.each([undefined, null, "input", 12, true, []])(
    "rejects non-object direct input",
    (input) => {
      expect(callBuildCompactionPlan(input)).toThrow(
        "buildCompactionPlan input must be an object",
      );
    },
  );

  it.each([
    [{ records: null }, "records must be an array"],
    [{ scope: "team" }, 'scope must be "project" or "user"'],
    [{ scopeLabel: " \n\t " }, "scopeLabel must contain non-whitespace text"],
    [{ projectKey: "" }, "projectKey must contain non-whitespace text"],
    [{ dryRun: "true" }, "dryRun must be a boolean"],
    [{ decayThreshold: Number.NaN }, "decayThreshold must be a finite number"],
    [
      { halfLifeDays: 0 },
      "halfLifeDays must be a positive finite number",
    ],
    [{ now: new Date("not-a-date") }, "now must be a valid Date"],
    [{ useSemanticGroups: {} }, "useSemanticGroups must be an array"],
    [
      { useSemanticGroups: [{ keepId: 1, archiveIds: [] }] },
      "useSemanticGroups[0].keepId must be a string",
    ],
    [
      { useSemanticGroups: [{ keepId: "1", archiveIds: [2] }] },
      "useSemanticGroups[0].archiveIds[0] must be a string",
    ],
  ])("rejects invalid top-level plan input field", (overrides, message) => {
    expect(
      callBuildCompactionPlan({
        records: [],
        scope: "project",
        scopeLabel: "project-alpha",
        dryRun: true,
        now: NOW,
        ...(overrides as Record<string, unknown>),
      }),
    ).toThrow(message);
  });

  it.each([
    [null, "records[0] must be an object"],
    [
      { id: 0 },
      "records[0].id must be a positive safe integer",
    ],
    [
      { memoryType: "task" },
      'records[0].memoryType must be "decision", "summary", or "fact"',
    ],
    [{ content: null }, "records[0].content must be a string"],
    [{ createdAt: 12 }, "records[0].createdAt must be a string"],
    [
      { importance: Number.POSITIVE_INFINITY },
      "records[0].importance must be a finite number",
    ],
    [{ source: null }, "records[0].source must be an object"],
    [
      {
        source: {
          ...makeRecord().source,
          sourceType: "ticket",
        },
      },
      'records[0].source.sourceType must be "decision", "document", or "conversation"',
    ],
  ])("rejects invalid compaction record field", (overrides, message) => {
    const record =
      overrides === null
        ? null
        : ({
            ...makeRecord(),
            ...(overrides as Record<string, unknown>),
          } as SearchMemoryResult);

    expect(
      callBuildCompactionPlan({
        records: [record],
        scope: "project",
        scopeLabel: "project-alpha",
        dryRun: true,
        now: NOW,
      }),
    ).toThrow(message);
  });
});

describe("shouldPromoteRecord", () => {
  it("flags decision-type records", () => {
    const r = makeRecord({ memoryType: "decision" });
    expect(shouldPromoteRecord(r)).toBe(true);
  });

  it("flags records whose source is a decision document", () => {
    const r = makeRecord({
      memoryType: "summary",
      source: { ...makeRecord().source, sourceType: "decision" },
    });
    expect(shouldPromoteRecord(r)).toBe(true);
  });

  it("flags content starting with `decision:` or `constraint:` (case-insensitive)", () => {
    expect(
      shouldPromoteRecord(makeRecord({ content: "Decision: ship Friday" })),
    ).toBe(true);
    expect(
      shouldPromoteRecord(makeRecord({ content: "  CONSTRAINT: latency < 200ms" })),
    ).toBe(true);
  });

  it("does not flag plain summaries with no decision marker", () => {
    expect(
      shouldPromoteRecord(makeRecord({ content: "Refactored the parser." })),
    ).toBe(false);
  });

  it("rejects malformed direct promotion records", () => {
    expect(callShouldPromoteRecord(null)).toThrow(
      "record must be an object",
    );
    expect(
      callShouldPromoteRecord({ ...makeRecord(), content: 12 }),
    ).toThrow("record.content must be a string");
    expect(
      callShouldPromoteRecord({ ...makeRecord(), source: null }),
    ).toThrow("record.source must be an object");
  });
});
