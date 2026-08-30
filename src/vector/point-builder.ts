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
  const organizationId = input.organizationId.trim();
  const scopeType = input.scopeType.trim();
  const scopeId = input.scopeId.trim();
  const projectKey = input.projectKey === null ? null : input.projectKey.trim();
  const kind = input.kind.trim();
  const durability = input.durability.trim();
  const title = normalizeOptionalText(input.title);
  const summary = normalizeOptionalText(input.summary);
  const updatedAt = input.updatedAt.trim();
  const embeddingVersion = input.embeddingVersion.trim();

  return {
    id: toVectorPointId(input.chunkId),
    vector: input.vector,
    payload: {
      chunk_id: input.chunkId,
      memory_record_id: input.memoryRecordId,
      organization_id: organizationId,
      scope_type: scopeType,
      scope_id: scopeId,
      project_key: projectKey,
      kind,
      durability,
      title,
      summary,
      tags: (input.tags ?? []).map((tag) => tag.trim()),
      updated_at: updatedAt,
      embedding_version: embeddingVersion,
    },
  };
}

function toVectorPointId(chunkId: number): string {
  const hex = chunkId.toString(16).padStart(15, "0");
  return `00000000-0000-8${hex.slice(0, 3)}-8000-${hex.slice(3)}`;
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
  assertNonEmptyStringField(candidate.scopeType, "scopeType");
  assertScopeType(candidate.scopeType);
  assertNonEmptyStringField(candidate.scopeId, "scopeId");
  assertNonEmptyStringOrNullField(candidate.projectKey, "projectKey");
  assertNonEmptyStringField(candidate.kind, "kind");
  assertMemoryKind(candidate.kind);
  assertNonEmptyStringField(candidate.durability, "durability");
  assertDurability(candidate.durability);
  assertOptionalStringOrNullField(candidate.title, "title");
  assertOptionalStringOrNullField(candidate.summary, "summary");
  assertOptionalStringArray(candidate.tags, "tags");
  assertNonEmptyStringField(candidate.updatedAt, "updatedAt");
  assertNonEmptyStringField(candidate.embeddingVersion, "embeddingVersion");
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function assertScopeType(value: string): void {
  const normalized = value.trim();
  if (normalized === "user" || normalized === "project") {
    return;
  }
  throw new Error("scopeType must be one of: user, project");
}

function assertMemoryKind(value: string): void {
  const normalized = value.trim();
  if (
    normalized === "decision" ||
    normalized === "summary" ||
    normalized === "fact"
  ) {
    return;
  }
  throw new Error("kind must be one of: decision, summary, fact");
}

function assertDurability(value: string): void {
  const normalized = value.trim();
  if (
    normalized === "ephemeral" ||
    normalized === "durable" ||
    normalized === "archived"
  ) {
    return;
  }
  throw new Error("durability must be one of: ephemeral, durable, archived");
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

function assertStringField(
  value: unknown,
  fieldName: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
}

function assertNonEmptyStringField(
  value: unknown,
  fieldName: string,
): asserts value is string {
  assertStringField(value, fieldName);
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

function assertStringOrNullField(
  value: unknown,
  fieldName: string,
): asserts value is string | null {
  if (typeof value !== "string" && value !== null) {
    throw new Error(`${fieldName} must be a string or null`);
  }
}

function assertNonEmptyStringOrNullField(
  value: unknown,
  fieldName: string,
): void {
  assertStringOrNullField(value, fieldName);
  if (typeof value === "string" && value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
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
    if (entry.trim().length === 0) {
      throw new Error(`${fieldName}[${index}] must contain non-whitespace text`);
    }
  }
}
