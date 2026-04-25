// applyCompaction — orchestrates the destructive P17 apply path.
//
// Order per record (matches design doc §4.2):
//   1. PG: WITH deleted AS (DELETE FROM memory_records ...)
//          INSERT INTO memory_archive ... (single CTE)
//   2. Qdrant: deletePoints(collectionName, qdrant_point_ids)
//   3. PG: UPDATE memory_archive SET qdrant_status='deleted'
//
// Cross-store consistency: PG-first means a crash after step 1 leaves an
// orphan Qdrant vector, which the sweeper (src/compact/outbox-sweeper.ts)
// reconciles. The reverse order would leave a live memory_records row whose
// chunks point at a deleted Qdrant point — a user-visible bug.
//
// Concurrency: relies on memory_archive UNIQUE (compaction_run_id,
// source_record_id) for record-level idempotency and on
// compaction_runs.idempotency_key UNIQUE for run-level replay defense.
// Advisory-lock-based scope mutex was scoped out for P17 — see
// MemoryArchiveRepository.acquireScopeLock for the available primitive
// (session-level lock semantics need a dedicated connection to hold across
// statements; out of scope until multi-replica deploy).

import { randomUUID } from "node:crypto";
import type { Logger } from "../logger.js";
import type { CompactMemoryToolResult, DuplicateGroupView } from "../mcp/types.js";
import type { SearchMemoryResult } from "../types.js";
import type { EmbeddingClient } from "../store/canonical-indexing.js";
import type {
  ArchiveReason,
  MemoryArchiveRepository,
} from "../store/memory-archive-repository.js";
import {
  buildCompactionPlan,
  type BuildCompactionPlanInput,
} from "./compact-memory.js";
import { findSemanticDuplicates } from "./semantic-duplicates.js";

export type QdrantPointDeleter = {
  deletePoints(collectionName: string, pointIds: string[]): Promise<void>;
};

export type ApplyRateLimitConfig = {
  // Window during which `maxRuns` applies cap the org. Set to 0 to disable
  // the rate limit (tests, ops bypass).
  windowMs: number;
  maxRuns: number;
};

const DEFAULT_APPLY_RATE_LIMIT: ApplyRateLimitConfig = {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRuns: 1,
};

export class CompactionRateLimitError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(
      `compaction apply is rate-limited; retry in ${Math.ceil(retryAfterMs / 1000)}s`,
    );
    this.name = "CompactionRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export type ApplyCompactionDeps = {
  archiveRepository: MemoryArchiveRepository;
  qdrantClient: QdrantPointDeleter;
  collectionName: string;
  logger: Logger;
  // Required only when input.semanticDedupThreshold is set; embeds each
  // record's content for cosine clustering. Skipped on the dry-run /
  // exact-match path to keep the cheap path cheap.
  embeddings?: EmbeddingClient;
  // Stricter limit on destructive runs (default: 1/hour/org). Pass
  // { windowMs: 0 } to disable for tests or bulk-migration ops.
  applyRateLimit?: ApplyRateLimitConfig;
  // Test-injection points.
  generateRunId?: () => string;
  now?: () => Date;
};

export type ApplyCompactionInput = BuildCompactionPlanInput & {
  organizationId: string; // mandatory in apply path; cross-tenant guard
  actor: string;
  // When set, replaces exact-match dedup with cosine clustering. Caller
  // must also provide deps.embeddings. Threshold ∈ (0, 1]; recommended
  // 0.95 for paraphrases.
  semanticDedupThreshold?: number;
};

export type ApplyStats = {
  archived: number;
  skipped: number;
  qdrantPointsDeleted: number;
  qdrantPointsPending: number;
  durationMs: number;
};

export type ApplyCompactionResult = CompactMemoryToolResult & {
  compactionRunId: string;
  applyStats: ApplyStats;
};

