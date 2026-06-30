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
  assertVectorPointInput(input);

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

function assertVectorPointInput(
  input: unknown,
): asserts input is VectorPointInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("buildVectorPoint input must be an object");
  }

  const candidate = input as Record<string, unknown>;

  assertPositiveSafeInteger(candidate.chunkId, "chunkId");
  assertFiniteVector(candidate.vector);
  assertPositiveSafeInteger(candidate.memoryRecordId, "memoryRecordId");
  assertVectorOrganizationId(candidate.organizationId);
  assertStringField(candidate.scopeType, "scopeType");
  assertStringField(candidate.scopeId, "scopeId");
  assertStringOrNullField(candidate.projectKey, "projectKey");
  assertStringField(candidate.kind, "kind");
  assertStringField(candidate.durability, "durability");
  assertOptionalStringOrNullField(candidate.title, "title");
  assertOptionalStringOrNullField(candidate.summary, "summary");
  assertOptionalStringArray(candidate.tags, "tags");
  assertStringField(candidate.updatedAt, "updatedAt");
  assertStringField(candidate.embeddingVersion, "embeddingVersion");
}

function assertPositiveSafeInteger(value: unknown, fieldName: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive safe integer`);
  }
}

function assertFiniteVector(value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("vector must be a non-empty array");
  }

  for (const [index, component] of value.entries()) {
    if (typeof component !== "number" || !Number.isFinite(component)) {
      throw new Error(`vector[${index}] must be a finite number`);
    }
  }
}

function assertStringField(value: unknown, fieldName: string): void {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
}

function assertStringOrNullField(value: unknown, fieldName: string): void {
  if (typeof value !== "string" && value !== null) {
    throw new Error(`${fieldName} must be a string or null`);
  }
}

function assertOptionalStringOrNullField(
  value: unknown,
  fieldName: string,
): void {
  if (value !== undefined) {
    assertStringOrNullField(value, fieldName);
  }
}

function assertOptionalStringArray(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string") {
      throw new Error(`${fieldName}[${index}] must be a string`);
    }
  }
}
