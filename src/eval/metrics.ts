// Pure retrieval-quality metrics. No I/O. Operate on numeric record ids so the
// caller decides what "relevance" means (e.g. memory_record_id).

function assertPositiveIntegerArray(value: unknown, fieldName: string): void {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  for (const [index, id] of value.entries()) {
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
      throw new Error(`${fieldName}[${index}] must be a positive safe integer`);
    }
  }
}

function assertPositiveIntegerK(k: unknown): void {
  if (
    typeof k !== "number" ||
    !Number.isFinite(k) ||
    !Number.isInteger(k) ||
    k <= 0
  ) {
    throw new Error("k must be a positive integer");
  }
}

function assertMetricInputs(
  retrieved: unknown,
  relevant: unknown,
  k: unknown,
): void {
  assertPositiveIntegerArray(retrieved, "retrieved");
  assertPositiveIntegerArray(relevant, "relevant");
  assertPositiveIntegerK(k);
}

export function recallAtK(
  retrieved: readonly number[],
  relevant: readonly number[],
  k: number,
): number {
  assertMetricInputs(retrieved, relevant, k);

  const relevantSet = new Set(relevant);

  if (relevantSet.size === 0 || retrieved.length === 0) {
    return 0;
  }

  const window = new Set(retrieved.slice(0, k));
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
  assertMetricInputs(retrieved, relevant, k);

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
