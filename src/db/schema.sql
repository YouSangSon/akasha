PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT,
  uri TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (scope_type, scope_id, source_type, external_id)
);

CREATE TABLE IF NOT EXISTS memory_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  memory_type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS context_pack_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_sources_scope
  ON sources(scope_type, scope_id);

CREATE INDEX IF NOT EXISTS idx_memory_records_scope
  ON memory_records(scope_type, scope_id);

CREATE INDEX IF NOT EXISTS idx_memory_records_source_id
  ON memory_records(source_id);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_records_fts
USING fts5(
  content,
  content = 'memory_records',
  content_rowid = 'id'
);

CREATE TRIGGER IF NOT EXISTS memory_records_ai
AFTER INSERT ON memory_records
BEGIN
  INSERT INTO memory_records_fts(rowid, content)
  VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS memory_records_ad
AFTER DELETE ON memory_records
BEGIN
  INSERT INTO memory_records_fts(memory_records_fts, rowid, content)
  VALUES ('delete', old.id, old.content);
END;

CREATE TRIGGER IF NOT EXISTS memory_records_au
AFTER UPDATE ON memory_records
BEGIN
  INSERT INTO memory_records_fts(memory_records_fts, rowid, content)
  VALUES ('delete', old.id, old.content);
  INSERT INTO memory_records_fts(rowid, content)
  VALUES (new.id, new.content);
END;
