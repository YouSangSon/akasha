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

export type FindRepeatAttemptsInput = {
  candidateEmbedding: number[];
  priorFailures: readonly PriorFailure[];
  threshold?: number;
};

// Pure: compare a candidate attempt's embedding against prior failed attempts.
// Caller computes the embeddings (via EmbeddingClient) so this stays testable
// without embedding infrastructure. Matches at/above threshold, best first.
export function findRepeatAttempts(
  input: FindRepeatAttemptsInput,
): RepeatMatch[] {
  assertFindRepeatAttemptsInput(input);
  const threshold = input.threshold ?? DEFAULT_REPEAT_THRESHOLD;

  return input.priorFailures
    .map((failure) => ({
      iterationIndex: failure.iterationIndex,
      attempt: failure.attempt,
      score: cosineSimilarity(input.candidateEmbedding, failure.embedding),
    }))
    .filter((match) => match.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

function assertFindRepeatAttemptsInput(
  input: unknown,
): asserts input is FindRepeatAttemptsInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("findRepeatAttempts input must be an object");
  }

  const candidate = input as Record<string, unknown>;
  assertFiniteVector(candidate.candidateEmbedding, "candidateEmbedding");
  assertThreshold(candidate.threshold);

  if (!Array.isArray(candidate.priorFailures)) {
    throw new Error("priorFailures must be an array");
  }

  for (const [index, failure] of candidate.priorFailures.entries()) {
    assertPriorFailure(
      failure,
      index,
      candidate.candidateEmbedding.length,
    );
  }
}

function assertPriorFailure(
  failure: unknown,
  index: number,
  expectedDimensions: number,
): asserts failure is PriorFailure {
  const prefix = `priorFailures[${index}]`;

  if (
    typeof failure !== "object" ||
    failure === null ||
    Array.isArray(failure)
  ) {
    throw new Error(`${prefix} must be an object`);
  }

  const candidate = failure as Record<string, unknown>;
  assertPositiveSafeInteger(
    candidate.iterationIndex,
    `${prefix}.iterationIndex`,
  );
  assertString(candidate.attempt, `${prefix}.attempt`);
  assertFiniteVector(candidate.embedding, `${prefix}.embedding`);

  if (candidate.embedding.length !== expectedDimensions) {
    throw new Error(
      `${prefix}.embedding length must match candidateEmbedding length ` +
        `(${candidate.embedding.length} vs ${expectedDimensions})`,
    );
  }
}

function assertFiniteVector(
  value: unknown,
  fieldName: string,
): asserts value is number[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  for (const [index, component] of value.entries()) {
    if (typeof component !== "number" || !Number.isFinite(component)) {
      throw new Error(`${fieldName}[${index}] must be a finite number`);
    }
  }
}

function assertThreshold(value: unknown): void {
  if (value === undefined) {
    return;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 1
  ) {
    throw new Error(
      `findRepeatAttempts threshold must be in (0, 1], got ${String(value)}`,
    );
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
