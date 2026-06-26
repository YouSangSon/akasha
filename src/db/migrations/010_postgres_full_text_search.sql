-- Full-text lexical search support for Postgres-backed memory retrieval.
-- `search_memory` still keeps an ILIKE fallback for exact paths, env vars,
-- and short code tokens, but normal prose terms can use this GIN index.

ALTER TABLE memory_records
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(content, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(summary, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(project_key, '')), 'D') ||
    setweight(to_tsvector('simple', coalesce(kind, '')), 'D')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_memory_records_search_vector
  ON memory_records USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_memory_records_org_scope_recent
  ON memory_records (organization_id, scope_type, scope_id, id DESC);
