// Exponential backoff with cap for ingest-job retry scheduling.
//
// This module is intentionally layer-neutral (jobs layer) so both the
// compact sweeper and the store write path can import without creating
// a store→compact or compact→store dependency.

// Exponential backoff: base 1 s, doubles per attempt, capped at 5 min.
export function nextRetryDelayMs(attempts: number): number {
  if (!Number.isSafeInteger(attempts) || attempts < 0) {
    throw new Error("retry attempts must be a non-negative safe integer");
  }

  const BASE_MS = 1_000;
  const CAP_MS = 5 * 60 * 1_000;
  return Math.min(BASE_MS * Math.pow(2, attempts), CAP_MS);
}
