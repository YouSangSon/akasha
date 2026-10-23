import type { SearchMemoryResult } from "../types.js";
import type {
  CandidateSource,
  RetrievedMemoryCandidate,
} from "./scored-candidate.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const RANKING_WEIGHTS = {
  memoryType: {
    decision: 120,
    summary: 70,
    fact: 45,
  },
  sourceType: {
    decision: 30,
    document: 15,
    conversation: 0,
  },
  recency: {
    maxBonus: 25,
  },
  vector: {
    maxBonus: 100,
  },
  lexical: {
    maxBonus: 100,
  },
  penalty: {
    genericNote: 35,
  },
} as const;

export { type CandidateSource, type RetrievedMemoryCandidate };

export type ScoreSearchResultOptions = {
  newestUpdatedAt: number;
  source?: CandidateSource;
  vectorScore?: number;
  lexicalScore?: number;
};

type TimestampedSearchMemoryResult = {
  record: SearchMemoryResult;
  updatedAtTime: number;
};

type TimestampedCandidate = {
  candidate: RetrievedMemoryCandidate;
  updatedAtTime: number;
};

export function rankResults(
  records: readonly SearchMemoryResult[],
): SearchMemoryResult[] {
  assertSearchMemoryResults(records, "records");

  if (records.length === 0) {
    return [...records];
  }

  const timestampedRecords = timestampSearchMemoryResults(records);
  const newestUpdatedAt = newestUpdatedAtForTimestamped(timestampedRecords);
  return rankTimestampedCandidates(
    timestampedRecords.map(({ record, updatedAtTime }) => ({
      candidate: scoreSearchResultWithTimestamp(
        record,
        {
          newestUpdatedAt,
          source: "vector",
        },
        updatedAtTime,
      ),
      updatedAtTime,
    })),
  ).map((candidate) => candidate.record);
}

export function rankCandidates(
  candidates: readonly RetrievedMemoryCandidate[],
): RetrievedMemoryCandidate[] {
  assertRetrievedMemoryCandidates(candidates);

  return rankTimestampedCandidates(
    candidates.map((candidate) => ({
      candidate,
      updatedAtTime: parseCanonicalIsoTimestamp(
        candidate.record.updatedAt,
        "record.updatedAt",
      ),
    })),
  );
}

export function buildRetrievedMemoryCandidate(
  record: SearchMemoryResult,
  options: Omit<ScoreSearchResultOptions, "newestUpdatedAt"> = {},
): RetrievedMemoryCandidate {
  assertSearchMemoryResult(record, "record");
  const updatedAtTime = parseCanonicalIsoTimestamp(
    record.updatedAt,
    "record.updatedAt",
  );

  return scoreSearchResultWithTimestamp(
    record,
    {
      ...options,
      newestUpdatedAt: updatedAtTime,
    },
    updatedAtTime,
  );
}

export function scoreSearchResult(
  record: SearchMemoryResult,
  options: ScoreSearchResultOptions,
): RetrievedMemoryCandidate {
  assertSearchMemoryResult(record, "record");
  const updatedAtTime = parseCanonicalIsoTimestamp(
    record.updatedAt,
    "record.updatedAt",
  );

  return scoreSearchResultWithTimestamp(record, options, updatedAtTime);
}

function scoreSearchResultWithTimestamp(
  record: SearchMemoryResult,
  options: ScoreSearchResultOptions,
  updatedAtTime: number,
): RetrievedMemoryCandidate {
  assertScoreSearchResultOptions(options);
  assertFiniteTimestamp(updatedAtTime, "record.updatedAt");

  const reasons: string[] = [];
  assertFiniteTimestamp(options.newestUpdatedAt, "newestUpdatedAt");

  const scope = scopeScore(record, reasons);
  const metadata = metadataScore(record, reasons);
  const recency = recencyScore(updatedAtTime, options.newestUpdatedAt, reasons);
  const vector = vectorScore(options.vectorScore, reasons);
  const lexical = lexicalScore(options.lexicalScore, reasons);
  const total = scope + metadata + recency + (vector ?? 0) + (lexical ?? 0);

  return {
    record,
    source: options.source ?? "vector",
    scores: {
      ...(vector === undefined ? {} : { vector }),
      ...(lexical === undefined ? {} : { lexical }),
      scope,
      metadata,
      recency,
      total,
    },
    reasons,
  };
}

