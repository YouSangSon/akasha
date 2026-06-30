// Compaction plan orchestrator. Pure given (records, options): combines
// dedup + decay + promotion into a single CompactMemoryToolResult.
//
// Extracted from src/mcp/server.ts:526-563 in P17 step 0 with no behavior
// change, so the apply-path code in P17 step 3 has a stable seam to extend.
// Tests can drive this directly without spinning up the MCP registry.

import { findExactContentDuplicates } from "./detect-duplicates.js";
import { findDecayCandidates } from "./decay-score.js";
import type { ScopeType, SearchMemoryResult } from "../types.js";
import type {
  CompactMemoryToolResult,
  DuplicateGroupView,
} from "../mcp/types.js";

const DEFAULT_DECAY_THRESHOLD = 0.5;
const DEFAULT_HALF_LIFE_DAYS = 30;

export type BuildCompactionPlanInput = {
  records: readonly SearchMemoryResult[];
  scope: ScopeType;
  // Human-readable label for the summary line. For project scope this is the
  // projectKey; for user scope it is the userScopeId.
  scopeLabel: string;
  // Caller-supplied projectKey echoed back in the result; falls back to
  // scopeLabel when absent so the result always has a non-empty projectKey
  // field (compatibility with the existing CompactMemoryToolResult shape).
  projectKey?: string;
  dryRun: boolean;
  decayThreshold?: number;
  halfLifeDays?: number;
  // When provided, REPLACES exact-match dedup with this set. Computed by
  // the orchestrator (P18.1) which embeds records and runs
  // findSemanticDuplicates. Semantic with threshold ≤ 1.0 subsumes exact
  // match — running both would just produce overlapping groups that the
  // apply-path orchestrator dedups by id anyway.
  useSemanticGroups?: DuplicateGroupView[];
  // Injection point for tests / reproducibility. Defaults to new Date().
  now?: Date;
};

export function shouldPromoteRecord(record: SearchMemoryResult): boolean {
  assertPromotionRecord(record, "record");

  return (
    record.memoryType === "decision" ||
    record.source.sourceType === "decision" ||
    /^\s*(decision|constraint):/i.test(record.content)
  );
}

export function buildCompactionPlan(
  input: Readonly<BuildCompactionPlanInput>,
): CompactMemoryToolResult {
  assertBuildCompactionPlanInput(input);

  const decayThreshold = input.decayThreshold ?? DEFAULT_DECAY_THRESHOLD;
  const halfLifeDays = input.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
  const now = input.now ?? new Date();

  const duplicateGroups =
    input.useSemanticGroups !== undefined
      ? input.useSemanticGroups
      : findExactContentDuplicates(input.records).map((group) => ({
          keepId: String(group.keep.id),
          archiveIds: group.archive.map((r) => String(r.id)),
        }));

  const decayCandidates = findDecayCandidates(
    input.records,
    (record) => ({
      importance: record.importance ?? 0,
      createdAt: record.createdAt,
      now,
      halfLifeDays,
    }),
    decayThreshold,
    now,
  ).map((candidate) => ({
    id: String(candidate.record.id),
    score: candidate.score,
  }));

  const promotionCandidates = input.records
    .filter((record) => shouldPromoteRecord(record))
    .map((record) => String(record.id));

  return {
    ok: true,
    projectKey: input.projectKey ?? input.scopeLabel,
    dryRun: input.dryRun,
    archivedIds: [],
    mergedIds: [],
    promotionCandidates,
    duplicateGroups,
    decayCandidates,
    summary: `${input.dryRun ? "Dry run" : "Applied"} compaction for ${input.scope} scope ${input.scopeLabel}: ${duplicateGroups.length} duplicate group(s), ${decayCandidates.length} decay candidate(s)`,
  };
}

