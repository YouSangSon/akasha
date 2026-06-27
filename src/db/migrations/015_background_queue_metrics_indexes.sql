-- 015_background_queue_metrics_indexes: partial indexes for /metrics backlog gauges.
--
-- The /metrics background-queue gauges count pending/due/failed outbox rows on
-- every scrape. Keep those counts index-backed so a frequent scraper does not
-- turn into table-wide scans as historical ingest_jobs and memory_archive rows
-- grow.

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_qdrant_pending_status
  ON ingest_jobs (id)
  WHERE qdrant_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_qdrant_failed_status
  ON ingest_jobs (id)
  WHERE qdrant_status = 'failed';

CREATE INDEX IF NOT EXISTS idx_memory_archive_qdrant_pending_status
  ON memory_archive (id)
  WHERE qdrant_status = 'pending'
    AND array_length(qdrant_point_ids, 1) > 0;

CREATE INDEX IF NOT EXISTS idx_memory_archive_qdrant_failed_status
  ON memory_archive (id)
  WHERE qdrant_status = 'failed'
    AND array_length(qdrant_point_ids, 1) > 0;