export function newestUpdatedAtFor(
  records: readonly SearchMemoryResult[],
): number {
  assertSearchMemoryResults(records, "records");

  if (records.length === 0) {
    throw new Error("records must contain at least one record");
  }

  return newestUpdatedAtForTimestamped(timestampSearchMemoryResults(records));
}

function timestampSearchMemoryResults(
  records: readonly SearchMemoryResult[],
): TimestampedSearchMemoryResult[] {
  return records.map((record) => ({
    record,
    updatedAtTime: parseCanonicalIsoTimestamp(
      record.updatedAt,
      "record.updatedAt",
    ),
  }));
}

function newestUpdatedAtForTimestamped(
  records: readonly TimestampedSearchMemoryResult[],
): number {
  return Math.max(...records.map((record) => record.updatedAtTime));
}

function rankTimestampedCandidates(
  candidates: readonly TimestampedCandidate[],
): RetrievedMemoryCandidate[] {
  return [...candidates]
    .sort((left, right) => {
      const scoreDiff =
        right.candidate.scores.total - left.candidate.scores.total;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      if (
        left.candidate.record.scopeType !==
        right.candidate.record.scopeType
      ) {
        return left.candidate.record.scopeType === "project" ? -1 : 1;
      }

      const updatedAtDiff = right.updatedAtTime - left.updatedAtTime;
      if (updatedAtDiff !== 0) {
        return updatedAtDiff;
      }

      return right.candidate.record.id - left.candidate.record.id;
    })
    .map(({ candidate }) => candidate);
}

function assertSearchMemoryResults(
  records: unknown,
  fieldName: string,
): asserts records is readonly SearchMemoryResult[] {
  if (!Array.isArray(records)) {
    throw new Error(`${fieldName} must be an array`);
  }

  for (const [index, record] of records.entries()) {
    assertSearchMemoryResult(record, `${fieldName}[${index}]`);
  }
}

function assertRetrievedMemoryCandidates(
  candidates: unknown,
): asserts candidates is readonly RetrievedMemoryCandidate[] {
  if (!Array.isArray(candidates)) {
    throw new Error("candidates must be an array");
  }

  for (const [index, candidate] of candidates.entries()) {
    const prefix = `candidates[${index}]`;
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      Array.isArray(candidate)
    ) {
      throw new Error(`${prefix} must be an object`);
    }

    const value = candidate as Record<string, unknown>;
    assertSearchMemoryResult(value.record, `${prefix}.record`);
    assertCandidateSource(value.source, `${prefix}.source`);
    assertObject(value.scores, `${prefix}.scores`);
    const scores = value.scores as Record<string, unknown>;
    assertOptionalFiniteNumber(scores.vector, `${prefix}.scores.vector`);
    assertOptionalFiniteNumber(scores.lexical, `${prefix}.scores.lexical`);
    assertFiniteNumber(scores.scope, `${prefix}.scores.scope`);
    assertFiniteNumber(scores.metadata, `${prefix}.scores.metadata`);
    assertFiniteNumber(scores.recency, `${prefix}.scores.recency`);
    assertFiniteNumber(scores.total, `${prefix}.scores.total`);
    assertStringArray(value.reasons, `${prefix}.reasons`);
  }
}

function assertSearchMemoryResult(
  record: unknown,
  fieldName: string,
): asserts record is SearchMemoryResult {
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    throw new Error(`${fieldName} must be an object`);
  }

  const value = record as Record<string, unknown>;
  assertPositiveSafeInteger(value.id, `${fieldName}.id`);
  assertScopeType(value.scopeType, `${fieldName}.scopeType`);
  assertMemoryType(value.memoryType, `${fieldName}.memoryType`);
  assertString(value.content, `${fieldName}.content`);
  assertObject(value.source, `${fieldName}.source`);
  assertSourceType(
    (value.source as Record<string, unknown>).sourceType,
    `${fieldName}.source.sourceType`,
  );
}

function assertScoreSearchResultOptions(
  options: unknown,
): asserts options is ScoreSearchResultOptions {
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new Error("scoreSearchResult options must be an object");
  }

  const value = options as Record<string, unknown>;
  assertFiniteTimestamp(value.newestUpdatedAt as number, "newestUpdatedAt");
  assertOptionalCandidateSource(value.source);
  assertOptionalUnitScore(value.vectorScore, "vectorScore");
  assertOptionalUnitScore(value.lexicalScore, "lexicalScore");
}

