import type { SearchMemoryResult } from "../types.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const RANKING_WEIGHTS = {
  scope: {
    project: 60,
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
  penalty: {
    genericNote: 35,
  },
} as const;

export function rankResults(
  records: readonly SearchMemoryResult[],
): SearchMemoryResult[] {
  if (records.length <= 1) {
    return [...records];
  }

  const newestUpdatedAt = Math.max(
    ...records.map((record) => Date.parse(record.updatedAt)),
  );

  return [...records].sort((left, right) => {
    const scoreDiff =
      scoreRecord(right, newestUpdatedAt) - scoreRecord(left, newestUpdatedAt);

    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const updatedAtDiff =
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt);

    if (updatedAtDiff !== 0) {
      return updatedAtDiff;
    }

    return right.id - left.id;
  });
}

function scoreRecord(
  record: SearchMemoryResult,
  newestUpdatedAt: number,
): number {
  let score = 0;

  score += RANKING_WEIGHTS.scope[record.scopeType];
  score += memoryTypeWeight(record);
  score += sourceTypeWeight(record);
  score += recencyWeight(record.updatedAt, newestUpdatedAt);

  if (looksGeneric(record)) {
    score -= RANKING_WEIGHTS.penalty.genericNote;
  }

  return score;
}

function memoryTypeWeight(record: SearchMemoryResult): number {
  return RANKING_WEIGHTS.memoryType[record.memoryType];
}

function sourceTypeWeight(record: SearchMemoryResult): number {
  return RANKING_WEIGHTS.sourceType[record.source.sourceType];
}

function recencyWeight(updatedAt: string, newestUpdatedAt: number): number {
  const updatedAtTime = Date.parse(updatedAt);
  const dayDistance = Math.max(0, (newestUpdatedAt - updatedAtTime) / DAY_IN_MS);

  return Math.max(
    0,
    RANKING_WEIGHTS.recency.maxBonus - Math.floor(dayDistance),
  );
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
