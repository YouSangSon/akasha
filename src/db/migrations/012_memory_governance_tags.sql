-- Governance tags for canonical memory records.
-- Tags remain org-scoped, follow the memory row lifecycle, and support
-- filtered governance queries without changing existing retrieval paths.

CREATE TABLE IF NOT EXISTS memory_tags (
  memory_record_id BIGINT       NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
  organization_id  TEXT         NOT NULL,
  tag              TEXT         NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (memory_record_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_memory_tags_org_tag_record
  ON memory_tags (organization_id, tag, memory_record_id);

CREATE INDEX IF NOT EXISTS idx_memory_tags_org_record
  ON memory_tags (organization_id, memory_record_id);
