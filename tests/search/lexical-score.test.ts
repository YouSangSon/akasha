import { describe, expect, it } from "vitest";
import {
  scoreLexicalMatch,
  tokenizeLexicalQuery,
} from "../../src/search/lexical-score.js";
import type { SearchMemoryResult } from "../../src/types.js";

describe("lexical scoring", () => {
  it("tokenizes unique letter and number terms", () => {
    expect(tokenizeLexicalQuery("Qdrant retry retry 003?")).toEqual([
      "qdrant",
      "retry",
      "003",
    ]);
  });

  it("scores records by query coverage and title/summary evidence", () => {
    const record = makeRecord({
      title: "Qdrant retry cleanup",
      summary: "Bounded retry policy",
      content: "Use bounded backoff when Qdrant cleanup fails.",
    });

    const match = scoreLexicalMatch("qdrant retry cleanup", record);

    expect(match.matchedTerms).toEqual(["qdrant", "retry", "cleanup"]);
    expect(match.score).toBeGreaterThan(0.7);
  });

  it("returns zero for records with no lexical overlap", () => {
    const match = scoreLexicalMatch(
      "oauth callback",
      makeRecord({ content: "Use Qdrant for vector search." }),
    );

    expect(match).toEqual({ score: 0, matchedTerms: [] });
  });
});

function makeRecord(
  overrides: Partial<SearchMemoryResult> = {},
): SearchMemoryResult {
  return {
    id: 1,
    sourceId: 10,
    scopeType: "project",
    scopeId: "project-alpha",
    projectKey: "project-alpha",
    memoryType: "summary",
    title: null,
    content: "Project memory.",
    summary: null,
    durability: "durable",
    importance: 1,
    createdAt: "2026-04-25T00:00:00.000Z",
    updatedAt: "2026-04-25T00:00:00.000Z",
    source: {
      id: 20,
      scopeType: "project",
      scopeId: "project-alpha",
      sourceType: "document",
      externalId: "doc",
      sourceRef: "doc",
      title: "Doc",
      uri: null,
      createdAt: "2026-04-25T00:00:00.000Z",
    },
    ...overrides,
  };
}