export async function applyCompaction(
  input: Readonly<ApplyCompactionInput>,
  deps: Readonly<ApplyCompactionDeps>,
): Promise<ApplyCompactionResult> {
  const startedAt = (deps.now ?? (() => new Date()))();
  const idempotencyKey = (deps.generateRunId ?? randomUUID)();

  // Optional: semantic dedup REPLACES exact match when threshold is set
  // (semantic with threshold ≤ 1.0 subsumes exact match anyway). Embedding
  // is the cost; running it on dry-run is fine — the result is what the
  // caller wants to preview.
  let useSemanticGroups: DuplicateGroupView[] | undefined;
  if (input.semanticDedupThreshold !== undefined) {
    if (!deps.embeddings) {
      throw new Error(
        "applyCompaction: semanticDedupThreshold set but deps.embeddings missing",
      );
    }
    useSemanticGroups = await computeSemanticGroups(
      input.records,
      deps.embeddings,
      input.semanticDedupThreshold,
      deps.logger,
    );
  }

  const plan = buildCompactionPlan({ ...input, useSemanticGroups });

  // Dry-run path: skip ALL destructive ops, return plan + zero stats.
  if (input.dryRun) {
    return {
      ...plan,
      compactionRunId: idempotencyKey,
      applyStats: emptyStats(deps, startedAt),
    };
  }

  // Apply-path rate limit (P17 step 6). Default 1/hour/org; tests and
  // bulk-migration ops can disable via { windowMs: 0 }.
  const limit = deps.applyRateLimit ?? DEFAULT_APPLY_RATE_LIMIT;
  if (limit.windowMs > 0) {
    const recentCount = await deps.archiveRepository.countRecentApplyRuns(
      input.organizationId,
      limit.windowMs,
    );
    if (recentCount >= limit.maxRuns) {
      throw new CompactionRateLimitError(limit.windowMs);
    }
  }

  // Open or replay the run.
  const run = await deps.archiveRepository.createCompactionRun({
    organizationId: input.organizationId,
    actor: input.actor,
    scopeType: input.scope,
    scopeId: input.scopeLabel,
    dryRun: false,
    planGeneratedAt: startedAt,
    idempotencyKey,
  });

  // Replay defense: a completed run with the same idempotency_key returns
  // its prior outcome instead of re-executing.
  if (run.status === "completed") {
    deps.logger.info(
      {
        event: "compact.replay",
        compactionRunId: idempotencyKey,
        archived: run.archivedCount,
      },
      "compaction run already completed; returning prior outcome",
    );
    return {
      ...plan,
      compactionRunId: idempotencyKey,
      summary: `Replay of completed compaction for ${input.scope} scope ${input.scopeLabel}: ${run.archivedCount} archived previously`,
      applyStats: {
        archived: run.archivedCount,
        skipped: 0,
        qdrantPointsDeleted: run.archivedCount,
        qdrantPointsPending: run.qdrantFailed,
        durationMs: 0,
      },
    };
  }

  const candidates = collectArchiveCandidates(plan);

  let archivedCount = 0;
  let skippedCount = 0;
  let qdrantPointsDeleted = 0;
  let qdrantPointsPending = 0;
  let qdrantFailedRecords = 0;
  const archivedIds: string[] = [];

  for (const candidate of candidates) {
    let archiveResult;
    try {
      archiveResult = await deps.archiveRepository.applyCompactionRecord({
        runId: run.id,
        organizationId: input.organizationId,
        recordId: candidate.recordId,
        reason: candidate.reason,
        decayScore: candidate.decayScore,
        keptRecordId: candidate.keptRecordId,
        planGeneratedAt: startedAt,
      });
    } catch (err: unknown) {
      // PG failure aborts the run — leaves prior records archived (durable),
      // and the run row stays status='pending'. Operator must investigate.
      await markRunFailed(deps, run.id, err);
      throw err;
    }

    if (!archiveResult.archived) {
      // TOCTOU skip / org mismatch / concurrent run won.
      skippedCount += 1;
      continue;
    }

    archivedCount += 1;
    archivedIds.push(String(candidate.recordId));

    if (
      archiveResult.qdrantPointIds.length === 0 ||
      archiveResult.archiveId === undefined
    ) {
      // No vectors to clean — mark deleted immediately (vacuous true).
      if (archiveResult.archiveId !== undefined) {
        await deps.archiveRepository.markQdrantStatus(
          archiveResult.archiveId,
          "deleted",
        );
      }
      continue;
    }

    // Sequential Qdrant deletes — see design §4.4.
    try {
      await deps.qdrantClient.deletePoints(
        deps.collectionName,
        archiveResult.qdrantPointIds,
      );
      qdrantPointsDeleted += archiveResult.qdrantPointIds.length;
      await deps.archiveRepository.markQdrantStatus(
        archiveResult.archiveId,
        "deleted",
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      deps.logger.warn(
        {
          event: "compact.qdrant_delete_failed",
          archiveId: archiveResult.archiveId,
          recordId: candidate.recordId,
          err: errorMessage,
        },
        "qdrant delete failed; sweeper will retry",
      );
      qdrantFailedRecords += 1;
      qdrantPointsPending += archiveResult.qdrantPointIds.length;
      // Leave qdrant_status='pending' — the sweeper picks it up. Bumping
      // attempt_count + last_error here is best-effort.
      try {
        await deps.archiveRepository.markQdrantStatus(
          archiveResult.archiveId,
          "pending",
          errorMessage,
        );
      } catch (markErr: unknown) {
        deps.logger.error(
          { event: "compact.mark_pending_failed", archiveId: archiveResult.archiveId, err: markErr },
          "failed to mark archive row as pending; row remains pending",
        );
      }
    }
  }

  await deps.archiveRepository.completeCompactionRun({
    runId: run.id,
    status: "completed",
    archivedCount,
    duplicateCount: plan.duplicateGroups.reduce(
      (sum, g) => sum + g.archiveIds.length,
      0,
    ),
    decayCount: plan.decayCandidates.length,
    qdrantFailed: qdrantFailedRecords,
  });

  const endedAt = (deps.now ?? (() => new Date()))();

  return {
    ...plan,
    compactionRunId: idempotencyKey,
    archivedIds,
    summary: `Applied compaction for ${input.scope} scope ${input.scopeLabel}: ${archivedCount} archived, ${skippedCount} skipped${qdrantFailedRecords > 0 ? `, ${qdrantFailedRecords} qdrant pending` : ""}`,
    applyStats: {
      archived: archivedCount,
      skipped: skippedCount,
      qdrantPointsDeleted,
      qdrantPointsPending,
      durationMs: endedAt.getTime() - startedAt.getTime(),
    },
  };
}

type ArchiveCandidate = {
  recordId: number;
  reason: ArchiveReason;
  decayScore?: number;
  keptRecordId?: number;
};

// Build per-record archive candidates from the plan, deduplicating by id.
// A record that appears in BOTH a duplicate group and the decay list is
// archived once, with reason='duplicate' winning (more deterministic).
function collectArchiveCandidates(
  plan: CompactMemoryToolResult,
): ArchiveCandidate[] {
  const seen = new Set<string>();
  const candidates: ArchiveCandidate[] = [];

  for (const group of plan.duplicateGroups) {
    const keptRecordId = parseIntStrict(group.keepId);
    for (const archiveId of group.archiveIds) {
      if (seen.has(archiveId)) continue;
      seen.add(archiveId);
      candidates.push({
        recordId: parseIntStrict(archiveId),
        reason: "duplicate",
        keptRecordId,
      });
    }
  }

  for (const decay of plan.decayCandidates) {
    if (seen.has(decay.id)) continue;
    seen.add(decay.id);
    candidates.push({
      recordId: parseIntStrict(decay.id),
      reason: "decay",
      decayScore: decay.score,
    });
  }

  return candidates;
}

function parseIntStrict(value: string): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) {
    throw new Error(`Expected integer id, got: ${value}`);
  }
  return n;
}

