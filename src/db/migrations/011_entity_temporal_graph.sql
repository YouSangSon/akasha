-- Persistent entity and temporal graph foundation.
-- Entity mentions are extracted at write time and can be used by lexical
-- retrieval to rescue exact symbols, paths, URLs, dates, and named concepts.

CREATE TABLE IF NOT EXISTS entities (
  id              BIGSERIAL    PRIMARY KEY,
  organization_id TEXT         NOT NULL,
  kind            TEXT         NOT NULL,
  normalized      TEXT         NOT NULL,
  display_text    TEXT         NOT NULL,
  first_seen_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, kind, normalized)
);

CREATE INDEX IF NOT EXISTS idx_entities_org_kind_normalized
  ON entities (organization_id, kind, normalized);

CREATE TABLE IF NOT EXISTS memory_entity_mentions (
  memory_record_id BIGINT       NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
  entity_id        BIGINT       NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  organization_id  TEXT         NOT NULL,
  mention_text     TEXT         NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (memory_record_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_entity_mentions_entity
  ON memory_entity_mentions (organization_id, entity_id, memory_record_id);

CREATE INDEX IF NOT EXISTS idx_memory_entity_mentions_memory
  ON memory_entity_mentions (organization_id, memory_record_id);

CREATE TABLE IF NOT EXISTS entity_relationships (
  id                         BIGSERIAL    PRIMARY KEY,
  organization_id            TEXT         NOT NULL,
  from_entity_id             BIGINT       NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_entity_id               BIGINT       NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type              TEXT         NOT NULL,
  evidence_memory_record_id  BIGINT       NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
  valid_from                 DATE,
  valid_to                   DATE,
  confidence                 NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  created_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (
    organization_id,
    from_entity_id,
    to_entity_id,
    relation_type,
    evidence_memory_record_id
  )
);

CREATE INDEX IF NOT EXISTS idx_entity_relationships_from
  ON entity_relationships (organization_id, from_entity_id, relation_type);

CREATE INDEX IF NOT EXISTS idx_entity_relationships_to
  ON entity_relationships (organization_id, to_entity_id, relation_type);

CREATE INDEX IF NOT EXISTS idx_entity_relationships_temporal
  ON entity_relationships (organization_id, valid_from)
  WHERE valid_from IS NOT NULL;
