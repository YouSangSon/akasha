import { describe, expect, it } from "vitest";
import {
  buildRetrievedMemoryCandidate,
  newestUpdatedAtFor,
  rankCandidates,
  rankResults,
  scoreSearchResult,
} from "../../src/search/rank-results.js";
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

describe("rankResults", () => {
  it("keeps all project-scoped records ahead of user-scoped records", () => {
    const ranked = rankResults([
      createResult({
        id: 11,
        memoryType: "summary",
        content: "General notes from a coding session.",
        updatedAt: "2026-03-28T09:00:00.000Z",
        source: {
          sourceType: "conversation",
          externalId: "session-1",
          title: "Session 1",
          uri: "file:///tmp/session-1.md",
        },
      }),
      createResult({
        id: 12,
        scopeType: "user",
        scopeId: "alice",
        memoryType: "decision",
        content: "Decision: Use ripgrep for fast code search in local tools.",
        updatedAt: "2026-03-28T11:00:00.000Z",
        source: {
          scopeType: "user",
          scopeId: "alice",
          sourceType: "decision",
          externalId: "user-decision-1",
          title: "CLI defaults",
          uri: "file:///tmp/user-decision-1.md",
        },
      }),
      createResult({
        id: 13,
        memoryType: "decision",
        content: "Decision: Keep local-first storage for project memory.",
        updatedAt: "2026-03-28T11:00:00.000Z",
        source: {
          sourceType: "decision",
          externalId: "project-decision-1",
          title: "Storage ADR",
          uri: "file:///tmp/project-decision-1.md",
        },
      }),
      createResult({
        id: 14,
        memoryType: "fact",
        content: "README mentions setup steps for local development.",
        updatedAt: "2026-03-29T08:30:00.000Z",
        source: {
          sourceType: "document",
          externalId: "readme",
          title: "README",
          uri: "file:///tmp/readme.md",
        },
      }),
    ]);

    expect(ranked.map((record) => record.id)).toEqual([13, 14, 11, 12]);
  });

  it("keeps a recent project summary ahead of an older project summary", () => {
    const ranked = rankResults([
      createResult({
        id: 21,
        memoryType: "summary",
        content: "Project summary from last month.",
        updatedAt: "2026-02-01T10:00:00.000Z",
      }),
      createResult({
        id: 22,
        memoryType: "summary",
        content: "Updated project summary after the ingestion rewrite.",
        updatedAt: "2026-03-28T10:00:00.000Z",
      }),
    ]);

    expect(ranked.map((record) => record.id)).toEqual([22, 21]);
  });

  it.each([
    "not-a-date",
    "2026-02-30T00:00:00.000Z",
    "2026-03-28T10:00:00Z",
    123 as unknown as string,
  ])("rejects invalid updatedAt before ranking: %s", (updatedAt) => {
    expect(() => rankResults([createResult({ updatedAt })])).toThrow(
      /record\.updatedAt is not a canonical ISO 8601 timestamp/,
    );
  });

  it("exposes deterministic internal score components", () => {
    const record = createResult({
      id: 31,
      memoryType: "decision",
      content: "Decision: keep deterministic ranking helpers.",
      updatedAt: "2026-03-28T10:00:00.000Z",
      source: { sourceType: "decision" },
    });

    const candidate = scoreSearchResult(record, {
      newestUpdatedAt: Date.parse("2026-03-28T10:00:00.000Z"),
      vectorScore: 0.4,
      source: "vector",
    });

    expect(candidate.source).toBe("vector");
    expect(candidate.scores.vector).toBeCloseTo(20);
    expect(candidate.scores.scope).toBe(1000);
    expect(candidate.scores.metadata).toBe(150);
    expect(candidate.scores.recency).toBe(25);
    expect(candidate.scores.total).toBeCloseTo(1195);
    expect(candidate.reasons).toEqual(
      expect.arrayContaining([
        "scope:project",
        "memoryType:decision",
        "sourceType:decision",
        "recency:25",
        "vector:20",
      ]),
    );
  });

  it("rejects non-finite newestUpdatedAt before scoring", () => {
    expect(() =>
      scoreSearchResult(createResult({}), {
        newestUpdatedAt: Number.NaN,
      }),
    ).toThrow("newestUpdatedAt must be a finite timestamp");
  });

  it("uses vector score to order records when metadata ties", () => {
    const lowerVector = buildRetrievedMemoryCandidate(
      createResult({
        id: 42,
        memoryType: "summary",
        content: "Project retrieval summary A.",
        updatedAt: "2026-03-28T10:00:00.000Z",
      }),
      { source: "vector", vectorScore: 0.2 },
    );
    const higherVector = buildRetrievedMemoryCandidate(
      createResult({
        id: 41,
        memoryType: "summary",
        content: "Project retrieval summary B.",
        updatedAt: "2026-03-28T10:00:00.000Z",
      }),
      { source: "vector", vectorScore: 0.9 },
    );

    const ranked = rankCandidates([lowerVector, higherVector]);

    expect(ranked.map((candidate) => candidate.record.id)).toEqual([41, 42]);
  });

  it("rejects invalid candidate updatedAt before tie-break sorting", () => {
    const candidate = buildRetrievedMemoryCandidate(
      createResult({
        id: 51,
        updatedAt: "2026-03-28T10:00:00.000Z",
      }),
    );
    const invalidCandidate = {
      ...candidate,
      record: createResult({
        id: 52,
        updatedAt: "not-a-date",
      }),
    };

    expect(() => rankCandidates([candidate, invalidCandidate])).toThrow(
      /record\.updatedAt is not a canonical ISO 8601 timestamp/,
    );
  });

  it("finds the newest canonical updatedAt timestamp", () => {
    expect(
      newestUpdatedAtFor([
        createResult({ updatedAt: "2026-03-27T10:00:00.000Z" }),
        createResult({ updatedAt: "2026-03-29T10:00:00.000Z" }),
      ]),
    ).toBe(Date.parse("2026-03-29T10:00:00.000Z"));
  });

  it("rejects empty input when deriving the newest updatedAt", () => {
    expect(() => newestUpdatedAtFor([])).toThrow(
      "records must contain at least one record",
    );
  });
});
