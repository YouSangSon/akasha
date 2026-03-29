import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPgPool, type PgPool } from "./connection.js";

const dbDir = path.dirname(fileURLToPath(import.meta.url));
const postgresMigrationPath = path.join(dbDir, "migrations", "001_initial.sql");

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
`;

export type ReadPostgresMigrationSqlOptions = {
  readFile?: typeof fs.readFileSync;
  migrationFilePath?: string;
};

export function readPostgresMigrationSql(
  options: ReadPostgresMigrationSqlOptions = {},
): string {
  const readFile = options.readFile ?? fs.readFileSync;
  const targetPath = options.migrationFilePath ?? postgresMigrationPath;

  try {
    return readFile(targetPath, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return embeddedPostgresMigrationSql;
    }

    throw error;
  }
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
