// MemoryArchiveRepository — repository pattern for the P17 compaction
// apply path. SQL ownership of compaction_runs + memory_archive tables.
//
// The orchestrator (src/compact/apply-compaction.ts) consumes this to:
//   1. createCompactionRun  — insert run row, returns numeric id
//   2. applyCompactionRecord — single CTE that DELETEs canonical row and
//                              INSERTs archive row in one statement
//   3. markQdrantStatus     — flip row to 'deleted' (or 'failed') after the
//                              cross-store Qdrant call resolves
//   4. completeRun          — final outcome counters + status
//   5. claimPendingQdrantCleanup — atomic sweeper claim
//   6. findRunByIdempotencyKey  — replay defense

import type { PgPool } from "../db/connection.js";
import { assertNonBlankText } from "./memory-content.js";

const QDRANT_CLEANUP_VISIBILITY_TIMEOUT_MS = 60_000;

export type CompactionRunStatus = "pending" | "completed" | "failed";
export type ArchiveReason = "duplicate" | "decay";
export type QdrantStatus = "pending" | "deleted" | "failed";

export type CreateCompactionRunInput = {
  organizationId: string;
  actor: string;
  scopeType: string;
  scopeId: string;
  dryRun: boolean;
  planGeneratedAt: Date;
  idempotencyKey: string; // UUID, server-generated
};

export type CompactionRunRow = {
  id: number;
  organizationId: string;
  status: CompactionRunStatus;
  archivedCount: number;
  duplicateCount: number;
  decayCount: number;
  qdrantFailed: number;
};

export type ApplyCompactionRecordInput = {
  runId: number;
  organizationId: string;
  recordId: number;
  reason: ArchiveReason;
  decayScore?: number;
  keptRecordId?: number;
  planGeneratedAt: Date; // TOCTOU anchor — DELETE only when updated_at <= this
};

export type ApplyCompactionRecordResult = {
  archived: boolean;
  archiveId?: number;
  qdrantPointIds: string[];
};

export type PendingQdrantCleanup = {
  archiveId: number;
  organizationId: string;
  qdrantPointIds: string[];
  attemptCount: number;
};

export type CompleteCompactionRunInput = {
  runId: number;
  status: CompactionRunStatus;
  archivedCount: number;
  duplicateCount: number;
  decayCount: number;
  qdrantFailed: number;
  errorMessage?: string;
};

export type MemoryArchiveRepository = {
  createCompactionRun(input: CreateCompactionRunInput): Promise<CompactionRunRow>;
  findRunByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<CompactionRunRow | null>;
  applyCompactionRecord(
    input: ApplyCompactionRecordInput,
  ): Promise<ApplyCompactionRecordResult>;
  markQdrantStatus(
    archiveId: number,
    status: QdrantStatus,
    errorMessage?: string,
  ): Promise<void>;
  completeCompactionRun(input: CompleteCompactionRunInput): Promise<void>;
  findPendingQdrantCleanup(limit: number): Promise<PendingQdrantCleanup[]>;
  claimPendingQdrantCleanup(input: {
    limit: number;
    now: Date;
  }): Promise<PendingQdrantCleanup[]>;
  acquireScopeLock(args: {
    organizationId: string;
    scopeType: string;
    scopeId: string;
  }): Promise<boolean>;
  // Counts dryRun=false runs for an org started within the given window.
  // Used by the apply-path rate limit (P17 step 6) to refuse a new apply
  // when an org has already run one recently.
  countRecentApplyRuns(
    organizationId: string,
    windowMs: number,
  ): Promise<number>;
  // P19.1 — unarchive recovery flow.
  findArchiveByIds(
    archiveIds: number[],
    organizationId: string,
  ): Promise<ArchiveRow[]>;
  restoreToCanonical(
    archive: ArchiveRow,
    organizationId: string,
  ): Promise<{ restoredRecordId: number }>;
  deleteRestoredCanonicalRecord(
    recordId: number,
    organizationId: string,
  ): Promise<void>;
  markUnarchived(archiveId: number): Promise<void>;
};

