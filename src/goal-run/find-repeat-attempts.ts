import { cosineSimilarity } from "../compact/semantic-duplicates.js";

// Default similarity at/above which a candidate attempt is flagged as a repeat
// of a prior failed attempt. Lower than the 0.95 used for dedup: repeats are
// often reworded, so a moderate threshold catches paraphrased retries.
export const DEFAULT_REPEAT_THRESHOLD = 0.85;

export type PriorFailure = {
  iterationIndex: number;
  attempt: string;
  embedding: number[];
};

export type RepeatMatch = {
  iterationIndex: number;
  attempt: string;
  score: number;
};

// Pure: compare a candidate attempt's embedding against prior failed attempts.
// Caller computes the embeddings (via EmbeddingClient) so this stays testable
// without embedding infrastructure. Matches at/above threshold, best first.
export function findRepeatAttempts(input: {
  candidateEmbedding: number[];
  priorFailures: readonly PriorFailure[];
  threshold?: number;
}): RepeatMatch[] {
  const threshold = input.threshold ?? DEFAULT_REPEAT_THRESHOLD;
  if (threshold <= 0 || threshold > 1) {
    throw new Error(
      `findRepeatAttempts threshold must be in (0, 1], got ${threshold}`,
    );
  }

  return input.priorFailures
    .map((failure) => ({
      iterationIndex: failure.iterationIndex,
      attempt: failure.attempt,
      score: cosineSimilarity(input.candidateEmbedding, failure.embedding),
    }))
    .filter((match) => match.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
