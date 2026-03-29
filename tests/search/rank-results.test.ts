import { describe, expect, it } from "vitest";
import { rankResults } from "../../src/search/rank-results.js";
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
  it("prefers project-scoped durable recent decisions over generic notes", () => {
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

    expect(ranked.map((record) => record.id)).toEqual([13, 12, 14, 11]);
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
});