function emptyStats(
  deps: ApplyCompactionDeps,
  startedAt: Date,
): ApplyStats {
  const endedAt = (deps.now ?? (() => new Date()))();
  return {
    archived: 0,
    skipped: 0,
    qdrantPointsDeleted: 0,
    qdrantPointsPending: 0,
    durationMs: endedAt.getTime() - startedAt.getTime(),
  };
}

async function computeSemanticGroups(
  records: readonly SearchMemoryResult[],
  embeddings: EmbeddingClient,
  threshold: number,
  logger: Logger,
): Promise<DuplicateGroupView[]> {
  const vectors = new Map<number, number[]>();
  for (const record of records) {
    try {
      const vec = await embeddings.embed(record.content);
      vectors.set(record.id, vec);
    } catch (err: unknown) {
      // One bad record shouldn't poison the whole compaction; skip it
      // (findSemanticDuplicates handles missing embeddings silently).
      logger.warn(
        {
          event: "compact.semantic_embed_failed",
          recordId: record.id,
          err: err instanceof Error ? err.message : String(err),
        },
        "embedding failed; record skipped from semantic dedup",
      );
    }
  }
  const groups = findSemanticDuplicates(records, vectors, threshold);
  return groups.map((group) => ({
    keepId: String(group.keep.id),
    archiveIds: group.archive.map((r) => String(r.id)),
  }));
}

async function markRunFailed(
  deps: ApplyCompactionDeps,
  runId: number,
  err: unknown,
): Promise<void> {
  try {
    await deps.archiveRepository.completeCompactionRun({
      runId,
      status: "failed",
      archivedCount: 0,
      duplicateCount: 0,
      decayCount: 0,
      qdrantFailed: 0,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  } catch (markErr: unknown) {
    deps.logger.error(
      { event: "compact.mark_run_failed", runId, err: markErr },
      "failed to mark run as failed; row remains pending",
    );
  }
}
