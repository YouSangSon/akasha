// Semantic duplicate detection. Plugs into the existing exact-match path
// from detect-duplicates.ts: same DuplicateGroup<T> shape, same keep-rule
// (highest importance, tie-break by oldest id). Caller decides whether to
// merge with the exact-match groups or use semantic alone.
//
// Embeddings are pre-computed by the caller (typically the apply-path
// orchestrator embedding each record's content via the EmbeddingClient).
// This keeps the clustering function pure and synchronous — testable
// without any Qdrant/embedding infrastructure.
//
// Algorithm: greedy single-link agglomerative clustering. For each record
// (in original order), check against existing cluster representatives. If
// cosine similarity ≥ threshold against any rep, join that cluster. Else
// start a new cluster. The "keep" record per cluster is the highest-
// importance member with tie-break by lowest id.

import type { DuplicateGroup } from "./detect-duplicates.js";

export type SemanticRecord = {
  id: number;
  importance?: number;
};

const DEFAULT_THRESHOLD = 0.95;

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `cosineSimilarity: vector length mismatch (${a.length} vs ${b.length})`,
    );
  }
  if (a.length === 0) {
    return 0;
  }

  assertFiniteVectorValues(a, "cosineSimilarity vector a");
  assertFiniteVectorValues(b, "cosineSimilarity vector b");

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function findSemanticDuplicates<T extends SemanticRecord>(
  records: readonly T[],
  embeddings: ReadonlyMap<number, number[]>,
  threshold: number = DEFAULT_THRESHOLD,
): DuplicateGroup<T>[] {
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error(
      `findSemanticDuplicates threshold must be in (0, 1], got ${threshold}`,
    );
  }

  const clusters: T[][] = [];

  for (const record of records) {
    const recVec = embeddings.get(record.id);
    if (!recVec) {
      // Records without an embedding cannot be clustered semantically.
      // Skip them rather than failing the whole compaction.
      continue;
    }
    assertFiniteVectorValues(
      recVec,
      `findSemanticDuplicates embedding for record ${record.id}`,
    );

    let joined = false;
    for (const cluster of clusters) {
      // Single-link: compare against the first member (cluster representative).
      // Greedy keeps the algorithm O(N × clusters) instead of O(N²); for
      // typical compaction batches (hundreds), the difference is small but
      // the simpler model is easier to reason about.
      const repId = cluster[0]!.id;
      const repVec = embeddings.get(repId);
      if (!repVec) continue;
      if (cosineSimilarity(recVec, repVec) >= threshold) {
        cluster.push(record);
        joined = true;
        break;
      }
    }

    if (!joined) {
      clusters.push([record]);
    }
  }

  const groups: DuplicateGroup<T>[] = [];
  for (const cluster of clusters) {
    if (cluster.length < 2) continue;
    const sorted = [...cluster].sort(byImportanceDescThenIdAsc);
    const [keep, ...archive] = sorted;
    groups.push({ keep: keep!, archive });
  }
  return groups;
}

function byImportanceDescThenIdAsc<T extends SemanticRecord>(
  a: T,
  b: T,
): number {
  const importanceDelta = (b.importance ?? 0) - (a.importance ?? 0);
  if (importanceDelta !== 0) return importanceDelta;
  return a.id - b.id;
}

function assertFiniteVectorValues(
  vector: readonly number[],
  context: string,
): void {
  for (let index = 0; index < vector.length; index += 1) {
    const value = vector[index]!;
    if (!Number.isFinite(value)) {
      throw new Error(
        `${context}: vector value at index ${index} must be a finite number, ` +
          `got ${String(value)}`,
      );
    }
  }
}
