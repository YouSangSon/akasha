-- P17 Compaction v2 apply path. Two new tables + audit_log.metadata column.
--
-- compaction_runs    - one row per dryRun=false call. Idempotency anchor
--                      (UUID UNIQUE) and run-level outcome counters.
-- memory_archive     - one row per archived record. Carries qdrant_point_ids
--                      so the sweeper can finish vector cleanup async.
-- audit_log.metadata - JSONB for structured destructive-op audit payloads.
--
-- All idempotent; safe to run on a populated database under live traffic.

CREATE TABLE IF NOT EXISTS compaction_runs (
  id                 BIGSERIAL    PRIMARY KEY,
  organization_id    TEXT         NOT NULL,
  actor              TEXT         NOT NULL,
  scope_type         TEXT         NOT NULL,
  scope_id           TEXT         NOT NULL,
  dry_run            BOOLEAN      NOT NULL,
  status             TEXT         NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','completed','failed')),
  archived_count     INTEGER      NOT NULL DEFAULT 0,
  duplicate_count    INTEGER      NOT NULL DEFAULT 0,
  decay_count        INTEGER      NOT NULL DEFAULT 0,
  qdrant_failed      INTEGER      NOT NULL DEFAULT 0,
  error_message      TEXT,
  plan_generated_at  TIMESTAMPTZ  NOT NULL,
  started_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ,
  -- Server-generated UUID per dryRun=false call. Replay defense: caller
  -- cannot supply this — apply path generates it. Re-issuing the same
  -- request hits the existing row, returns the prior outcome.
  idempotency_key    UUID         NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_compaction_runs_org_recent
  ON compaction_runs (organization_id, started_at DESC);

CREATE TABLE IF NOT EXISTS memory_archive (
  id                    BIGSERIAL    PRIMARY KEY,
  compaction_run_id     BIGINT       NOT NULL REFERENCES compaction_runs(id),
  organization_id       TEXT         NOT NULL,
  source_record_id      BIGINT       NOT NULL,
  archive_reason        TEXT         NOT NULL
                        CHECK (archive_reason IN ('duplicate','decay')),
  scope_type            TEXT         NOT NULL,
  scope_id              TEXT         NOT NULL,
  project_key           TEXT,
  kind                  TEXT         NOT NULL,
  title                 TEXT,
  content               TEXT         NOT NULL,
  summary               TEXT,
  durability            TEXT         NOT NULL,
  importance            INTEGER      NOT NULL,
  decay_score           NUMERIC(8,6),
  kept_record_id        BIGINT,
  qdrant_point_ids      TEXT[]       NOT NULL DEFAULT '{}',
  qdrant_status         TEXT         NOT NULL DEFAULT 'pending'
                        CHECK (qdrant_status IN ('pending','deleted','failed')),
  qdrant_attempt_count  INTEGER      NOT NULL DEFAULT 0,
  qdrant_last_error     TEXT,
  qdrant_cleaned_at     TIMESTAMPTZ,
  original_created_at   TIMESTAMPTZ  NOT NULL,
  original_updated_at   TIMESTAMPTZ  NOT NULL,
  archived_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Re-running the same compaction run for the same source record is a
  -- no-op (ON CONFLICT DO NOTHING in apply SQL).
  UNIQUE (compaction_run_id, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_archive_org_recent
  ON memory_archive (organization_id, archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_archive_run
  ON memory_archive (compaction_run_id);

-- Sweeper queries this partial index — pending Qdrant cleanups only.
CREATE INDEX IF NOT EXISTS idx_memory_archive_qdrant_pending
  ON memory_archive (archived_at)
  WHERE qdrant_status = 'pending' AND array_length(qdrant_point_ids, 1) > 0;

-- audit_log: structured detail for destructive operations.
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS metadata JSONB;
