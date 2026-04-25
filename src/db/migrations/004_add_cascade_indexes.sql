-- Cascade-delete performance indexes.
--
-- memory_records has ON DELETE CASCADE incoming from three tables. Without
-- indexes on the FK columns, every parent delete forces Postgres to do a
-- sequential scan of the child table to find rows to remove. P17's
-- compaction apply path will delete records in the hundreds-to-thousands
-- range; without these indexes the cascade is the dominant cost.
--
-- Idempotent (IF NOT EXISTS). Adding indexes to small tables is fast; the
-- locks are brief because no FK rewrites are involved. Safe to run on a
-- populated database during normal traffic.

CREATE INDEX IF NOT EXISTS idx_relationships_from_memory_record
  ON relationships (from_memory_record_id);

CREATE INDEX IF NOT EXISTS idx_relationships_to_memory_record
  ON relationships (to_memory_record_id);

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_memory_record
  ON ingest_jobs (memory_record_id);
