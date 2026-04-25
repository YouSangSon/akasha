// Pure retrieval-quality metrics. No I/O. Operate on numeric record ids so the
// caller decides what "relevance" means (e.g. memory_record_id).

export function recallAtK(
  retrieved: readonly number[],
  relevant: readonly number[],
  k: number,
): number {
  const relevantSet = new Set(relevant);

  if (relevantSet.size === 0 || retrieved.length === 0) {
    return 0;
  }

  const window = retrieved.slice(0, k);
  let hits = 0;

  for (const id of window) {
    if (relevantSet.has(id)) {
      hits += 1;
    }
  }

  return hits / relevantSet.size;
}

export function mrrAtK(
  retrieved: readonly number[],
  relevant: readonly number[],
  k: number,
): number {
  if (retrieved.length === 0 || relevant.length === 0) {
    return 0;
  }

  const relevantSet = new Set(relevant);
  const window = retrieved.slice(0, k);

  for (let index = 0; index < window.length; index += 1) {
    if (relevantSet.has(window[index]!)) {
      return 1 / (index + 1);
    }
  }

  return 0;
}
