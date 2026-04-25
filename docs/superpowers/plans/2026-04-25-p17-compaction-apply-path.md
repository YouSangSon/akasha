# P17 — Compaction v2 Apply Path

**Status:** Design (ready for implementation)
**Date:** 2026-04-25
**Prerequisites:** P16.5 (commit `24c8f8f`) — auth fail-closed, HTTP body validation, org isolation in `getMemoryRecordsByIds`, FK cascade indexes.
**Successor:** P18 — semantic dedup (replace string-equality clustering with embedding-cosine), and unarchive flow (recovery from `memory_archive`).

This is the synthesis of a 5-agent design review (architect / database / typescript / tdd / security). Three architectural conflicts were resolved against the multi-agent recommendation, not the loudest single opinion. Where this document and any single agent's report disagree, this document is canonical.

---

## 1. Scope

Turn the dry-run plan returned by `compact_memory` into actual mutations:

- Archive duplicate-group members into `memory_archive` (keep one, archive the rest).
- Archive decay candidates whose score is below threshold.
- Hard-delete the canonical `memory_records` row + cascading children after archive write succeeds.
- Hard-delete the matching Qdrant points after Postgres archive commits.

**Out of scope for P17:** semantic near-duplicate detection (P18), promotion-apply (the `promotionCandidates` field stays advisory), unarchive recovery (P18), retention sweeps on `memory_archive` (P19+), Naver HyperClova embedding adapter.

---

## 2. Resolved architectural decisions

The agent reports diverged on three points. Decisions below are the canonical version for P17.

### 2.1 Hard-delete from canonical, separate `memory_archive` table

The TS reviewer proposed soft-archive (flip `durability='archived'` on the existing `memory_records` row, no separate table). Architect and DB-reviewer recommended a separate archive table. **Decision: separate table.**

Reasons:
- Retention windows on archive vs canonical may differ (180-day archive retention, indefinite canonical retention).
- Compliance / GDPR / forensics queries scan archive only — easier with a dedicated table.
- Bulk truncation of canonical for performance is independent of archive lifecycle.
- The "soft-archive" model conflates "archived" with "still searchable" because the row is still in the same table; correct behavior requires `WHERE durability != 'archived'` in every search — easy to forget, hard to verify.

### 2.2 Same tool, `dryRun=false` triggers apply

Security recommended a separate `compact_apply` tool with a `planId` flow (two-phase commit at the API). **Decision: keep one tool; `dryRun: false` is the apply trigger; server-generated `compactionRunId` provides idempotency + replay defense.**

