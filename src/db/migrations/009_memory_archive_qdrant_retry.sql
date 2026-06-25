-- Archive cleanup retry visibility for compaction Qdrant/vector cleanup.
--
-- qdrant_next_retry_at doubles as the due timestamp and claim visibility
-- timeout. A sweeper claim pushes the timestamp into the near future; success
-- clears it via qdrant_status='deleted', failure reschedules or marks failed.

ALTER TABLE memory_archive
  ADD COLUMN IF NOT EXISTS qdrant_next_retry_at TIMESTAMPTZ;

UPDATE memory_archive
SET qdrant_next_retry_at = archived_at
WHERE qdrant_status = 'pending'
  AND qdrant_next_retry_at IS NULL
  AND array_length(qdrant_point_ids, 1) > 0;

DROP INDEX IF EXISTS idx_memory_archive_qdrant_pending;

CREATE INDEX IF NOT EXISTS idx_memory_archive_qdrant_pending_retry
  ON memory_archive (qdrant_next_retry_at, archived_at)
  WHERE qdrant_status = 'pending'
    AND qdrant_next_retry_at IS NOT NULL
    AND array_length(qdrant_point_ids, 1) > 0;
