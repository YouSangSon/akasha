import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPgPool, type PgPool } from "./connection.js";

const dbDir = path.dirname(fileURLToPath(import.meta.url));

// Migrations apply in this order. New migrations append to the array. The
// runner concatenates the SQL and submits it as one query — Postgres
// supports multi-statement bodies. Each migration is idempotent (CREATE
// TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS) so re-running on an
// already-migrated database is a no-op.
const MIGRATION_FILES = [
  "001_initial.sql",
  "002_add_organization.sql",
  "003_add_audit_log.sql",
  "004_add_cascade_indexes.sql",
  "005_add_compaction_archive.sql",
  "006_add_archive_unarchive.sql",
  "007_ingest_jobs_qdrant_outbox.sql",
  "008_chunks_fk_index.sql",
  "009_memory_archive_qdrant_retry.sql",
] as const;

const embeddedPostgresMigrationSql = `CREATE TABLE IF NOT EXISTS sources (
  id BIGSERIAL PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  title TEXT,
  content_hash TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory_records (
  id BIGSERIAL PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  project_key TEXT,
  kind TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  summary TEXT,
  durability TEXT NOT NULL DEFAULT 'ephemeral',
  importance INTEGER NOT NULL DEFAULT 0,
  source_id BIGINT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory_chunks (
  id BIGSERIAL PRIMARY KEY,
  memory_record_id BIGINT NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  embedding_provider TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dimensions INTEGER NOT NULL,
  embedding_version TEXT NOT NULL,
  qdrant_point_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (memory_record_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS relationships (
  id BIGSERIAL PRIMARY KEY,
  from_memory_record_id BIGINT NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
  to_memory_record_id BIGINT NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS context_pack_runs (
  id BIGSERIAL PRIMARY KEY,
  project_key TEXT NOT NULL,
  task TEXT NOT NULL,
  selected_memory_ids JSONB NOT NULL,
  pack_markdown TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingest_jobs (
  id BIGSERIAL PRIMARY KEY,
  memory_record_id BIGINT NOT NULL REFERENCES memory_records(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE INDEX IF NOT EXISTS idx_memory_records_org_scope
  ON memory_records (organization_id, scope_type, scope_id);

CREATE INDEX IF NOT EXISTS idx_memory_records_org_project
  ON memory_records (organization_id, project_key)
  WHERE project_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sources_org_scope
  ON sources (organization_id, scope_type, scope_id);

CREATE INDEX IF NOT EXISTS idx_memory_chunks_org_record
  ON memory_chunks (organization_id, memory_record_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  tool TEXT NOT NULL,
  project_key TEXT,
  outcome TEXT NOT NULL,
  error_message TEXT,
  duration_ms INTEGER NOT NULL,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_org_recent
  ON audit_log (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_tool_recent
  ON audit_log (tool, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_recent
  ON audit_log (actor, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_relationships_from_memory_record
  ON relationships (from_memory_record_id);

CREATE INDEX IF NOT EXISTS idx_relationships_to_memory_record
  ON relationships (to_memory_record_id);

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_memory_record
  ON ingest_jobs (memory_record_id);

CREATE TABLE IF NOT EXISTS compaction_runs (
  id                 BIGSERIAL    PRIMARY KEY,
  organization_id    TEXT         NOT NULL,
  actor              TEXT         NOT NULL,
  scope_type         TEXT         NOT NULL,
  scope_id           TEXT         NOT NULL,
  dry_run            BOOLEAN      NOT NULL,
  status             TEXT         NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','completed','failed')),
  archived_count     INTEGER      NOT NULL DEFAULT 0,
  duplicate_count    INTEGER      NOT NULL DEFAULT 0,
  decay_count        INTEGER      NOT NULL DEFAULT 0,
  qdrant_failed      INTEGER      NOT NULL DEFAULT 0,
  error_message      TEXT,
  plan_generated_at  TIMESTAMPTZ  NOT NULL,
  started_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ,
  idempotency_key    UUID         NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_compaction_runs_org_recent
  ON compaction_runs (organization_id, started_at DESC);

CREATE TABLE IF NOT EXISTS memory_archive (
  id                    BIGSERIAL    PRIMARY KEY,
  compaction_run_id     BIGINT       NOT NULL REFERENCES compaction_runs(id),
  organization_id       TEXT         NOT NULL,
  source_record_id      BIGINT       NOT NULL,
  archive_reason        TEXT         NOT NULL
                        CHECK (archive_reason IN ('duplicate','decay')),
  scope_type            TEXT         NOT NULL,
  scope_id              TEXT         NOT NULL,
  project_key           TEXT,
  kind                  TEXT         NOT NULL,
  title                 TEXT,
  content               TEXT         NOT NULL,
  summary               TEXT,
  durability            TEXT         NOT NULL,
  importance            INTEGER      NOT NULL,
  decay_score           NUMERIC(8,6),
  kept_record_id        BIGINT,
  qdrant_point_ids      TEXT[]       NOT NULL DEFAULT '{}',
  qdrant_status         TEXT         NOT NULL DEFAULT 'pending'
                        CHECK (qdrant_status IN ('pending','deleted','failed')),
  qdrant_attempt_count  INTEGER      NOT NULL DEFAULT 0,
  qdrant_last_error     TEXT,
  qdrant_cleaned_at     TIMESTAMPTZ,
  original_created_at   TIMESTAMPTZ  NOT NULL,
  original_updated_at   TIMESTAMPTZ  NOT NULL,
  archived_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (compaction_run_id, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_archive_org_recent
  ON memory_archive (organization_id, archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_archive_run
  ON memory_archive (compaction_run_id);

CREATE INDEX IF NOT EXISTS idx_memory_archive_qdrant_pending
  ON memory_archive (archived_at)
  WHERE qdrant_status = 'pending' AND array_length(qdrant_point_ids, 1) > 0;

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS metadata JSONB;

ALTER TABLE memory_archive
  ADD COLUMN IF NOT EXISTS source_id BIGINT;

ALTER TABLE memory_archive
  ADD COLUMN IF NOT EXISTS unarchived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_memory_archive_unarchived_pending
  ON memory_archive (organization_id, archived_at DESC)
  WHERE unarchived_at IS NULL;

-- 007_ingest_jobs_qdrant_outbox: outbox columns for the qdrant retry sweeper.
-- Mirrors src/db/migrations/007_ingest_jobs_qdrant_outbox.sql so the embedded
-- snapshot stays in sync for bundled-dist deployments.
ALTER TABLE ingest_jobs
  ADD COLUMN IF NOT EXISTS qdrant_status TEXT NOT NULL DEFAULT 'pending'
                           CHECK (qdrant_status IN ('pending','completed','failed'));

ALTER TABLE ingest_jobs
  ADD COLUMN IF NOT EXISTS qdrant_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE ingest_jobs
  ADD COLUMN IF NOT EXISTS qdrant_next_retry_at TIMESTAMPTZ;

ALTER TABLE ingest_jobs
  ADD COLUMN IF NOT EXISTS qdrant_last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_qdrant_pending_retry
  ON ingest_jobs (qdrant_next_retry_at)
  WHERE qdrant_status = 'pending'
    AND qdrant_next_retry_at IS NOT NULL;

-- PERF-6: single-column index so bare memory_record_id predicates
-- (e.g. cascade delete) don't fall back to a seq-scan.
CREATE INDEX IF NOT EXISTS idx_memory_chunks_record ON memory_chunks(memory_record_id);

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
`;

