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
  return (
    record.memoryType === "decision" ||
    record.source.sourceType === "decision" ||
    /^\s*(decision|constraint):/i.test(record.content)
  );
}

export function buildCompactionPlan(
  input: Readonly<BuildCompactionPlanInput>,
): CompactMemoryToolResult {
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
