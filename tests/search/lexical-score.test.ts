import { describe, expect, it } from "vitest";
import {
  normalizeForLexical,
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

  it("rejects direct non-string normalize inputs", () => {
    expect(() => normalizeForLexical(123 as unknown as string)).toThrow(
      "normalizeForLexical value must be a string",
    );
  });

  it("rejects direct non-string query inputs while tokenizing", () => {
    expect(() =>
      tokenizeLexicalQuery({ query: "retry" } as unknown as string),
    ).toThrow("tokenizeLexicalQuery query must be a string");
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

  it("rejects direct non-string query inputs while scoring", () => {
    expect(() =>
      scoreLexicalMatch(false as unknown as string, makeRecord()),
    ).toThrow("scoreLexicalMatch query must be a string");
  });

  it("rejects malformed records while scoring", () => {
    expect(() =>
      scoreLexicalMatch("retry", null as unknown as SearchMemoryResult),
    ).toThrow("scoreLexicalMatch record must be an object");
  });

  it("rejects records without source objects while scoring", () => {
    expect(() =>
      scoreLexicalMatch("retry", {
        ...makeRecord(),
        source: undefined,
      } as unknown as SearchMemoryResult),
    ).toThrow("scoreLexicalMatch record.source must be an object");
  });

  it("rejects records with non-string text fields while scoring", () => {
    expect(() =>
      scoreLexicalMatch("retry", {
        ...makeRecord(),
        content: 123,
      } as unknown as SearchMemoryResult),
    ).toThrow("scoreLexicalMatch record.content must be a string");
  });

  it("returns zero for records with no lexical overlap", () => {
    const match = scoreLexicalMatch(
      "oauth callback",
      makeRecord({ content: "Use Qdrant for vector search." }),
    );

    expect(match).toEqual({ score: 0, matchedTerms: [] });
  });

  it("boosts exact entity overlap for code symbols and paths", () => {
    const match = scoreLexicalMatch(
      "QDRANT_SNAPSHOT_TIMEOUT docs/operations.md",
      makeRecord({
        content:
          "Runbook docs/operations.md explains QDRANT_SNAPSHOT_TIMEOUT recovery.",
      }),
    );

    expect(match.matchedTerms).toEqual(
      expect.arrayContaining(["qdrant_snapshot_timeout", "docs/operations.md"]),
    );
    expect(match.score).toBeGreaterThan(0.5);
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
