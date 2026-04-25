-- P19.1: extend memory_archive for the unarchive recovery flow.
--
-- source_id    - loose reference to sources.id captured at archive time so
--                unarchive can re-link the resurrected memory_records row
--                to its original source. No FK because sources may be
--                cleaned up by an unrelated retention sweep.
-- unarchived_at- nullable timestamp; set by the unarchive orchestrator
--                when an archive row is restored. Lets ops query "which
--                archived records were resurrected and when" for audit.
--
-- Both nullable so existing archive rows from P17 (no source_id captured)
-- survive the migration. New rows from P19.1+ will have source_id
-- populated by the updated applyCompactionRecord CTE.

ALTER TABLE memory_archive
  ADD COLUMN IF NOT EXISTS source_id BIGINT;

ALTER TABLE memory_archive
  ADD COLUMN IF NOT EXISTS unarchived_at TIMESTAMPTZ;

-- Index supports "show me everything archived in the last hour that has
-- NOT been unarchived" — typical post-incident triage.
CREATE INDEX IF NOT EXISTS idx_memory_archive_unarchived_pending
  ON memory_archive (organization_id, archived_at DESC)
  WHERE unarchived_at IS NULL;
