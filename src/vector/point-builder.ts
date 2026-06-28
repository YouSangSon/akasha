// Shared builder for VectorPoint objects.
//
// All three write paths (writeCanonicalMemory, reindexCanonicalMemory,
// restoreOne in unarchive-compaction) produce the same 11-field payload shape.
// This builder is the single place that assembles it, eliminating drift risk.
//
// Call sites are responsible for resolving defaults before calling:
//   - organizationId: ?? "default"
//   - projectKey:     ?? null
//   - durability:     ?? "ephemeral"
// The builder receives already-resolved primitives and produces the point.

import type { VectorPoint } from "./vector-index.js";
import { assertVectorOrganizationId } from "./organization-id.js";

export type VectorPointInput = {
  chunkId: number;
  vector: number[];
  memoryRecordId: number;
  organizationId: string;
  scopeType: string;
  scopeId: string;
  projectKey: string | null;
  kind: string;
  durability: string;
  title?: string | null;
  summary?: string | null;
  tags?: readonly string[];
  updatedAt: string;
  embeddingVersion: string;
};

export function buildVectorPoint(input: VectorPointInput): VectorPoint {
  assertVectorOrganizationId(input.organizationId);

  return {
    id: `chunk:${input.chunkId}`,
    vector: input.vector,
    payload: {
      chunk_id: input.chunkId,
      memory_record_id: input.memoryRecordId,
      organization_id: input.organizationId,
      scope_type: input.scopeType,
      scope_id: input.scopeId,
      project_key: input.projectKey,
      kind: input.kind,
      durability: input.durability,
      title: input.title ?? null,
      summary: input.summary ?? null,
      tags: [...(input.tags ?? [])],
      updated_at: input.updatedAt,
      embedding_version: input.embeddingVersion,
    },
  };
}