function assertBuildCompactionPlanInput(
  input: unknown,
): asserts input is BuildCompactionPlanInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("buildCompactionPlan input must be an object");
  }

  const candidate = input as Record<string, unknown>;
  if (!Array.isArray(candidate.records)) {
    throw new Error("records must be an array");
  }
  for (const [index, record] of candidate.records.entries()) {
    assertCompactionRecord(record, `records[${index}]`);
  }

  assertScopeType(candidate.scope, "scope");
  assertNonBlankString(candidate.scopeLabel, "scopeLabel");
  assertOptionalNonBlankString(candidate.projectKey, "projectKey");
  assertBoolean(candidate.dryRun, "dryRun");
  assertOptionalFiniteNumber(candidate.decayThreshold, "decayThreshold");
  assertOptionalPositiveFiniteNumber(candidate.halfLifeDays, "halfLifeDays");
  assertOptionalValidDate(candidate.now, "now");
  assertOptionalDuplicateGroupViews(candidate.useSemanticGroups);
}

function assertCompactionRecord(record: unknown, fieldName: string): void {
  assertPromotionRecord(record, fieldName);

  const candidate = record as Record<string, unknown>;
  assertPositiveSafeInteger(candidate.id, `${fieldName}.id`);
  assertString(candidate.createdAt, `${fieldName}.createdAt`);
  assertOptionalFiniteNumber(candidate.importance, `${fieldName}.importance`);
}

function assertPromotionRecord(record: unknown, fieldName: string): void {
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    throw new Error(`${fieldName} must be an object`);
  }

  const candidate = record as Record<string, unknown>;
  assertMemoryType(candidate.memoryType, `${fieldName}.memoryType`);
  assertString(candidate.content, `${fieldName}.content`);

  if (
    typeof candidate.source !== "object" ||
    candidate.source === null ||
    Array.isArray(candidate.source)
  ) {
    throw new Error(`${fieldName}.source must be an object`);
  }

  assertSourceType(
    (candidate.source as Record<string, unknown>).sourceType,
    `${fieldName}.source.sourceType`,
  );
}

function assertOptionalDuplicateGroupViews(value: unknown): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    throw new Error("useSemanticGroups must be an array");
  }

  for (const [index, group] of value.entries()) {
    assertDuplicateGroupView(group, index);
  }
}

function assertDuplicateGroupView(group: unknown, index: number): void {
  const prefix = `useSemanticGroups[${index}]`;

  if (typeof group !== "object" || group === null || Array.isArray(group)) {
    throw new Error(`${prefix} must be an object`);
  }

  const candidate = group as Record<string, unknown>;
  assertString(candidate.keepId, `${prefix}.keepId`);
  if (!Array.isArray(candidate.archiveIds)) {
    throw new Error(`${prefix}.archiveIds must be an array`);
  }

  for (const [archiveIndex, archiveId] of candidate.archiveIds.entries()) {
    assertString(archiveId, `${prefix}.archiveIds[${archiveIndex}]`);
  }
}

function assertScopeType(value: unknown, fieldName: string): void {
  if (value !== "project" && value !== "user") {
    throw new Error(`${fieldName} must be "project" or "user"`);
  }
}

function assertMemoryType(value: unknown, fieldName: string): void {
  if (value !== "decision" && value !== "summary" && value !== "fact") {
    throw new Error(
      `${fieldName} must be "decision", "summary", or "fact"`,
    );
  }
}

function assertSourceType(value: unknown, fieldName: string): void {
  if (
    value !== "decision" &&
    value !== "document" &&
    value !== "conversation"
  ) {
    throw new Error(
      `${fieldName} must be "decision", "document", or "conversation"`,
    );
  }
}

function assertBoolean(value: unknown, fieldName: string): void {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean`);
  }
}

function assertNonBlankString(value: unknown, fieldName: string): void {
  assertString(value, fieldName);
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} must contain non-whitespace text`);
  }
}

function assertOptionalNonBlankString(
  value: unknown,
  fieldName: string,
): void {
  if (value === undefined) {
    return;
  }
  assertNonBlankString(value, fieldName);
}

function assertString(
  value: unknown,
  fieldName: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
}

function assertOptionalFiniteNumber(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
}

function assertOptionalPositiveFiniteNumber(
  value: unknown,
  fieldName: string,
): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive finite number`);
  }
}

function assertPositiveSafeInteger(value: unknown, fieldName: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive safe integer`);
  }
}

function assertOptionalValidDate(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }

  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`${fieldName} must be a valid Date`);
  }
}
