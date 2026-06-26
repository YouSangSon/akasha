import type { SearchMemoryResult } from "../types.js";
import type {
  CandidateSource,
  RetrievedMemoryCandidate,
} from "./scored-candidate.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const RANKING_WEIGHTS = {
  scope: {
    project: 1000,
    user: 0,
  },
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
    maxBonus: 50,
  },
  lexical: {
    maxBonus: 50,
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

export function rankResults(
  records: readonly SearchMemoryResult[],
): SearchMemoryResult[] {
  if (records.length <= 1) {
    return [...records];
  }

  const newestUpdatedAt = newestUpdatedAtFor(records);
  return rankCandidates(
    records.map((record) =>
      scoreSearchResult(record, {
        newestUpdatedAt,
        source: "vector",
      }),
    ),
  ).map((candidate) => candidate.record);
}

export function rankCandidates(
  candidates: readonly RetrievedMemoryCandidate[],
): RetrievedMemoryCandidate[] {
  return [...candidates].sort((left, right) => {
    const scoreDiff = right.scores.total - left.scores.total;
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const updatedAtDiff =
      Date.parse(right.record.updatedAt) - Date.parse(left.record.updatedAt);
    if (updatedAtDiff !== 0) {
      return updatedAtDiff;
    }

    return right.record.id - left.record.id;
  });
}

export function buildRetrievedMemoryCandidate(
  record: SearchMemoryResult,
  options: Omit<ScoreSearchResultOptions, "newestUpdatedAt"> = {},
): RetrievedMemoryCandidate {
  return scoreSearchResult(record, {
    ...options,
    newestUpdatedAt: Date.parse(record.updatedAt),
  });
}

export function scoreSearchResult(
  record: SearchMemoryResult,
  options: ScoreSearchResultOptions,
): RetrievedMemoryCandidate {
  const reasons: string[] = [];
  const scope = scopeScore(record, reasons);
  const metadata = metadataScore(record, reasons);
  const recency = recencyScore(record.updatedAt, options.newestUpdatedAt, reasons);
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
  return Math.max(...records.map((record) => Date.parse(record.updatedAt)));
}

function scopeScore(
  record: SearchMemoryResult,
  reasons: string[],
): number {
  const score =
    record.scopeType === "project"
      ? RANKING_WEIGHTS.scope.project
      : RANKING_WEIGHTS.scope.user;
  reasons.push(`scope:${record.scopeType}`);
  return score;
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
  updatedAt: string,
  newestUpdatedAt: number,
  reasons: string[],
): number {
  const updatedAtTime = Date.parse(updatedAt);
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
  const score =
    clampUnitScore(rawScore) * RANKING_WEIGHTS.vector.maxBonus;
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
  const score = clampUnitScore(rawScore) * RANKING_WEIGHTS.lexical.maxBonus;
  reasons.push(`lexical:${score}`);
  return score;
}

function clampUnitScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.min(1, Math.max(0, score));
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
