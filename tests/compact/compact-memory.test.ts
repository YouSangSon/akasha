import { describe, expect, it } from "vitest";
import { compactMemory } from "../../src/compact/compact-memory.js";
import type { SearchMemoryResult } from "../../src/types.js";

type ResultOverrides = Partial<Omit<SearchMemoryResult, "source">> & {
  source?: Partial<SearchMemoryResult["source"]>;
};

function createResult(
  overrides: ResultOverrides,
): SearchMemoryResult {
  const scopeType = overrides.scopeType ?? "project";
  const scopeId = overrides.scopeId ?? "project-alpha";
  const sourceScopeType = overrides.source?.scopeType ?? scopeType;
  const sourceScopeId = overrides.source?.scopeId ?? scopeId;

  return {
    id: overrides.id ?? 1,
    sourceId: overrides.sourceId ?? 1,
    scopeType,
    scopeId,
    memoryType: overrides.memoryType ?? "summary",
    content: overrides.content ?? "Captured note.",
    createdAt: overrides.createdAt ?? "2026-03-20T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-03-20T10:00:00.000Z",
    source: {
      id: overrides.source?.id ?? 1,
      scopeType: sourceScopeType,
      scopeId: sourceScopeId,
      sourceType: overrides.source?.sourceType ?? "document",
      externalId: overrides.source?.externalId ?? "memory-1",
      title: overrides.source?.title ?? "Memory 1",
      uri: overrides.source?.uri ?? "file:///tmp/memory-1.md",
      createdAt:
        overrides.source?.createdAt ?? "2026-03-20T10:00:00.000Z",
    },
  };
}

describe("compactMemory", () => {
  it("returns conservative promotion and merge candidates during dry runs without mutating input", () => {
    const records = [
      createResult({
        id: 11,
        content:
          "Decision: Keep project memory local-first until remote sync is explicitly designed.",
        updatedAt: "2026-03-29T11:00:00.000Z",
        source: {
          sourceType: "document",
          externalId: "decision-log",
          title: "Decision Log",
        },
      }),
      createResult({
        id: 12,
        content:
          "Constraint: Avoid automatic durable promotion without an explicit human review step.",
        updatedAt: "2026-03-29T10:00:00.000Z",
        source: {
          sourceType: "document",
          externalId: "constraints",
          title: "Constraints",
        },
      }),
      createResult({
        id: 21,
        content: "Need to follow up on the ranking edge case after lunch.",
        updatedAt: "2026-03-29T09:00:00.000Z",
        source: {
          sourceType: "conversation",
          externalId: "session-7",
          title: "Session 7",
        },
      }),
      createResult({
        id: 22,
        content: "Need to follow up on the ranking edge case after lunch.",
        updatedAt: "2026-03-29T08:00:00.000Z",
        source: {
          sourceType: "conversation",
          externalId: "session-6",
          title: "Session 6",
        },
      }),
      createResult({
        id: 23,
        content: "Need  to follow up on the ranking edge case after lunch.  ",
        updatedAt: "2026-03-29T07:00:00.000Z",
        source: {
          sourceType: "conversation",
          externalId: "session-5",
          title: "Session 5",
        },
      }),
      createResult({
        id: 30,
        memoryType: "fact",
        content: "README covers setup steps for local development.",
        updatedAt: "2026-03-28T07:00:00.000Z",
        source: {
          sourceType: "document",
          externalId: "readme",
          title: "README",
        },
      }),
    ];
    const originalRecords = JSON.parse(JSON.stringify(records));

    const result = compactMemory({ dryRun: true, records });

    expect(result.applied).toBe(false);
    expect(result.promotionCandidates).toEqual([
      expect.objectContaining({
        recordId: 11,
        suggestedMemoryType: "decision",
      }),
      expect.objectContaining({
        recordId: 12,
        suggestedMemoryType: "fact",
      }),
    ]);
    expect(result.mergeCandidates).toEqual([
      expect.objectContaining({
        canonicalRecordId: 21,
        duplicateRecordIds: [22, 23],
        recordIds: [21, 22, 23],
      }),
    ]);
    expect(result.archiveCandidates.map((record) => record.id)).toEqual([
      22,
      23,
    ]);
    expect(records).toEqual(originalRecords);
  });

  it("stays suggestion-only even when dryRun is false", () => {
    const result = compactMemory({
      dryRun: false,
      records: [
        createResult({
          id: 41,
          content: "Decision: Keep compaction conservative and reviewable.",
        }),
      ],
    });

    expect(result.applied).toBe(false);
    expect(result.promotionCandidates).toEqual([
      expect.objectContaining({
        recordId: 41,
        suggestedMemoryType: "decision",
      }),
    ]);
  });

  it("does not merge identical conversation notes across different scopes", () => {
    const result = compactMemory({
      dryRun: true,
      records: [
        createResult({
          id: 51,
          scopeType: "project",
          scopeId: "project-alpha",
          content: "Need to follow up on the ranking edge case after lunch.",
          source: {
            scopeType: "project",
            scopeId: "project-alpha",
            sourceType: "conversation",
            externalId: "project-session",
            title: "Project Session",
          },
        }),
        createResult({
          id: 52,
          scopeType: "user",
          scopeId: "alice",
          content: "Need to follow up on the ranking edge case after lunch.",
          source: {
            scopeType: "user",
            scopeId: "alice",
            sourceType: "conversation",
            externalId: "user-session",
            title: "User Session",
          },
        }),
      ],
    });

    expect(result.mergeCandidates).toEqual([]);
    expect(result.archiveCandidates).toEqual([]);
  });
});
