-- PERF-6: bare memory_record_id predicate (cascade delete path) cannot use
-- the composite (organization_id, memory_record_id) index from migration 004.
-- A single-column index on memory_record_id fixes the seq-scan on that path.
CREATE INDEX IF NOT EXISTS idx_memory_chunks_record ON memory_chunks(memory_record_id);