Reasons:
- Plan and apply share 90% of input (scope, projectKey, organizationId, decay knobs). Splitting forces callers to reconstruct identical context twice.
- The dry-run is a pure function of the current PG state — re-detecting at apply time is *correct* (don't apply stale plans) and avoids server-side plan persistence.
- Audit log already keys by tool name; `compact_memory` with `dryRun=false` produces one auditable destructive event.
- Replay defense comes from the idempotency UNIQUE key on `memory_archive`, not from a second API.

### 2.3 Single archive table with embedded outbox status

Architect proposed three tables (`memory_archive` + `memory_archive_chunks` + `compaction_apply_outbox`). DB-reviewer proposed two (`compaction_runs` + `memory_archive` with `qdrant_point_ids[]` and `qdrant_cleaned_at`). **Decision: two tables — `compaction_runs` + `memory_archive` (the latter carries `qdrant_point_ids` array and `qdrant_status` column).** The outbox responsibility lives inside `memory_archive`; no third table.

Reasons:
- The outbox's only job is "tell the sweeper which Qdrant deletes are still pending after PG commit." A column on `memory_archive` does that without an extra join.
- `memory_archive_chunks` (Architect's third table) is unnecessary — the array `qdrant_point_ids TEXT[]` directly captures what the sweeper needs, and chunk content is regenerable from `memory_archive.content` if unarchive ever needs it (P18).
- Fewer moving parts; `WHERE qdrant_status='pending'` is a single-table partial-index query.

---

## 3. Migration 005 — schema

```sql
-- src/db/migrations/005_add_compaction_archive.sql
--
-- Compaction v2: archive table + run tracking. The dry-run plan returned by
-- compact_memory becomes a real mutation when dryRun=false. Records flow
-- canonical → archive → (Qdrant cleanup async).

CREATE TABLE IF NOT EXISTS compaction_runs (
  id              BIGSERIAL    PRIMARY KEY,
  organization_id TEXT         NOT NULL,
  actor           TEXT         NOT NULL,
  scope_type      TEXT         NOT NULL,
  scope_id        TEXT         NOT NULL,
  dry_run         BOOLEAN      NOT NULL,
  status          TEXT         NOT NULL,        -- pending | completed | failed
  archived_count  INTEGER      NOT NULL DEFAULT 0,
  duplicate_count INTEGER      NOT NULL DEFAULT 0,
  decay_count     INTEGER      NOT NULL DEFAULT 0,
  qdrant_failed   INTEGER      NOT NULL DEFAULT 0,
  error_message   TEXT,
  plan_generated_at TIMESTAMPTZ NOT NULL,         -- TOCTOU anchor (§7)
  started_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  -- Idempotency: caller can re-issue the same logical run; server treats the
  -- second call as a read of the first one's outcome. Apply path generates
  -- this UUID server-side; callers cannot supply it (replay defense).
  idempotency_key UUID         NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_compaction_runs_org_recent
  ON compaction_runs (organization_id, started_at DESC);

CREATE TABLE IF NOT EXISTS memory_archive (
  id                BIGSERIAL    PRIMARY KEY,
  compaction_run_id BIGINT       NOT NULL REFERENCES compaction_runs(id),
  organization_id   TEXT         NOT NULL,         -- copied from canonical, NOT from caller token
  source_record_id  BIGINT       NOT NULL,         -- former memory_records.id
  archive_reason    TEXT         NOT NULL CHECK (archive_reason IN ('duplicate','decay')),
  scope_type        TEXT         NOT NULL,
  scope_id          TEXT         NOT NULL,
  project_key       TEXT,
  kind              TEXT         NOT NULL,
  title             TEXT,
  content           TEXT         NOT NULL,
  summary           TEXT,
  durability        TEXT         NOT NULL,
  importance        INTEGER      NOT NULL,
  -- Reason-specific structured detail.
  decay_score       NUMERIC(8,6),                  -- when reason='decay'
  kept_record_id    BIGINT,                        -- when reason='duplicate'
  -- Qdrant cleanup metadata (outbox responsibility lives here, §2.3).
  qdrant_point_ids  TEXT[]       NOT NULL DEFAULT '{}',
  qdrant_status     TEXT         NOT NULL DEFAULT 'pending'
                    CHECK (qdrant_status IN ('pending','deleted','failed')),
  qdrant_attempt_count INTEGER   NOT NULL DEFAULT 0,
  qdrant_last_error TEXT,
  qdrant_cleaned_at TIMESTAMPTZ,
  -- Original timestamps preserved for forensics.
  original_created_at  TIMESTAMPTZ NOT NULL,
  original_updated_at  TIMESTAMPTZ NOT NULL,
  archived_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Idempotency at the row level: re-running the same compaction run for the
  -- same source record is a no-op (ON CONFLICT DO NOTHING in the apply SQL).
  UNIQUE (compaction_run_id, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_archive_org_recent
  ON memory_archive (organization_id, archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_archive_run
  ON memory_archive (compaction_run_id);

-- Sweeper queries this partial index — pending rows only.
CREATE INDEX IF NOT EXISTS idx_memory_archive_qdrant_pending
  ON memory_archive (archived_at)
  WHERE qdrant_status = 'pending' AND array_length(qdrant_point_ids, 1) > 0;

-- For point-id reconciliation lookups (rare, but useful for ops).
CREATE INDEX IF NOT EXISTS idx_memory_archive_qdrant_point_ids
  ON memory_archive USING GIN (qdrant_point_ids);

-- audit_log: add structured detail for destructive operations. Block-list
-- item #2 from P17 review. Nullable so existing rows survive the migration.
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS metadata JSONB;
```

**Migration safety:** all `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. The `ALTER TABLE … ADD COLUMN IF NOT EXISTS metadata JSONB` is non-blocking on Postgres — no rewrite, just catalog update. Safe under live traffic.

---

## 4. Apply algorithm

### 4.1 Per-record primitive

All plan items reduce to one operation: archive one `(memory_record_id, organization_id)` for a reason. The orchestrator iterates over the deduplicated set of `(id, reason)` pairs.

### 4.2 Ordering — archive-first, Qdrant-last (3-agent consensus)

```
Per record:
  1. PG TX BEGIN
  2. Capture qdrant_point_ids (subquery on memory_chunks)
  3. INSERT INTO memory_archive (... qdrant_point_ids, qdrant_status='pending')
       ON CONFLICT (compaction_run_id, source_record_id) DO NOTHING
  4. DELETE FROM memory_records WHERE id=$1 AND organization_id=$org
       RETURNING id  -- 0 rows = aborted (F7 / F8 / TOCTOU); skip Qdrant
  5. PG TX COMMIT
  6. Qdrant client.delete(collectionName, { points: qdrant_point_ids })
  7. UPDATE memory_archive SET qdrant_status='deleted', qdrant_cleaned_at=now()
```

**Why this order:** if the process dies after step 5 but before step 6, the canonical row is gone, archive is durable, Qdrant has a harmless orphan vector. The retrieve path (`src/search/retrieve-memory.ts:74`) hydrates from PG by id, so an orphan Qdrant point yields an empty PG result and is dropped. The reverse order (Qdrant-first) would produce live `memory_records` rows whose chunks reference dead Qdrant points — a user-visible "search hit vanishes" bug.

### 4.3 Single-row CTE form (DB-reviewer's optimization)

For batched per-org runs, the inner archive write + delete can run as one CTE statement:

```sql
WITH deleted AS (
  DELETE FROM memory_records
  WHERE id = $record_id
    AND organization_id = $org
    AND updated_at <= $plan_generated_at  -- TOCTOU guard, §7
  RETURNING id, organization_id, scope_type, scope_id, project_key, kind,
            title, content, summary, durability, importance,
            created_at, updated_at, source_id
)
INSERT INTO memory_archive (
  compaction_run_id, organization_id, source_record_id, archive_reason,
  scope_type, scope_id, project_key, kind, title, content, summary,
  durability, importance, decay_score, kept_record_id, qdrant_point_ids,
  original_created_at, original_updated_at
)
SELECT
  $run_id, d.organization_id, d.id, $reason,
  d.scope_type, d.scope_id, d.project_key, d.kind, d.title, d.content, d.summary,
  d.durability, d.importance, $decay_score, $kept_record_id,
  COALESCE((SELECT array_agg(qdrant_point_id)
            FROM memory_chunks
            WHERE memory_record_id = d.id AND qdrant_point_id IS NOT NULL),
           '{}'),
  d.created_at, d.updated_at
FROM deleted d
ON CONFLICT (compaction_run_id, source_record_id) DO NOTHING
RETURNING id, qdrant_point_ids;
```

The `RETURNING qdrant_point_ids` lets the orchestrator fan out to Qdrant immediately after commit without a second SELECT.

### 4.4 Sequential, not parallel

Qdrant deletes run sequentially (`for…of`), not `Promise.all`. Architect estimated ~10 concurrent deletes is the safe upper bound under default Qdrant configs; the simpler approach is "one at a time" until a real bottleneck is measured. PG transactions are also one-at-a-time — within a single apply call.

---

## 5. Concurrency

PG advisory lock per `(organization_id, scope_type, scope_id)` acquired at the apply call's outermost transaction:

```sql
SELECT pg_try_advisory_xact_lock(
  hashtext($org || ':' || $scope_type || ':' || $scope_id)
);
```

If `false`, return `compaction_already_running` (HTTP 429). The lock auto-releases on transaction end. Two simultaneous apply calls on the same scope would race on the canonical DELETE; the lock makes one win cleanly.

Normal `add_memory` writes are unaffected — they insert new rows (different ids, no lock contention). `reindex_memory` operates on surviving chunks; it ignores rows that vanished mid-scan.

---

## 6. Idempotency

Two layers:

1. **Run-level:** `compaction_runs.idempotency_key` UNIQUE — server generates a UUID per `dryRun=false` call, inserts the run with `ON CONFLICT (idempotency_key) DO NOTHING`. If the row exists with `status='completed'`, the apply call returns the prior result (read-through cache). Replay defense: an attacker who captures and replays a request hits the same UUID, gets the same response, no second destructive run.

2. **Record-level:** `memory_archive (compaction_run_id, source_record_id)` UNIQUE. If a partial failure leaves some records archived but not all, retrying the same run continues from where it stopped — already-archived records get `ON CONFLICT DO NOTHING`, never inserted twice.

---

## 7. TOCTOU guard

Between dry-run plan generation and apply, a record may have been updated (importance bumped, content changed). The apply DELETE includes `AND updated_at <= $plan_generated_at`. If a record was modified after the plan, the DELETE returns 0 rows and the archive insert sees no `RETURNING` payload — record skipped, run continues.

`plan_generated_at` is captured at the start of the apply call (after the `listMemory` read, before the per-record loop) and stored in `compaction_runs.plan_generated_at`. The orchestrator passes it to every apply statement.

---

## 8. Multi-tenancy

Every SQL statement in the apply path **must** include `organization_id = $org` in WHERE. The plan-generation path (`listMemory`) already filters by org since P5-P8. The apply path re-asserts the org boundary at delete time — does not trust the plan.

The `organization_id` written into `memory_archive` is read from the canonical record itself (RETURNING d.organization_id from the CTE), not from the caller token. This protects against the edge case where a token's bound org somehow disagrees with a record's org (would be a P5-P8 invariant violation, but defense-in-depth is cheap).

---

## 9. Audit integration

Two audit rows per apply call:

1. **Boundary row** (existing `instrument()` wrapper at `src/mcp/server.ts:597-617`): `tool='compact_memory'`, `outcome='success'|'error'`, `duration_ms`, `request_id`. Unchanged.

2. **Domain row** (new): `tool='compact_memory.apply'`, with `metadata` JSONB:

```ts
{
  compactionRunId: string,
  scopeType: 'project' | 'user',
  scopeId: string,
  archivedRecordIds: number[],   // truncated to first 1000; full count in archived_count
  archivedRecordCount: number,
  duplicateCount: number,
  decayCount: number,
  qdrantPointsDeleted: number,
  supersededCount: number,         // TOCTOU skips
  reasonBreakdown: { duplicate: number, decay: number },
  decayConfig: { halfLifeDays: number, threshold: number },
  planGeneratedAt: string,         // ISO timestamp, e.g. "2026-04-25T00:00:00.000Z"
}
```

Both rows link via `request_id`. Future destructive tools (e.g., `unarchive_memory` in P18) reuse the same two-row pattern.

---

## 10. Sweeper

A small periodic worker (default 30s interval, configurable) scans:

```sql
SELECT id, qdrant_point_ids, organization_id
FROM memory_archive
WHERE qdrant_status = 'pending'
  AND archived_at < now() - interval '60 seconds'
ORDER BY archived_at
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

For each row, call Qdrant `delete({ points })`, then `UPDATE memory_archive SET qdrant_status='deleted', qdrant_cleaned_at=now()`. On Qdrant error, increment `qdrant_attempt_count`, store `qdrant_last_error`; after N failures (default 5), set `qdrant_status='failed'` for ops review.

Behind a feature flag `compactionSweepEnabled` so ops can disable in case of bugs. `FOR UPDATE SKIP LOCKED` makes the sweeper safe under multi-replica deploys without leader election.

---

## 11. API surface

### 11.1 `compact_memory` tool input — additive fields

```ts
type CompactMemoryToolInput = {
  organizationId?: string;
  projectKey?: string;
  scope?: 'project' | 'user';
  userScopeId?: string;
  dryRun?: boolean;          // default true; strict-boolean-validated since P16.5
  limit?: number;
  decayThreshold?: number;
  halfLifeDays?: number;
  // NEW in P17 — all optional, all server-side-bounded:
  apply?: {
    maxRecordsPerRun?: number;       // hard cap, default 500
    abortOnSweepBacklog?: number;    // refuse if pending outbox > N (default 1000)
  };
};
```

`compactionRunId` is **server-generated**, never accepted from caller (replay defense).

### 11.2 `compact_memory` tool output — when `dryRun=false`

```ts
{
  ok: true,
  dryRun: false,
  compactionRunId: string,
  archivedIds: string[],
  duplicateGroups: [...],         // same shape, included for observability
  decayCandidates: [...],         // same
  applyStats: {
    archived: number,
    skipped: number,
    qdrantPointsDeleted: number,
    qdrantPointsPending: number,  // sweeper backlog from this run
    durationMs: number,
  },
  summary: string,
}
```

HTTP envelope (`{ success, data, error }`) wraps the tool result unchanged.

---

## 12. Build sequence

| Step | Work | Verification |
|------|------|--------------|
| **0** | Extract `compact_memory` handler from `src/mcp/server.ts:476-565` to `src/compact/compact-memory.ts` (no behavior change, dry-run only) | All existing dry-run tests still green; new unit test on the extracted function |
| **1** | Migration 005 (§3) + `audit_log.metadata JSONB` | `npm run migrate` up/down clean; `\d memory_archive` matches spec |
| **2** | `MemoryArchiveRepository` (Repository Pattern, sibling to `CanonicalMemoryRepository`) | Unit tests on each method; PG integration tests behind the existing skip-without-PG harness |
| **3** | `applyCompaction(plan, deps)` orchestrator: per-record CTE, advisory lock, TOCTOU, idempotency | Vitest unit tests with mocked deps (TDD plan §2-§5); 90% line / 85% branch coverage |
| **4** | Sweeper: `runOutboxSweep(pg, qdrant)` | Fault-injection test forces F3-F5; sweeper reconciles |
| **5** | Wire into `compact_memory` tool (`dryRun=false` branch); domain audit row | MCP + HTTP integration tests |
| **6** | Stricter rate limit on apply path: 1 apply per hour per `(token, org)` | Test with rate-limit clock injection |
| **7** | Multi-tenancy + idempotency + partial-failure tests | All green; org-A apply leaves org-B untouched, asserted at every layer |

Each step ends with a checkpoint that should pass before moving on. Steps 0-2 ship without behavior change (dry-run-only output unchanged). Step 5 is the destructive cutover.

---

## 13. Test pyramid

| Layer | Location | Coverage target |
|-------|----------|-----------------|
| Unit (mocked deps) | `tests/compact/compact-memory.test.ts` | 90% line / 85% branch on the orchestrator |
| Repository (PG, skip-without-PG) | `tests/store/memory-archive-repository.test.ts` | All CRUD methods + idempotency UNIQUE constraint behavior |
| MCP tool seam | `tests/mcp/server.test.ts` (extend) | `dryRun=false` path returns archived IDs and stats |
| HTTP route seam | `tests/app/server.test.ts` (extend) | `POST /v1/memory/compact` with `dryRun:false` returns expected envelope; bearer + org-binding flows continue to work |
| End-to-end multi-tenancy | `tests/e2e/compaction-multitenancy.test.ts` | Org A apply leaves org B intact (PG count + Qdrant count both unchanged for B) |

The 3 currently-skipped PG-dependent test files remain skipped without local Postgres — same status as today. P17 does not depend on un-skipping them, but doing so under testcontainers is a natural follow-up PR.

---

## 14. Block-list reminder (closed by P16.5)

These were CRITICAL blockers identified in the multi-agent review. Already addressed in commit `24c8f8f`:

- ✅ HTTP body validation (`dryRun: "false"` → 400)
- ✅ `getMemoryRecordsByIds` org filter (defense-in-depth at hydration)
- ✅ Auth fail-closed when binding non-loopback without tokens
- ✅ FK cascade indexes (P17 apply will delete in the hundreds-to-thousands)

The 5th block-list item (`audit_log.metadata`) ships as part of Migration 005 in this PR.

---

## 15. Open questions (defer or low conviction)

- **Sweeper deployment topology:** `FOR UPDATE SKIP LOCKED` makes multi-replica sweeping safe, but a single-replica deploy can use simple `setInterval`. Pick when actually deploying multi-replica.
- **Source row cleanup:** when the *last* `memory_records` referencing a `sources` row is archived, does the source row also get archived? Default: no — sources are cheap and shared. Revisit during P19 retention work.
- **Promotion-apply:** `promotionCandidates` continues to surface as advisory. P18 picks up either promotion-apply or unarchive — not both.

---

## References

- Multi-agent review of 2026-04-25 (architect / database / typescript / tdd / security)
- Commit `8a0c1c0` — P1-P16 hardening (HTTP API, multi-tenancy, audit, eval, ops readiness)
- Commit `24c8f8f` — P16.5 block-list closure (this PR's prerequisite)
- `src/mcp/server.ts:526-564` — current dry-run inline implementation (orchestrator extraction starts here)
- `src/compact/decay-score.ts`, `src/compact/detect-duplicates.ts` — pure plan helpers (unchanged)
