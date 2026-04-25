// Duplicate detection over a record set. This first pass uses content-string
// equality (after whitespace normalization) which catches the most common
// case: the same fact captured twice from independent sessions. Semantic
// near-duplicate detection (paraphrases via Qdrant cosine KNN) is the next
// PR — its interface plugs in here without changing the caller.

export type DuplicateGroup<T> = {
  // The record we recommend keeping. Currently picks highest importance,
  // tie-break by oldest (lowest id). Future: weight by access frequency.
  keep: T;
  // Records we recommend archiving. Same content as `keep`.
  archive: T[];
};

export type RecordWithIdAndContent = {
  id: number;
  content: string;
  importance?: number;
};

export function findExactContentDuplicates<T extends RecordWithIdAndContent>(
  records: readonly T[],
): DuplicateGroup<T>[] {
  const byNormalized = new Map<string, T[]>();
  for (const record of records) {
    const key = normalizeContent(record.content);
    const bucket = byNormalized.get(key) ?? [];
    bucket.push(record);
    byNormalized.set(key, bucket);
  }

  const groups: DuplicateGroup<T>[] = [];
  for (const bucket of byNormalized.values()) {
    if (bucket.length < 2) {
      continue;
    }
    const sorted = [...bucket].sort(byImportanceDescThenIdAsc);
    const [keep, ...archive] = sorted;
    groups.push({ keep: keep!, archive });
  }
  return groups;
}

function normalizeContent(content: string): string {
  return content.replace(/\s+/g, " ").trim().toLowerCase();
}

function byImportanceDescThenIdAsc<T extends RecordWithIdAndContent>(
  a: T,
  b: T,
): number {
  const importanceDelta = (b.importance ?? 0) - (a.importance ?? 0);
  if (importanceDelta !== 0) {
    return importanceDelta;
  }
  return a.id - b.id;
}