export type ReadPostgresMigrationSqlOptions = {
  readFile?: typeof fs.readFileSync;
  migrationFilePath?: string;
};

export function readPostgresMigrationSql(
  options: ReadPostgresMigrationSqlOptions = {},
): string {
  const readFile = options.readFile ?? fs.readFileSync;

  // If the caller pinned a single file path (legacy/test override), honor
  // it. Otherwise read every migration in order.
  if (options.migrationFilePath) {
    try {
      return readFile(options.migrationFilePath, "utf8");
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return embeddedPostgresMigrationSql;
      }
      throw error;
    }
  }

  const parts: string[] = [];
  for (const filename of MIGRATION_FILES) {
    const filePath = path.join(dbDir, "migrations", filename);
    try {
      parts.push(readFile(filePath, "utf8"));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // If any migration file is missing (e.g., bundled dist without sql
        // assets), fall back to the embedded snapshot which contains all
        // migrations concatenated.
        return embeddedPostgresMigrationSql;
      }
      throw error;
    }
  }

  return parts.join("\n\n");
}

export async function runMigrations(pool: PgPool): Promise<void> {
  await pool.query(readPostgresMigrationSql());
}

function resolveMigrationDatabaseUrl(env: NodeJS.ProcessEnv): string {
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }

  const user = env.POSTGRES_USER ?? "memory";
  const password = env.POSTGRES_PASSWORD ?? "memory";
  const host = env.POSTGRES_HOST ?? "127.0.0.1";
  const port = env.POSTGRES_PORT ?? "5432";
  const database = env.POSTGRES_DB ?? "memory_os";

  return `postgres://${user}:${password}@${host}:${port}/${database}`;
}

export async function migrateFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const pool = createPgPool({
    connectionString: resolveMigrationDatabaseUrl(env),
  });

  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

function isDirectExecution() {
  return process.argv[1] != null
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectExecution()) {
  migrateFromEnv().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
