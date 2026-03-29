import type { SearchMemoryResult } from "../types.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function rankResults(
  records: SearchMemoryResult[],
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

  score += record.scopeType === "project" ? 60 : 0;
  score += memoryTypeWeight(record);
  score += sourceTypeWeight(record);
  score += recencyWeight(record.updatedAt, newestUpdatedAt);

  if (looksGeneric(record)) {
    score -= 35;
  }

  return score;
}

function memoryTypeWeight(record: SearchMemoryResult): number {
  switch (record.memoryType) {
    case "decision":
      return 120;
    case "summary":
      return 70;
    case "fact":
      return 45;
  }
}

function sourceTypeWeight(record: SearchMemoryResult): number {
  switch (record.source.sourceType) {
    case "decision":
      return 30;
    case "document":
      return 15;
    case "conversation":
      return 0;
  }
}

function recencyWeight(updatedAt: string, newestUpdatedAt: number): number {
  const updatedAtTime = Date.parse(updatedAt);
  const dayDistance = Math.max(0, (newestUpdatedAt - updatedAtTime) / DAY_IN_MS);

  return Math.max(0, 25 - Math.floor(dayDistance));
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
