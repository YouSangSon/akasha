import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgPool } from "../../src/db/connection.js";
import {
  readPostgresMigrationSql,
  runMigrations,
} from "../../src/db/migrate.js";

type InformationSchemaTableRow = {
  table_name: string;
};

type InformationSchemaColumnRow = {
  column_name: string;
};

const postgresPort = process.env.POSTGRES_PORT ?? "5432";
const adminConnectionString =
  `postgres://memory:memory@127.0.0.1:${postgresPort}/postgres`;
const testConnectionString =
  `postgres://memory:memory@127.0.0.1:${postgresPort}/memory_os_test`;

async function waitForPostgres() {
  let lastError: unknown;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const adminPool = createPgPool({
      connectionString: adminConnectionString,
    });

    try {
      await adminPool.query("SELECT 1");
      return;
    } catch (error: unknown) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
      await adminPool.end().catch(() => undefined);
    }
  }

  throw lastError;
}

async function recreateTestDatabase() {
  const adminPool = createPgPool({
    connectionString: adminConnectionString,
  });

  try {
    await adminPool.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      ["memory_os_test"],
    );
    await adminPool.query('DROP DATABASE IF EXISTS "memory_os_test"');
    await adminPool.query('CREATE DATABASE "memory_os_test"');
  } finally {
    await adminPool.end();
  }
}

