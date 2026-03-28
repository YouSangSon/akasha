import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryDb } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrate.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("runMigrations", () => {
  it("creates the core tables, fts table, and triggers", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "developer-memory-os-migrate-"),
    );
    tempDirs.push(tempDir);

    const db = createMemoryDb(path.join(tempDir, "memory.db"));

    runMigrations(db);

    const tables = db
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name IN ('sources', 'memory_records', 'context_pack_runs', 'memory_records_fts')
          ORDER BY name
        `,
      )
      .all() as Array<{ name: string }>;

    const triggers = db
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'trigger'
            AND name IN (
              'memory_records_ai',
              'memory_records_ad',
              'memory_records_au'
            )
          ORDER BY name
        `,
      )
      .all() as Array<{ name: string }>;

    const indexes = db
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'index'
            AND name IN (
              'idx_sources_scope',
              'idx_memory_records_scope',
              'idx_memory_records_source_id'
            )
          ORDER BY name
        `,
      )
      .all() as Array<{ name: string }>;

    expect(tables.map((row) => row.name)).toEqual([
      "context_pack_runs",
      "memory_records",
      "memory_records_fts",
      "sources",
    ]);
    expect(indexes.map((row) => row.name)).toEqual([
      "idx_memory_records_scope",
      "idx_memory_records_source_id",
      "idx_sources_scope",
    ]);
    expect(triggers.map((row) => row.name)).toEqual([
      "memory_records_ad",
      "memory_records_ai",
      "memory_records_au",
    ]);
  });
});
