import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import type { PgPool } from "./connection.js";

const dbDir = path.dirname(fileURLToPath(import.meta.url));
const sqliteSchemaPath = path.join(dbDir, "schema.sql");
const postgresMigrationsDir = path.join(dbDir, "migrations");

const embeddedSchemaSql = `PRAGMA foreign_keys = ON;

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
`;

export type ReadSchemaSqlOptions = {
  readFile?: typeof fs.readFileSync;
  schemaFilePath?: string;
};

export function readSchemaSql(
  options: ReadSchemaSqlOptions = {},
): string {
  const readFile = options.readFile ?? fs.readFileSync;
  const targetPath = options.schemaFilePath ?? sqliteSchemaPath;

  try {
    return readFile(targetPath, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return embeddedSchemaSql;
    }

    throw error;
  }
}

function isPgPool(target: Database.Database | PgPool): target is PgPool {
  return "query" in target;
}

function runSqliteMigrations(db: Database.Database) {
  const schemaSql = readSchemaSql();
  db.exec(schemaSql);
  db.exec(`
    INSERT INTO memory_records_fts(memory_records_fts)
    VALUES ('rebuild');
  `);
}

async function runPostgresMigrations(pool: PgPool): Promise<void> {
  const migrationPath = path.join(postgresMigrationsDir, "001_initial.sql");
  const sql = await fs.promises.readFile(migrationPath, "utf8");

  await pool.query(sql);
}

export function runMigrations(db: Database.Database): void;
export function runMigrations(pool: PgPool): Promise<void>;
export function runMigrations(
  target: Database.Database | PgPool,
): void | Promise<void> {
  if (isPgPool(target)) {
    return runPostgresMigrations(target);
  }

  runSqliteMigrations(target);
}