function assertObject(value: unknown, fieldName: string): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
}

function assertPositiveSafeInteger(value: unknown, fieldName: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive safe integer`);
  }
}

function assertString(value: unknown, fieldName: string): void {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
}

function assertStringArray(value: unknown, fieldName: string): void {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  for (const [index, item] of value.entries()) {
    assertString(item, `${fieldName}[${index}]`);
  }
}

function assertScopeType(value: unknown, fieldName: string): void {
  if (value !== "project" && value !== "user") {
    throw new Error(`${fieldName} must be "project" or "user"`);
  }
}

function assertMemoryType(value: unknown, fieldName: string): void {
  if (value !== "decision" && value !== "summary" && value !== "fact") {
    throw new Error(
      `${fieldName} must be "decision", "summary", or "fact"`,
    );
  }
}

function assertSourceType(value: unknown, fieldName: string): void {
  if (
    value !== "decision" &&
    value !== "document" &&
    value !== "conversation"
  ) {
    throw new Error(
      `${fieldName} must be "decision", "document", or "conversation"`,
    );
  }
}

function assertCandidateSource(value: unknown, fieldName: string): void {
  if (value !== "vector" && value !== "lexical" && value !== "hybrid") {
    throw new Error(`${fieldName} must be "vector", "lexical", or "hybrid"`);
  }
}

function assertOptionalCandidateSource(value: unknown): void {
  if (value === undefined) {
    return;
  }

  assertCandidateSource(value, "source");
}

function assertOptionalUnitScore(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }

  assertFiniteNumber(value, fieldName);
  if (value < 0 || value > 1) {
    throw new Error(`${fieldName} must be between 0 and 1`);
  }
}

function assertOptionalFiniteNumber(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }

  assertFiniteNumber(value, fieldName);
}

function assertFiniteNumber(
  value: unknown,
  fieldName: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
}

function scopeScore(
  record: SearchMemoryResult,
  reasons: string[],
): number {
  reasons.push(`scope:${record.scopeType}`);
  return 0;
}

function metadataScore(
  record: SearchMemoryResult,
  reasons: string[],
): number {
  const memoryType = RANKING_WEIGHTS.memoryType[record.memoryType];
  const sourceType = RANKING_WEIGHTS.sourceType[record.source.sourceType];
  let total = memoryType + sourceType;

  reasons.push(`memoryType:${record.memoryType}`);
  reasons.push(`sourceType:${record.source.sourceType}`);

  if (looksGeneric(record)) {
    total -= RANKING_WEIGHTS.penalty.genericNote;
    reasons.push("penalty:generic-note");
  }

  return total;
}

function recencyScore(
  updatedAtTime: number,
  newestUpdatedAt: number,
  reasons: string[],
): number {
  const dayDistance = Math.max(0, (newestUpdatedAt - updatedAtTime) / DAY_IN_MS);
  const score = Math.max(
    0,
    RANKING_WEIGHTS.recency.maxBonus - Math.floor(dayDistance),
  );
  reasons.push(`recency:${score}`);
  return score;
}

function vectorScore(
  rawScore: number | undefined,
  reasons: string[],
): number | undefined {
  if (rawScore === undefined) {
    return undefined;
  }
  const score = rawScore * RANKING_WEIGHTS.vector.maxBonus;
  reasons.push(`vector:${score}`);
  return score;
}

function lexicalScore(
  rawScore: number | undefined,
  reasons: string[],
): number | undefined {
  if (rawScore === undefined) {
    return undefined;
  }
  const score = rawScore * RANKING_WEIGHTS.lexical.maxBonus;
  reasons.push(`lexical:${score}`);
  return score;
}

function parseCanonicalIsoTimestamp(value: unknown, name: string): number {
  if (typeof value !== "string") {
    throw new Error(
      `${name} is not a canonical ISO 8601 timestamp: ${String(value)}`,
    );
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${name} is not a canonical ISO 8601 timestamp: ${value}`);
  }

  return parsed;
}

function assertFiniteTimestamp(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite timestamp`);
  }
}

function looksGeneric(record: SearchMemoryResult): boolean {
  if (record.memoryType === "decision") {
    return false;
  }

  if (record.source.sourceType === "conversation") {
    return true;
  }

  return /\bgeneral notes?\b|\bcaptured note\b/i.test(record.content);
}
