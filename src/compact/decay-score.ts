// Pure decay scoring. Higher = more valuable to keep. Lower = candidate for
// archive/eviction. The exponential decay over age means recent records stay
// useful while old low-importance ones quickly fall below threshold.
//
// score = importance * exp(-ageDays / halfLifeDays * ln(2))
//
// At age = halfLifeDays, score is half of importance. At age = 3*halfLife,
// score is ~1/8 of importance. Importance 0 always scores 0.

export type DecayScoreInput = {
  importance: number;
  createdAt: string; // ISO 8601
  now: Date; // injection point (tests + reproducibility)
  halfLifeDays?: number; // default 30
};

function assertValidDate(value: Date, name: string): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`${name} must be a valid Date`);
  }
}

function parseIsoTimestamp(value: string): number {
  if (typeof value !== "string") {
    throw new Error(
      `createdAt is not a valid ISO 8601 timestamp: ${String(value)}`,
    );
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`createdAt is not a valid ISO 8601 timestamp: ${value}`);
  }

  return parsed;
}

export function decayScore(input: DecayScoreInput): number {
  if (!Number.isFinite(input.importance)) {
    throw new Error("importance must be a finite number");
  }

  assertValidDate(input.now, "now");

  const halfLife = input.halfLifeDays ?? 30;
  if (halfLife <= 0 || !Number.isFinite(halfLife)) {
    throw new Error("halfLifeDays must be a positive finite number");
  }

  const created = parseIsoTimestamp(input.createdAt);

  const ageMs = Math.max(0, input.now.getTime() - created);
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const decayFactor = Math.pow(0.5, ageDays / halfLife);

  return input.importance * decayFactor;
}

export type DecayCandidate<T> = {
  record: T;
  score: number;
};

// Returns records below the threshold, sorted by score ascending (most-decayed
// first — those are the strongest candidates for eviction).
export function findDecayCandidates<T>(
  records: readonly T[],
  scoreOf: (record: T) => DecayScoreInput,
  threshold: number,
  now: Date,
): DecayCandidate<T>[] {
  if (!Array.isArray(records)) {
    throw new Error("records must be an array");
  }
  if (typeof scoreOf !== "function") {
    throw new Error("scoreOf must be a function");
  }
  if (!Number.isFinite(threshold)) {
    throw new Error("threshold must be a finite number");
  }
  assertValidDate(now, "now");

  const candidates: DecayCandidate<T>[] = [];
  for (const record of records) {
    const baseInput = scoreOf(record);
    const score = decayScore({ ...baseInput, now });
    if (score < threshold) {
      candidates.push({ record, score });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates;
}