// PG-dependent suite: skip when POSTGRES_HOST is unset (e.g. the non-PG CI
// job, or local dev without docker compose). The pg-integration CI job sets
// it explicitly. Local opt-in: `POSTGRES_HOST=127.0.0.1 npm test`.
describe.skipIf(!process.env.POSTGRES_HOST)("runMigrations", () => {
  beforeAll(async () => {
    await waitForPostgres();
    await recreateTestDatabase();
  });

  afterAll(async () => {
    await recreateTestDatabase();
  });

  it("creates canonical Postgres tables for memory state", async () => {
    const pool = createPgPool({
      connectionString: testConnectionString,
    });

    try {
      await runMigrations(pool);

      const result = await pool.query<InformationSchemaTableRow>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'sources',
            'memory_records',
            'memory_chunks',
            'relationships',
            'context_pack_runs',
            'ingest_jobs',
            'entities',
            'memory_entity_mentions',
            'entity_relationships'
          )
        ORDER BY table_name
      `);

      expect(result.rows.map((row) => row.table_name)).toEqual([
        "context_pack_runs",
        "entities",
        "entity_relationships",
        "ingest_jobs",
        "memory_chunks",
        "memory_entity_mentions",
        "memory_records",
        "relationships",
        "sources",
      ]);
    } finally {
      await pool.end();
    }
  });

  it("applies migration 007 outbox columns to ingest_jobs", async () => {
    // Regression guard: PR #12 added 007_ingest_jobs_qdrant_outbox.sql to
    // disk but forgot to register it in MIGRATION_FILES, so runMigrations
    // silently skipped it. Tests that rely on these columns broke after
    // recreating their test database. This test asserts the columns are
    // present after a fresh migration so the same mistake can't recur.
    const pool = createPgPool({
      connectionString: testConnectionString,
    });

    try {
      await runMigrations(pool);

      const result = await pool.query<InformationSchemaColumnRow>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ingest_jobs'
          AND column_name IN (
            'qdrant_status',
            'qdrant_attempts',
            'qdrant_next_retry_at',
            'qdrant_last_error'
          )
        ORDER BY column_name
      `);

      expect(result.rows.map((row) => row.column_name)).toEqual([
        "qdrant_attempts",
        "qdrant_last_error",
        "qdrant_next_retry_at",
        "qdrant_status",
      ]);
    } finally {
      await pool.end();
    }
  });

  it("applies migration 009 retry visibility column to memory_archive", async () => {
    const pool = createPgPool({
      connectionString: testConnectionString,
    });

    try {
      await runMigrations(pool);

      const result = await pool.query<InformationSchemaColumnRow>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'memory_archive'
          AND column_name = 'qdrant_next_retry_at'
      `);

      expect(result.rows.map((row) => row.column_name)).toEqual([
        "qdrant_next_retry_at",
      ]);
    } finally {
      await pool.end();
    }
  });

  it("applies migration 010 full-text search column and index", async () => {
    const pool = createPgPool({
      connectionString: testConnectionString,
    });

    try {
      await runMigrations(pool);

      const columns = await pool.query<InformationSchemaColumnRow>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'memory_records'
          AND column_name = 'search_vector'
      `);
      const indexes = await pool.query<{ indexname: string }>(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'memory_records'
          AND indexname IN (
            'idx_memory_records_search_vector',
            'idx_memory_records_org_scope_recent'
          )
        ORDER BY indexname
      `);

      expect(columns.rows.map((row) => row.column_name)).toEqual([
        "search_vector",
      ]);
      expect(indexes.rows.map((row) => row.indexname)).toEqual([
        "idx_memory_records_org_scope_recent",
        "idx_memory_records_search_vector",
      ]);
    } finally {
      await pool.end();
    }
  });

  it("applies migration 011 entity and temporal graph tables", async () => {
    const pool = createPgPool({
      connectionString: testConnectionString,
    });

    try {
      await runMigrations(pool);

      const tables = await pool.query<InformationSchemaTableRow>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'entities',
            'memory_entity_mentions',
            'entity_relationships'
          )
        ORDER BY table_name
      `);
      const indexes = await pool.query<{ indexname: string }>(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
            'idx_entities_org_kind_normalized',
            'idx_memory_entity_mentions_entity',
            'idx_memory_entity_mentions_memory',
            'idx_entity_relationships_from',
            'idx_entity_relationships_to',
            'idx_entity_relationships_temporal'
          )
        ORDER BY indexname
      `);

      expect(tables.rows.map((row) => row.table_name)).toEqual([
        "entities",
        "entity_relationships",
        "memory_entity_mentions",
      ]);
      expect(indexes.rows.map((row) => row.indexname)).toEqual([
        "idx_entities_org_kind_normalized",
        "idx_entity_relationships_from",
        "idx_entity_relationships_temporal",
        "idx_entity_relationships_to",
        "idx_memory_entity_mentions_entity",
        "idx_memory_entity_mentions_memory",
      ]);
    } finally {
      await pool.end();
    }
  });

  it("applies migration 012 memory governance tags table and indexes", async () => {
    const pool = createPgPool({
      connectionString: testConnectionString,
    });

    try {
      await runMigrations(pool);

      const tables = await pool.query<InformationSchemaTableRow>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'memory_tags'
      `);
      const indexes = await pool.query<{ indexname: string }>(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'memory_tags'
          AND indexname IN (
            'idx_memory_tags_org_record',
            'idx_memory_tags_org_tag_record',
            'memory_tags_pkey'
          )
        ORDER BY indexname
      `);

      expect(tables.rows.map((row) => row.table_name)).toEqual([
        "memory_tags",
      ]);
      expect(indexes.rows.map((row) => row.indexname)).toEqual([
        "idx_memory_tags_org_record",
        "idx_memory_tags_org_tag_record",
        "memory_tags_pkey",
      ]);
    } finally {
      await pool.end();
    }
  });
});

describe("readPostgresMigrationSql", () => {
  it("falls back to the embedded Postgres migration when the sql asset is unavailable", () => {
    const sql = readPostgresMigrationSql({
      readFile(filePath) {
        const error = new Error(`missing: ${filePath}`) as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      },
    });

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS sources");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS ingest_jobs");
    // The embedded snapshot must mirror every on-disk migration so bundled-
    // dist deployments see the same schema as file-based runs.
    expect(sql).toContain("qdrant_status");
    expect(sql).toContain("idx_ingest_jobs_qdrant_pending_retry");
    expect(sql).toContain("qdrant_next_retry_at");
    expect(sql).toContain("idx_memory_archive_qdrant_pending_retry");
    expect(sql).toContain("search_vector tsvector");
    expect(sql).toContain("idx_memory_records_search_vector");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS entities");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS memory_entity_mentions");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS entity_relationships");
    expect(sql).toContain("idx_memory_entity_mentions_entity");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS memory_tags");
    expect(sql).toContain("idx_memory_tags_org_tag_record");
    expect(sql).toContain("idx_memory_tags_org_record");
  });
});
