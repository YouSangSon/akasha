-- P-F2-followup: Outbox columns on ingest_jobs for the qdrant-write retry
-- sweeper.
--
-- Purpose: writeCanonicalMemory's PG-INSERT/embed/Qdrant-upsert pipeline can
-- partially fail (Qdrant 5xx, network blip, OpenAI rate-limit), and the
-- existing catch block (PR #7, audit option A) hard-deletes the memory_records
-- row to keep PG state consistent. That covers the in-process failure path,
-- but a process crash mid-cleanup leaves an orphan PG row the sweeper can
-- reconcile.
--
-- This migration adds the outbox columns the audit's option B sweeper needs.
-- Default values (qdrant_status='pending', qdrant_attempts=0, retry timestamp
-- NULL) make the migration safe to apply on a populated database under live
-- traffic — existing rows look "pending with no retry scheduled", and the
-- sweeper will not pick them up unless qdrant_next_retry_at is both non-null
-- and in the past. Wiring the catch block to set those values is a separate
-- PR (intentionally — this migration is no-op for behavior until that wiring
-- lands).
--
-- Idempotent via ADD COLUMN IF NOT EXISTS (Postgres 9.6+) and CREATE INDEX
-- IF NOT EXISTS.

ALTER TABLE ingest_jobs
  ADD COLUMN IF NOT EXISTS qdrant_status TEXT NOT NULL DEFAULT 'pending'
                           CHECK (qdrant_status IN ('pending','completed','failed'));

ALTER TABLE ingest_jobs
  ADD COLUMN IF NOT EXISTS qdrant_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE ingest_jobs
  ADD COLUMN IF NOT EXISTS qdrant_next_retry_at TIMESTAMPTZ;

ALTER TABLE ingest_jobs
  ADD COLUMN IF NOT EXISTS qdrant_last_error TEXT;

-- Partial index for the sweeper's polling query. Only rows that are
-- pending AND have a retry timestamp scheduled are candidates — the index
-- stays narrow even when ingest_jobs grows large. Sweeper query shape:
--
--   SELECT id, memory_record_id, qdrant_attempts
--   FROM ingest_jobs
--   WHERE qdrant_status = 'pending'
--     AND qdrant_next_retry_at IS NOT NULL
--     AND qdrant_next_retry_at <= NOW()
--   ORDER BY qdrant_next_retry_at ASC
--   LIMIT $batch_size
--   FOR UPDATE SKIP LOCKED;
--
-- The FOR UPDATE SKIP LOCKED clause lets multiple sweeper replicas
-- coexist without picking up the same row.
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_qdrant_pending_retry
  ON ingest_jobs (qdrant_next_retry_at)
  WHERE qdrant_status = 'pending'
    AND qdrant_next_retry_at IS NOT NULL;
