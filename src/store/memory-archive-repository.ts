// MemoryArchiveRepository — repository pattern for the compaction apply path.
// SQL ownership of compaction_runs + memory_archive tables.
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
import { toIsoString, toNumber } from "./db-utils.js";
import { assertNonBlankText } from "./memory-content.js";

const QDRANT_CLEANUP_VISIBILITY_TIMEOUT_MS = 60_000;
const POSTGRES_INTEGER_MIN = -2_147_483_648;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

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
  sourceRecordId?: number;
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
  // Used by the apply-path rate limit to refuse a new apply when an org has
  // already run one recently.
  countRecentApplyRuns(
    organizationId: string,
    windowMs: number,
  ): Promise<number>;
  // Unarchive recovery flow.
  findArchiveByIds(
    archiveIds: number[],
    organizationId: string,
  ): Promise<ArchiveRow[]>;
  restoreToCanonical(
    archive: ArchiveRow,
    organizationId: string,
    beforeCommit?: (recordId: number) => Promise<void>,
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
  assertArchivePool(pool);

  return {
    async createCompactionRun(input) {
      assertCreateCompactionRunInput(input);
      const organizationId = input.organizationId.trim();
      const actor = input.actor.trim();
      const scopeType = toArchiveScopeType(input.scopeType.trim(), "scopeType");
      const scopeId = input.scopeId.trim();
      const idempotencyKey = input.idempotencyKey.trim();

      // ON CONFLICT on idempotency_key: replay defense. Returns the existing
      // row (with its outcome counters) if a run with this UUID already
      // exists — caller decides whether to skip or replay the apply.
      const result = await pool.query<{
        id: number | string;
        organization_id: string;
        status: CompactionRunStatus;
        archived_count: number | string;
        duplicate_count: number | string;
        decay_count: number | string;
        qdrant_failed: number | string;
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
          organizationId,
          actor,
          scopeType,
          scopeId,
          input.dryRun,
          input.planGeneratedAt.toISOString(),
          idempotencyKey,
        ],
      );

      if (result.rows.length === 1) {
        return mapRunRow(result.rows[0]!);
      }

      // ON CONFLICT path: row already exists. Read it back.
      const existing = await this.findRunByIdempotencyKey(idempotencyKey);
      if (!existing) {
        throw new Error(
          `compaction_runs insert returned 0 rows but no existing row found ` +
            `for idempotency_key=${idempotencyKey} — check unique constraint`,
        );
      }
      return existing;
    },

    async findRunByIdempotencyKey(idempotencyKey) {
      assertNonBlankText(idempotencyKey, "idempotencyKey");
      const normalizedIdempotencyKey = idempotencyKey.trim();

      const result = await pool.query<{
        id: number | string;
        organization_id: string;
        status: CompactionRunStatus;
        archived_count: number | string;
        duplicate_count: number | string;
        decay_count: number | string;
        qdrant_failed: number | string;
      }>(
        `
          SELECT id, organization_id, status, archived_count,
                 duplicate_count, decay_count, qdrant_failed
          FROM compaction_runs
          WHERE idempotency_key = $1
        `,
        [normalizedIdempotencyKey],
      );
      return result.rows.length === 1 ? mapRunRow(result.rows[0]!) : null;
    },

    async applyCompactionRecord(input) {
      assertApplyCompactionRecordInput(input);
      const organizationId = input.organizationId.trim();

      // Single CTE: DELETE canonical row (gated by org + TOCTOU updated_at),
      // INSERT archive row with snapshot of the deleted record + the
      // qdrant_point_ids for cleanup. ON CONFLICT swallows re-runs of the
      // same (run_id, source_record_id) — record-level idempotency.
      //
      // If DELETE returns 0 rows (org mismatch, concurrent delete, or
      // updated_at > planGeneratedAt = TOCTOU skip), the INSERT sees no
      // RETURNING payload and result.rows is empty.
      const result = await pool.query<{
        archive_id: number | string;
        qdrant_point_ids: unknown;
      }>(
        `
          WITH deleted AS (
            DELETE FROM memory_records
            WHERE id = $1
              AND organization_id = $2
              AND updated_at <= $7
              AND NOT EXISTS (
                SELECT 1 FROM goal_runs gr
                WHERE gr.id = memory_records.goal_run_id
                  AND gr.organization_id = $2
                  AND gr.status = 'active'
              )
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
              dwp.qdrant_point_ids, NOW(),
              dwp.source_id, dwp.created_at, dwp.updated_at
            FROM deleted_with_points dwp
            ON CONFLICT (compaction_run_id, source_record_id) DO NOTHING
            RETURNING id AS archive_id, qdrant_point_ids
          )
          SELECT archive_id, qdrant_point_ids FROM inserted
        `,
        [
          input.recordId,
          organizationId,
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
        archiveId: toPositiveSafeInteger(row.archive_id, "memory archive id"),
        qdrantPointIds: toNonBlankStringArray(
          row.qdrant_point_ids,
          "memory archive qdrant_point_ids",
        ),
      };
    },

    async markQdrantStatus(archiveId, status, errorMessage) {
      assertPositiveSafeInteger(archiveId, "archiveId");
      assertQdrantStatus(status, "status");
      assertOptionalString(errorMessage, "errorMessage");
      const normalizedErrorMessage = normalizeOptionalErrorMessage(errorMessage);

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
          [archiveId, normalizedErrorMessage],
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
        [archiveId, normalizedErrorMessage],
      );
    },

    async completeCompactionRun(input) {
      assertCompleteCompactionRunInput(input);
      const errorMessage = normalizeOptionalErrorMessage(input.errorMessage);

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
          errorMessage,
        ],
      );
    },

    async findPendingQdrantCleanup(limit) {
      assertPositiveSafeInteger(limit, "limit");

      // Read-only compatibility wrapper for tests/manual monitoring. Sweeper
      // workers must use claimPendingQdrantCleanup for atomic visibility.
      const result = await pool.query<{
        id: number | string;
        organization_id: unknown;
        source_record_id: unknown;
        qdrant_point_ids: unknown;
        qdrant_attempt_count: number | string;
      }>(
        `
          SELECT id, organization_id, source_record_id, qdrant_point_ids, qdrant_attempt_count
          FROM memory_archive
          WHERE qdrant_status = 'pending'
            AND qdrant_next_retry_at IS NOT NULL
            AND qdrant_next_retry_at <= NOW()
            AND archived_at < NOW() - INTERVAL '60 seconds'
          ORDER BY qdrant_next_retry_at ASC, archived_at ASC
          LIMIT $1
        `,
        [limit],
      );
      return result.rows.map(mapPendingQdrantCleanupRow);
    },

    async claimPendingQdrantCleanup(input) {
      assertQdrantCleanupClaimInput(input);
      const { limit, now } = input;

      const claimUntil = new Date(
        now.getTime() + QDRANT_CLEANUP_VISIBILITY_TIMEOUT_MS,
      );
      const result = await pool.query<{
        id: number | string;
        organization_id: unknown;
        source_record_id: unknown;
        qdrant_point_ids: unknown;
        qdrant_attempt_count: number | string;
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
            ORDER BY qdrant_next_retry_at ASC, archived_at ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED
          )
          RETURNING id, organization_id, source_record_id, qdrant_point_ids, qdrant_attempt_count
        `,
        [now.toISOString(), limit, claimUntil.toISOString()],
      );

      return result.rows.map(mapPendingQdrantCleanupRow);
    },

    async countRecentApplyRuns(organizationId, windowMs) {
      assertNonBlankText(organizationId, "organizationId");
      assertPositiveSafeInteger(windowMs, "windowMs");
      const scopedOrganizationId = organizationId.trim();

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
        [scopedOrganizationId, windowSeconds],
      );
      const raw = result.rows[0]?.count;
      return raw === undefined ? 0 : toRecentApplyRunCount(raw);
    },

    async findArchiveByIds(archiveIds, organizationId) {
      assertPositiveSafeIntegerArray(archiveIds, "archiveIds");
      assertNonBlankText(organizationId, "organizationId");

      if (archiveIds.length === 0) return [];
      const scopedOrganizationId = organizationId.trim();
      const result = await pool.query<{
        id: unknown;
        organization_id: unknown;
        source_record_id: unknown;
        source_id: unknown;
        scope_type: unknown;
        scope_id: unknown;
        project_key: unknown;
        kind: unknown;
        title: unknown;
        content: unknown;
        summary: unknown;
        durability: unknown;
        importance: unknown;
        original_created_at: unknown;
        original_updated_at: unknown;
        unarchived_at: unknown;
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
        [archiveIds, scopedOrganizationId],
      );
      return result.rows.map(mapArchiveLookupRow);
    },

    async restoreToCanonical(archive, organizationId, beforeCommit) {
      assertNonBlankText(organizationId, "organizationId");
      const scopedOrganizationId = organizationId.trim();
      const restorableArchive = mapRestorableArchive(archive);

      // Insert preserves original_created_at / original_updated_at so
      // forensic queries see the actual age of the resurrected record. The
      // source_id is restored verbatim — caller is expected to verify the
      // source row still exists if FK violation matters (most ops won't
      // hit this since sources outlive memory_records).
      if (restorableArchive.organizationId !== scopedOrganizationId) {
        throw new Error(
          `restoreToCanonical: org mismatch (archive.org=${restorableArchive.organizationId}, requested=${scopedOrganizationId})`,
        );
      }
      if (restorableArchive.sourceId === null) {
        throw new Error(
          `restoreToCanonical: archive ${restorableArchive.id} has no source_id; cannot restore until the original source is rebuilt`,
        );
      }
      const client = beforeCommit ? await pool.connect() : undefined;
      const queryable = client ?? pool;
      try {
        if (client) await client.query("BEGIN");
        const result = await queryable.query<{ id: number | string }>(
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
            scopedOrganizationId,
            restorableArchive.scopeType,
            restorableArchive.scopeId,
            restorableArchive.projectKey,
            restorableArchive.kind,
            restorableArchive.title,
            restorableArchive.content,
            restorableArchive.summary,
            restorableArchive.durability,
            restorableArchive.importance,
            restorableArchive.sourceId,
            restorableArchive.originalCreatedAt,
            restorableArchive.originalUpdatedAt,
          ],
        );
        const newId = result.rows[0]?.id;
        if (newId === undefined) {
          throw new Error(
            `restoreToCanonical: INSERT returned no id for archive ${restorableArchive.id}`,
          );
        }
        const restoredRecordId = toPositiveSafeInteger(newId, "restored memory id");
        await beforeCommit?.(restoredRecordId);
        if (client) await client.query("COMMIT");
        return { restoredRecordId };
      } catch (error: unknown) {
        if (client) await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client?.release();
      }
    },

    async deleteRestoredCanonicalRecord(recordId, organizationId) {
      assertPositiveSafeInteger(recordId, "recordId");
      assertNonBlankText(organizationId, "organizationId");
      const scopedOrganizationId = organizationId.trim();

      await pool.query(
        `
          DELETE FROM memory_records
          WHERE id = $1
            AND organization_id = $2
        `,
        [recordId, scopedOrganizationId],
      );
    },

    async markUnarchived(archiveId) {
      assertPositiveSafeInteger(archiveId, "archiveId");

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
      const lockInput = assertScopeLockInput(args);

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
        [`${lockInput.organizationId}:${lockInput.scopeType}:${lockInput.scopeId}`],
      );
      return result.rows[0]?.acquired === true;
    },
  };
}

function assertArchivePool(value: unknown): asserts value is PgPool {
  const candidate = assertObject(value, "memory archive pool");
  assertFunction(candidate.query, "memory archive pool.query");
}

function assertQdrantStatus(
  value: unknown,
  fieldName: string,
): asserts value is QdrantStatus {
  if (value !== "pending" && value !== "deleted" && value !== "failed") {
    throw new Error(`${fieldName} must be "pending", "deleted", or "failed"`);
  }
}

function assertQdrantCleanupClaimInput(value: unknown): asserts value is {
  limit: number;
  now: Date;
} {
  const candidate = assertObject(value, "qdrant cleanup claim input");
  assertPositiveSafeInteger(candidate.limit, "limit");
  assertValidDate(candidate.now, "now");
}

function assertCreateCompactionRunInput(
  input: unknown,
): asserts input is CreateCompactionRunInput {
  const candidate = assertObject(input, "create compaction run input");
  assertNonBlankText(candidate.organizationId, "organizationId");
  assertNonBlankText(candidate.actor, "actor");
  assertNonBlankText(candidate.scopeType, "scopeType");
  assertNonBlankText(candidate.scopeId, "scopeId");
  assertBoolean(candidate.dryRun, "dryRun");
  assertValidDate(candidate.planGeneratedAt, "planGeneratedAt");
  assertNonBlankText(candidate.idempotencyKey, "idempotencyKey");
}

function assertApplyCompactionRecordInput(
  input: unknown,
): asserts input is ApplyCompactionRecordInput {
  const candidate = assertObject(input, "apply compaction record input");
  assertPositiveSafeInteger(candidate.runId, "runId");
  assertNonBlankText(candidate.organizationId, "organizationId");
  assertPositiveSafeInteger(candidate.recordId, "recordId");
  assertArchiveReason(candidate.reason, "reason");
  assertOptionalFiniteNumber(candidate.decayScore, "decayScore");
  assertOptionalPositiveSafeInteger(candidate.keptRecordId, "keptRecordId");
  assertValidDate(candidate.planGeneratedAt, "planGeneratedAt");
}

function assertCompleteCompactionRunInput(
  input: unknown,
): asserts input is CompleteCompactionRunInput {
  const candidate = assertObject(input, "complete compaction run input");
  assertPositiveSafeInteger(candidate.runId, "runId");
  assertCompactionRunStatus(candidate.status, "status");
  assertNonNegativeSafeInteger(candidate.archivedCount, "archivedCount");
  assertNonNegativeSafeInteger(candidate.duplicateCount, "duplicateCount");
  assertNonNegativeSafeInteger(candidate.decayCount, "decayCount");
  assertNonNegativeSafeInteger(candidate.qdrantFailed, "qdrantFailed");
  assertOptionalString(candidate.errorMessage, "errorMessage");
}

function assertScopeLockInput(value: unknown): {
  organizationId: string;
  scopeType: string;
  scopeId: string;
} {
  const candidate = assertObject(value, "scope lock input");
  return {
    organizationId: assertRequiredNonBlankString(
      candidate.organizationId,
      "organizationId",
    ).trim(),
    scopeType: toArchiveScopeType(
      assertRequiredNonBlankString(candidate.scopeType, "scopeType").trim(),
      "scopeType",
    ),
    scopeId: assertRequiredNonBlankString(candidate.scopeId, "scopeId").trim(),
  };
}

function mapRestorableArchive(value: unknown): ArchiveRow {
  const candidate = assertObject(value, "restore archive");
  const organizationId = candidate.organizationId;
  assertNonBlankText(organizationId, "memory archive organizationId");
  const sourceId =
    candidate.sourceId === null
      ? null
      : toPositiveSafeInteger(candidate.sourceId, "memory archive source_id");
  return {
    id: toPositiveSafeInteger(candidate.id, "memory archive id"),
    organizationId,
    sourceRecordId: toPositiveSafeInteger(
      candidate.sourceRecordId,
      "memory archive source_record_id",
    ),
    sourceId,
    scopeType: toArchiveScopeType(candidate.scopeType),
    scopeId: assertRequiredNonBlankString(
      candidate.scopeId,
      "memory archive scopeId",
    ),
    projectKey: toNullableString(
      candidate.projectKey,
      "memory archive projectKey",
    ),
    kind: toArchiveKind(candidate.kind),
    title: toNullableString(candidate.title, "memory archive title"),
    content: assertRequiredNonBlankString(
      candidate.content,
      "memory archive content",
    ),
    summary: toNullableString(candidate.summary, "memory archive summary"),
    durability: toArchiveDurability(candidate.durability),
    importance: toPostgresInteger(
      candidate.importance,
      "memory archive importance",
    ),
    originalCreatedAt: toIsoString(
      candidate.originalCreatedAt as string | Date,
    ),
    originalUpdatedAt: toIsoString(
      candidate.originalUpdatedAt as string | Date,
    ),
    unarchivedAt:
      candidate.unarchivedAt === null
        ? null
        : toIsoString(candidate.unarchivedAt as string | Date),
  };
}

function mapArchiveLookupRow(value: unknown): ArchiveRow {
  const row = assertObject(value, "memory archive row");
  return {
    id: toPositiveSafeInteger(row.id, "memory archive id"),
    organizationId: assertRequiredNonBlankString(
      row.organization_id,
      "memory archive organization_id",
    ),
    sourceRecordId: toPositiveSafeInteger(
      row.source_record_id,
      "memory archive source_record_id",
    ),
    sourceId:
      row.source_id === null
        ? null
        : toPositiveSafeInteger(row.source_id, "memory archive source_id"),
    scopeType: toArchiveScopeType(row.scope_type),
    scopeId: assertRequiredNonBlankString(
      row.scope_id,
      "memory archive scope_id",
    ),
    projectKey: toNullableString(
      row.project_key,
      "memory archive project_key",
    ),
    kind: toArchiveKind(row.kind),
    title: toNullableString(row.title, "memory archive title"),
    content: assertRequiredNonBlankString(
      row.content,
      "memory archive content",
    ),
    summary: toNullableString(row.summary, "memory archive summary"),
    durability: toArchiveDurability(row.durability),
    importance: toPostgresInteger(row.importance, "memory archive importance"),
    originalCreatedAt: toIsoString(row.original_created_at as string | Date),
    originalUpdatedAt: toIsoString(row.original_updated_at as string | Date),
    unarchivedAt:
      row.unarchived_at === null
        ? null
        : toIsoString(row.unarchived_at as string | Date),
  };
}

function mapPendingQdrantCleanupRow(value: unknown): PendingQdrantCleanup {
  const candidate = assertObject(value, "pending qdrant cleanup row");
  const organizationId = candidate.organization_id;
  assertNonBlankText(organizationId, "memory archive organization_id");
  return {
    archiveId: toPositiveSafeInteger(candidate.id, "memory archive id"),
    organizationId,
    sourceRecordId: toPositiveSafeInteger(
      candidate.source_record_id,
      "memory archive source_record_id",
    ),
    qdrantPointIds: toNonBlankStringArray(
      candidate.qdrant_point_ids,
      "memory archive qdrant_point_ids",
    ),
    attemptCount: toNonNegativeSafeInteger(
      candidate.qdrant_attempt_count,
      "memory archive qdrant_attempt_count",
    ),
  };
}

function toRecentApplyRunCount(value: unknown): number {
  let count: number;
  try {
    count = toNumber(value);
  } catch (_err: unknown) {
    throw new Error(
      "recent apply run count must be a non-negative safe integer",
    );
  }
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(
      "recent apply run count must be a non-negative safe integer",
    );
  }
  return count;
}

function toPositiveSafeInteger(value: unknown, fieldName: string): number {
  const numberValue = toNumber(value);
  assertPositiveSafeInteger(numberValue, fieldName);
  return numberValue;
}

function toNonNegativeSafeInteger(value: unknown, fieldName: string): number {
  const numberValue = toNumber(value);
  assertNonNegativeSafeInteger(numberValue, fieldName);
  return numberValue;
}

function toPostgresInteger(value: unknown, fieldName: string): number {
  const numberValue = toNumber(value);
  if (
    !Number.isInteger(numberValue) ||
    numberValue < POSTGRES_INTEGER_MIN ||
    numberValue > POSTGRES_INTEGER_MAX
  ) {
    throw new Error(`${fieldName} must be a Postgres integer`);
  }
  return numberValue;
}

function mapRunRow(value: unknown): CompactionRunRow {
  const row = assertObject(value, "compaction run row");
  const organizationId = row.organization_id;
  assertNonBlankText(organizationId, "compaction run organization_id");
  return {
    id: toPositiveSafeInteger(row.id, "compaction run id"),
    organizationId,
    status: toCompactionRunStatus(row.status),
    archivedCount: toNonNegativeSafeInteger(
      row.archived_count,
      "compaction run archived_count",
    ),
    duplicateCount: toNonNegativeSafeInteger(
      row.duplicate_count,
      "compaction run duplicate_count",
    ),
    decayCount: toNonNegativeSafeInteger(
      row.decay_count,
      "compaction run decay_count",
    ),
    qdrantFailed: toNonNegativeSafeInteger(
      row.qdrant_failed,
      "compaction run qdrant_failed",
    ),
  };
}

function toCompactionRunStatus(value: unknown): CompactionRunStatus {
  assertCompactionRunStatus(value, "compaction run status");
  return value;
}

function assertCompactionRunStatus(
  value: unknown,
  fieldName: string,
): asserts value is CompactionRunStatus {
  if (value !== "pending" && value !== "completed" && value !== "failed") {
    throw new Error(
      `${fieldName} must be "pending", "completed", or "failed"`,
    );
  }
}

function assertArchiveReason(
  value: unknown,
  fieldName: string,
): asserts value is ArchiveReason {
  if (value !== "duplicate" && value !== "decay") {
    throw new Error(`${fieldName} must be "duplicate" or "decay"`);
  }
}

function toArchiveScopeType(
  value: unknown,
  fieldName = "memory archive scope_type",
): string {
  if (value === "user" || value === "project") {
    return value;
  }
  throw new Error(`${fieldName} must be one of: user, project`);
}

function toArchiveKind(value: unknown): string {
  if (value === "decision" || value === "fact" || value === "summary") {
    return value;
  }
  throw new Error("memory archive kind must be one of: decision, summary, fact");
}

function toArchiveDurability(value: unknown): string {
  if (value === "ephemeral" || value === "durable" || value === "archived") {
    return value;
  }
  throw new Error(
    "memory archive durability must be one of: ephemeral, durable, archived",
  );
}

function assertObject(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertFunction(value: unknown, fieldName: string): void {
  if (typeof value !== "function") {
    throw new Error(`${fieldName} must be a function`);
  }
}

function assertPositiveSafeIntegerArray(
  value: unknown,
  fieldName: string,
): asserts value is number[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }
  for (const [index, item] of value.entries()) {
    if (
      typeof item !== "number" ||
      !Number.isSafeInteger(item) ||
      item <= 0
    ) {
      throw new Error(
        `${fieldName}[${index}] must be a positive safe integer`,
      );
    }
  }
}

function toNonBlankStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }
  const result: string[] = [];
  for (const [index, item] of value.entries()) {
    assertNonBlankText(item, `${fieldName}[${index}]`);
    result.push(item);
  }
  return result;
}

function assertRequiredNonBlankString(
  value: unknown,
  fieldName: string,
): string {
  assertNonBlankText(value, fieldName);
  return value;
}

function toNullableString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  throw new Error(`${fieldName} must be a string or null`);
}

function assertBoolean(value: unknown, fieldName: string): void {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean`);
  }
}

function assertPositiveSafeInteger(
  value: unknown,
  fieldName: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(`${fieldName} must be a positive safe integer`);
  }
}

function assertNonNegativeSafeInteger(
  value: unknown,
  fieldName: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(`${fieldName} must be a non-negative safe integer`);
  }
}

function assertValidDate(
  value: unknown,
  fieldName: string,
): asserts value is Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`${fieldName} must be a valid Date`);
  }
}

function assertOptionalPositiveSafeInteger(
  value: unknown,
  fieldName: string,
): void {
  if (value === undefined) {
    return;
  }
  assertPositiveSafeInteger(value, fieldName);
}

function assertOptionalFiniteNumber(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number when provided`);
  }
}

function assertOptionalString(value: unknown, fieldName: string): void {
  if (value === undefined || typeof value === "string") {
    return;
  }
  throw new Error(`${fieldName} must be a string when provided`);
}

function normalizeOptionalErrorMessage(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
