// VectorIndex port — backend-neutral interface for vector storage.
// Concrete adapters (qdrant-index.ts, pgvector-index.ts, ...) implement this
// interface. Call sites depend only on this file; NO Qdrant or pgvector types
// should ever appear here.

export type VectorFilter = {
  organizationId: string;
  scopes: Array<{ scopeType: string; scopeId: string }>;
  projectKey?: string | null;
};

export type VectorPoint = {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
};

export type VectorHit = {
  id: string;
  score: number;
  payload: Record<string, unknown>;
};

export interface VectorIndex {
  ensureCollection(dimensions: number): Promise<void>;
  upsert(points: VectorPoint[]): Promise<void>;
  query(vector: number[], filter: VectorFilter, limit: number): Promise<VectorHit[]>;
  delete(ids: string[]): Promise<void>;
  /** Remove all vectors whose memory_record_id payload field matches any of the
   *  given record IDs. Used by reindexCanonicalMemory to clear stale chunks;
   *  callers must finish all reindex deletes before starting upsert pages.
   *  No-op when recordIds is empty. */
  deleteByRecordIds(recordIds: number[]): Promise<void>;
}
