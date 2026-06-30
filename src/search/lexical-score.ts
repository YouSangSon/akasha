import type { SearchMemoryResult } from "../types.js";
import { entityOverlapScore } from "../entities/entity-extraction.js";

const MAX_FREQUENCY_BONUS_TERMS = 8;

export type LexicalMatch = {
  score: number;
  matchedTerms: string[];
};

export function scoreLexicalMatch(
  query: string,
  record: SearchMemoryResult,
): LexicalMatch {
  assertStringInput(query, "scoreLexicalMatch query");
  assertLexicalRecord(record);

  const terms = tokenizeLexicalQuery(query);
  if (terms.length === 0) {
    return { score: 0, matchedTerms: [] };
  }

  const weightedText = [
    record.title ?? "",
    record.summary ?? "",
    record.content,
    record.source.title ?? "",
    record.source.sourceRef ?? record.source.externalId ?? "",
  ].join(" ");
  const normalizedText = normalizeForLexical(weightedText);
  const normalizedQuery = normalizeForLexical(query);
  const entityOverlap = entityOverlapScore(query, weightedText);

  const matchedTerms = terms.filter((term) => normalizedText.includes(term));
  if (matchedTerms.length === 0 && entityOverlap.score === 0) {
    return { score: 0, matchedTerms: [] };
  }

  const coverage = matchedTerms.length / terms.length;
  const phraseBonus =
    normalizedQuery.length > 0 && normalizedText.includes(normalizedQuery)
      ? 0.2
      : 0;
  const frequencyBonus =
    Math.min(
      MAX_FREQUENCY_BONUS_TERMS,
      matchedTerms.reduce(
        (sum, term) => sum + countOccurrences(normalizedText, term),
        0,
      ),
    ) /
    MAX_FREQUENCY_BONUS_TERMS *
    0.2;
  const titleSummaryBonus =
    textContainsAny(`${record.title ?? ""} ${record.summary ?? ""}`, matchedTerms)
      ? 0.1
      : 0;
  const entityBonus = entityOverlap.score * 0.2;

  return {
    score: Math.min(
      1,
      coverage * 0.5 + phraseBonus + frequencyBonus + titleSummaryBonus + entityBonus,
    ),
    matchedTerms: [
      ...matchedTerms,
      ...entityOverlap.matched.map((mention) => mention.normalized),
    ],
  };
}

export function tokenizeLexicalQuery(query: string): string[] {
  assertStringInput(query, "tokenizeLexicalQuery query");

  const seen = new Set<string>();
  const terms: string[] = [];
  const matches = normalizeForLexical(query).match(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu) ?? [];

  for (const match of matches) {
    if (match.length <= 1 || seen.has(match)) {
      continue;
    }
    seen.add(match);
    terms.push(match);
  }

  return terms;
}

export function normalizeForLexical(value: string): string {
  assertStringInput(value, "normalizeForLexical value");

  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function assertStringInput(
  value: unknown,
  fieldName: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
}

function assertLexicalRecord(
  record: unknown,
): asserts record is SearchMemoryResult {
  if (!isRecord(record)) {
    throw new Error("scoreLexicalMatch record must be an object");
  }
  if (!isRecord(record.source)) {
    throw new Error("scoreLexicalMatch record.source must be an object");
  }

  assertStringInput(record.content, "scoreLexicalMatch record.content");
  assertOptionalStringInput(record.title, "scoreLexicalMatch record.title");
  assertOptionalStringInput(record.summary, "scoreLexicalMatch record.summary");
  assertOptionalStringInput(
    record.source.title,
    "scoreLexicalMatch record.source.title",
  );
  assertOptionalStringInput(
    record.source.sourceRef,
    "scoreLexicalMatch record.source.sourceRef",
  );
  assertOptionalStringInput(
    record.source.externalId,
    "scoreLexicalMatch record.source.externalId",
  );
}

function assertOptionalStringInput(value: unknown, fieldName: string): void {
  if (value !== undefined && value !== null) {
    assertStringInput(value, fieldName);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function countOccurrences(text: string, term: string): number {
  let count = 0;
  let index = text.indexOf(term);

  while (index !== -1) {
    count += 1;
    index = text.indexOf(term, index + term.length);
  }

  return count;
}

function textContainsAny(text: string, terms: readonly string[]): boolean {
  const normalized = normalizeForLexical(text);
  return terms.some((term) => normalized.includes(term));
}
