import { describe, expect, it } from "vitest";
import {
  entityOverlapScore,
  extractEntityMentions,
} from "../../src/entities/entity-extraction.js";

describe("entity extraction", () => {
  it("extracts code symbols, paths, dates, urls, and proper nouns", () => {
    const mentions = extractEntityMentions(
      "QDRANT_SNAPSHOT_TIMEOUT in docs/operations.md affected Postgres on 2026-06-26; see https://example.com/runbook.",
    );

    expect(mentions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "code_symbol",
          normalized: "qdrant_snapshot_timeout",
        }),
        expect.objectContaining({
          kind: "path",
          normalized: "docs/operations.md",
        }),
        expect.objectContaining({
          kind: "date",
          normalized: "2026-06-26",
        }),
        expect.objectContaining({
          kind: "url",
          normalized: "https://example.com/runbook",
        }),
        expect.objectContaining({
          kind: "proper_noun",
          normalized: "postgres",
        }),
      ]),
    );
  });

  it("scores overlap by normalized entity identity", () => {
    const overlap = entityOverlapScore(
      "Why did QDRANT_SNAPSHOT_TIMEOUT happen in docs/operations.md?",
      "Runbook docs/operations.md says QDRANT_SNAPSHOT_TIMEOUT means retry cleanup.",
    );

    expect(overlap.score).toBeGreaterThan(0.5);
    expect(overlap.matched.map((mention) => mention.normalized)).toEqual(
      expect.arrayContaining(["qdrant_snapshot_timeout", "docs/operations.md"]),
    );
  });
});