export type ArchiveRow = {
  id: number;
  organizationId: string;
  sourceRecordId: number;
  sourceId: number | null;
  scopeType: string;
  scopeId: string;
  projectKey: string | null;
  kind: string;
  title: string | null;
  content: string;
  summary: string | null;
  durability: string;
  importance: number;
  originalCreatedAt: string;
  originalUpdatedAt: string;
  unarchivedAt: string | null;
};

export function createMemoryArchiveRepository(
  pool: PgPool,
): MemoryArchiveRepository {
  return {
    async createCompactionRun(input) {
      assertNonBlankText(input.organizationId, "organizationId");

      // ON CONFLICT on idempotency_key: replay defense. Returns the existing
      // row (with its outcome counters) if a run with this UUID already
      // exists — caller decides whether to skip or replay the apply.
      const result = await pool.query<{
        id: number;
        organization_id: string;
        status: CompactionRunStatus;
        archived_count: number;
        duplicate_count: number;
        decay_count: number;
        qdrant_failed: number;
      }>(
        `
          INSERT INTO compaction_runs (
            organization_id, actor, scope_type, scope_id,
            dry_run, plan_generated_at, idempotency_key, status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
          ON CONFLICT (idempotency_key) DO NOTHING
          RETURNING id, organization_id, status, archived_count,
                    duplicate_count, decay_count, qdrant_failed
        `,
        [
          input.organizationId,
          input.actor,
          input.scopeType,
          input.scopeId,
          input.dryRun,
          input.planGeneratedAt.toISOString(),
          input.idempotencyKey,
        ],
      );

      if (result.rows.length === 1) {
        return mapRunRow(result.rows[0]!);
      }

      // ON CONFLICT path: row already exists. Read it back.
      const existing = await this.findRunByIdempotencyKey(input.idempotencyKey);
      if (!existing) {
        throw new Error(
          `compaction_runs insert returned 0 rows but no existing row found ` +
            `for idempotency_key=${input.idempotencyKey} — check unique constraint`,
        );
      }
      return existing;
    },

    async findRunByIdempotencyKey(idempotencyKey) {
      const result = await pool.query<{
        id: number;
        organization_id: string;
        status: CompactionRunStatus;
        archived_count: number;
        duplicate_count: number;
        decay_count: number;
        qdrant_failed: number;
      }>(
        `
          SELECT id, organization_id, status, archived_count,
                 duplicate_count, decay_count, qdrant_failed
          FROM compaction_runs
          WHERE idempotency_key = $1
        `,
        [idempotencyKey],
      );
      return result.rows.length === 1 ? mapRunRow(result.rows[0]!) : null;
    },

    async applyCompactionRecord(input) {
      assertNonBlankText(input.organizationId, "organizationId");

      // Single CTE: DELETE canonical row (gated by org + TOCTOU updated_at),
      // INSERT archive row with snapshot of the deleted record + the
      // qdrant_point_ids for cleanup. ON CONFLICT swallows re-runs of the
      // same (run_id, source_record_id) — record-level idempotency.
      //
      // If DELETE returns 0 rows (org mismatch, concurrent delete, or
      // updated_at > planGeneratedAt = TOCTOU skip), the INSERT sees no
      // RETURNING payload and result.rows is empty.
      const result = await pool.query<{
        archive_id: number;
        qdrant_point_ids: string[];
      }>(
        `
          WITH deleted AS (
            DELETE FROM memory_records
            WHERE id = $1
              AND organization_id = $2
              AND updated_at <= $7
            RETURNING id, organization_id, scope_type, scope_id, project_key,
                      kind, title, content, summary, durability, importance,
                      source_id, created_at, updated_at
          ),
          deleted_with_points AS (
            SELECT
              d.*,
              COALESCE((
                SELECT array_agg(mc.qdrant_point_id)
                FROM memory_chunks mc
                WHERE mc.memory_record_id = d.id
                  AND mc.qdrant_point_id IS NOT NULL
              ), '{}') AS qdrant_point_ids
            FROM deleted d
          ),
          inserted AS (
            INSERT INTO memory_archive (
              compaction_run_id, organization_id, source_record_id,
              archive_reason, scope_type, scope_id, project_key, kind, title,
              content, summary, durability, importance, decay_score,
              kept_record_id, qdrant_point_ids, qdrant_next_retry_at, source_id,
              original_created_at, original_updated_at
            )
            SELECT
              $3, dwp.organization_id, dwp.id, $4,
              dwp.scope_type, dwp.scope_id, dwp.project_key, dwp.kind, dwp.title,
              dwp.content, dwp.summary, dwp.durability, dwp.importance, $5, $6,
              dwp.qdrant_point_ids,
              CASE
                WHEN array_length(dwp.qdrant_point_ids, 1) > 0
                THEN NOW()
                ELSE NULL
              END,
              dwp.source_id, dwp.created_at, dwp.updated_at
            FROM deleted_with_points dwp
            ON CONFLICT (compaction_run_id, source_record_id) DO NOTHING
            RETURNING id AS archive_id, qdrant_point_ids
          )
          SELECT archive_id, qdrant_point_ids FROM inserted
        `,
        [
          input.recordId,
          input.organizationId,
          input.runId,
          input.reason,
          input.decayScore ?? null,
          input.keptRecordId ?? null,
          input.planGeneratedAt.toISOString(),
        ],
      );

      if (result.rows.length === 0) {
        return { archived: false, qdrantPointIds: [] };
      }
      const row = result.rows[0]!;
      return {
        archived: true,
        archiveId: row.archive_id,
        qdrantPointIds: row.qdrant_point_ids ?? [],
      };
    },

    async markQdrantStatus(archiveId, status, errorMessage) {
      if (status === "deleted") {
        await pool.query(
          `
            UPDATE memory_archive
            SET qdrant_status = 'deleted',
                qdrant_cleaned_at = NOW(),
                qdrant_attempt_count = qdrant_attempt_count + 1,
                qdrant_next_retry_at = NULL
            WHERE id = $1
          `,
          [archiveId],
        );
        return;
      }
      if (status === "failed") {
        await pool.query(
          `
            UPDATE memory_archive
            SET qdrant_status = 'failed',
                qdrant_attempt_count = qdrant_attempt_count + 1,
                qdrant_last_error = $2,
                qdrant_next_retry_at = NULL
            WHERE id = $1
          `,
          [archiveId, errorMessage ?? null],
        );
        return;
      }
      await pool.query(
        `
          UPDATE memory_archive
          SET qdrant_status = 'pending',
              qdrant_attempt_count = qdrant_attempt_count + 1,
              qdrant_last_error = $2,
              qdrant_next_retry_at = NOW() + INTERVAL '30 seconds'
          WHERE id = $1
        `,
        [archiveId, errorMessage ?? null],
      );
    },

    async completeCompactionRun(input) {
      await pool.query(
        `
          UPDATE compaction_runs
          SET status = $2,
              archived_count = $3,
              duplicate_count = $4,
              decay_count = $5,
              qdrant_failed = $6,
              error_message = $7,
              completed_at = NOW()
          WHERE id = $1
        `,
        [
          input.runId,
          input.status,
          input.archivedCount,
          input.duplicateCount,
          input.decayCount,
          input.qdrantFailed,
          input.errorMessage ?? null,
        ],
      );
    },

    async findPendingQdrantCleanup(limit) {
      // Read-only compatibility wrapper for tests/manual monitoring. Sweeper
      // workers must use claimPendingQdrantCleanup for atomic visibility.
      const result = await pool.query<{
        id: number;
        organization_id: string;
        qdrant_point_ids: string[];
        qdrant_attempt_count: number;
      }>(
        `
          SELECT id, organization_id, qdrant_point_ids, qdrant_attempt_count
          FROM memory_archive
          WHERE qdrant_status = 'pending'
            AND qdrant_next_retry_at IS NOT NULL
            AND qdrant_next_retry_at <= NOW()
            AND archived_at < NOW() - INTERVAL '60 seconds'
            AND array_length(qdrant_point_ids, 1) > 0
          ORDER BY qdrant_next_retry_at ASC, archived_at ASC
          LIMIT $1
        `,
        [limit],
      );
      return result.rows.map((row) => ({
        archiveId: row.id,
        organizationId: row.organization_id,
        qdrantPointIds: row.qdrant_point_ids ?? [],
        attemptCount: row.qdrant_attempt_count,
      }));
    },

    async claimPendingQdrantCleanup({ limit, now }) {
      const claimUntil = new Date(
        now.getTime() + QDRANT_CLEANUP_VISIBILITY_TIMEOUT_MS,
      );
      const result = await pool.query<{
        id: number;
        organization_id: string;
        qdrant_point_ids: string[];
        qdrant_attempt_count: number;
      }>(
        `
          UPDATE memory_archive
          SET qdrant_next_retry_at = $3,
              qdrant_last_error = NULL
          WHERE id IN (
            SELECT id
            FROM memory_archive
            WHERE qdrant_status = 'pending'
              AND qdrant_next_retry_at IS NOT NULL
              AND qdrant_next_retry_at <= $1
              AND archived_at < $1::timestamptz - INTERVAL '60 seconds'
              AND array_length(qdrant_point_ids, 1) > 0
            ORDER BY qdrant_next_retry_at ASC, archived_at ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED
          )
          RETURNING id, organization_id, qdrant_point_ids, qdrant_attempt_count
        `,
        [now.toISOString(), limit, claimUntil.toISOString()],
      );

      return result.rows.map((row) => ({
        archiveId: row.id,
        organizationId: row.organization_id,
        qdrantPointIds: row.qdrant_point_ids ?? [],
        attemptCount: row.qdrant_attempt_count,
      }));
    },

    async countRecentApplyRuns(organizationId, windowMs) {
      // Postgres INTERVAL doesn't accept parameterized text directly; build
      // it from milliseconds via make_interval. windowMs is server-controlled
      // (caller is the orchestrator, not user input) so concatenation would
      // be safe, but make_interval keeps the query plan reusable.
      const windowSeconds = Math.max(1, Math.floor(windowMs / 1000));
      const result = await pool.query<{ count: string | number }>(
        `
          SELECT COUNT(*) AS count
          FROM compaction_runs
          WHERE organization_id = $1
            AND dry_run = false
            AND started_at > NOW() - make_interval(secs => $2)
        `,
        [organizationId, windowSeconds],
      );
      const raw = result.rows[0]?.count ?? 0;
      return typeof raw === "string" ? Number.parseInt(raw, 10) : raw;
    },

    async findArchiveByIds(archiveIds, organizationId) {
      assertNonBlankText(organizationId, "organizationId");

      if (archiveIds.length === 0) return [];
      const result = await pool.query<{
        id: number;
        organization_id: string;
        source_record_id: number;
        source_id: number | null;
        scope_type: string;
        scope_id: string;
        project_key: string | null;
        kind: string;
        title: string | null;
        content: string;
        summary: string | null;
        durability: string;
        importance: number;
        original_created_at: string | Date;
        original_updated_at: string | Date;
        unarchived_at: string | Date | null;
      }>(
        `
          SELECT id, organization_id, source_record_id, source_id,
                 scope_type, scope_id, project_key, kind, title, content,
                 summary, durability, importance,
                 original_created_at, original_updated_at, unarchived_at
          FROM memory_archive
          WHERE id = ANY($1::bigint[])
            AND organization_id = $2
        `,
        [archiveIds, organizationId],
      );
      return result.rows.map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        sourceRecordId: row.source_record_id,
        sourceId: row.source_id,
        scopeType: row.scope_type,
        scopeId: row.scope_id,
        projectKey: row.project_key,
        kind: row.kind,
        title: row.title,
        content: row.content,
        summary: row.summary,
        durability: row.durability,
        importance: row.importance,
        originalCreatedAt: toIso(row.original_created_at),
        originalUpdatedAt: toIso(row.original_updated_at),
        unarchivedAt: row.unarchived_at === null ? null : toIso(row.unarchived_at),
      }));
    },

    async restoreToCanonical(archive, organizationId) {
      assertNonBlankText(organizationId, "organizationId");

      // Insert preserves original_created_at / original_updated_at so
      // forensic queries see the actual age of the resurrected record. The
      // source_id is restored verbatim — caller is expected to verify the
      // source row still exists if FK violation matters (most ops won't
      // hit this since sources outlive memory_records).
      if (archive.organizationId !== organizationId) {
        throw new Error(
          `restoreToCanonical: org mismatch (archive.org=${archive.organizationId}, requested=${organizationId})`,
        );
      }
      if (archive.sourceId === null) {
        throw new Error(
          `restoreToCanonical: archive ${archive.id} has no source_id (pre-P19.1 archive row); cannot restore until source is rebuilt`,
        );
      }
      const result = await pool.query<{ id: number }>(
        `
          INSERT INTO memory_records (
            organization_id, scope_type, scope_id, project_key, kind, title,
            content, summary, durability, importance, source_id,
            created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id
        `,
        [
          organizationId,
          archive.scopeType,
          archive.scopeId,
          archive.projectKey,
          archive.kind,
          archive.title,
          archive.content,
          archive.summary,
          archive.durability,
          archive.importance,
          archive.sourceId,
          archive.originalCreatedAt,
          archive.originalUpdatedAt,
        ],
      );
      const newId = result.rows[0]?.id;
      if (newId === undefined) {
        throw new Error(
          `restoreToCanonical: INSERT returned no id for archive ${archive.id}`,
        );
      }
      return { restoredRecordId: newId };
    },

    async deleteRestoredCanonicalRecord(recordId, organizationId) {
      assertNonBlankText(organizationId, "organizationId");

      await pool.query(
        `
          DELETE FROM memory_records
          WHERE id = $1
            AND organization_id = $2
        `,
        [recordId, organizationId],
      );
    },

    async markUnarchived(archiveId) {
      await pool.query(
        `
          UPDATE memory_archive
          SET unarchived_at = NOW()
          WHERE id = $1
        `,
        [archiveId],
      );
    },

    async acquireScopeLock(args) {
      // Per-(org, scope) advisory lock. Two simultaneous applies on the same
      // scope race on canonical DELETE; this serializes them. Lock auto-
      // releases on transaction end. We use session-level pg_try_advisory_lock
      // so the orchestrator can hold it across multiple statements without
      // wrapping everything in one transaction.
      const result = await pool.query<{ acquired: boolean }>(
        `
          SELECT pg_try_advisory_lock(
            hashtextextended($1, 0)
          ) AS acquired
        `,
        [`${args.organizationId}:${args.scopeType}:${args.scopeId}`],
      );
      return result.rows[0]?.acquired === true;
    },
  };
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapRunRow(row: {
  id: number;
  organization_id: string;
  status: CompactionRunStatus;
  archived_count: number;
  duplicate_count: number;
  decay_count: number;
  qdrant_failed: number;
}): CompactionRunRow {
  return {
    id: row.id,
    organizationId: row.organization_id,
    status: row.status,
    archivedCount: row.archived_count,
    duplicateCount: row.duplicate_count,
    decayCount: row.decay_count,
    qdrantFailed: row.qdrant_failed,
  };
}
