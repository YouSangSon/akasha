export type QdrantChunkInput = {
  id: number;
  memoryRecordId: number;
  chunkIndex: number;
  content: string;
  embeddingVersion: string;
};

export type QdrantRecordInput = {
  id: number;
  scopeType: "user" | "project";
  scopeId: string;
  projectKey: string | null;
  durability: string;
  kind: string;
  tags: string[];
  updatedAt: string;
};

export type QdrantPointInput = {
  chunk: QdrantChunkInput;
  record: QdrantRecordInput;
  embedding: number[];
};

export type QdrantPoint = {
  id: string;
  vector: number[];
  payload: {
    chunk_id: number;
    memory_record_id: number;
    scope_type: "user" | "project";
    scope_id: string;
    project_key: string | null;
    kind: string;
    durability: string;
    tags: string[];
    updated_at: string;
    embedding_version: string;
  };
};

export function toQdrantPoint(input: QdrantPointInput): QdrantPoint {
  return {
    id: `chunk:${input.chunk.id}`,
    vector: input.embedding,
    payload: {
      chunk_id: input.chunk.id,
      memory_record_id: input.chunk.memoryRecordId,
      scope_type: input.record.scopeType,
      scope_id: input.record.scopeId,
      project_key: input.record.projectKey,
      kind: input.record.kind,
      durability: input.record.durability,
      tags: input.record.tags,
      updated_at: input.record.updatedAt,
      embedding_version: input.chunk.embeddingVersion,
    },
  };
}
