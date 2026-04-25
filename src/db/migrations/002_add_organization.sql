-- Adds organization_id to every record-bearing table for multi-tenancy
-- (e.g. dev team vs finance team isolation). All existing rows default to
-- 'default' so the migration is safe to apply on a populated database.
--
-- Idempotent via ADD COLUMN IF NOT EXISTS (Postgres 9.6+).

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE memory_records
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE memory_chunks
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE ingest_jobs
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE context_pack_runs
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'default';

-- Indexes scoped by organization for fast filtered reads.
CREATE INDEX IF NOT EXISTS idx_memory_records_org_scope
  ON memory_records (organization_id, scope_type, scope_id);

CREATE INDEX IF NOT EXISTS idx_memory_records_org_project
  ON memory_records (organization_id, project_key)
  WHERE project_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sources_org_scope
  ON sources (organization_id, scope_type, scope_id);

CREATE INDEX IF NOT EXISTS idx_memory_chunks_org_record
  ON memory_chunks (organization_id, memory_record_id);
