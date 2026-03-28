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

  it("backfills the fts table for memory records that predate the migration", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "developer-memory-os-migrate-backfill-"),
    );
    tempDirs.push(tempDir);

    const db = createMemoryDb(path.join(tempDir, "memory.db"));

    db.exec(`
      CREATE TABLE sources (
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

      CREATE TABLE memory_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        memory_type TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE context_pack_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
      );
    `);

    const sourceInsert = db.prepare(`
      INSERT INTO sources (
        scope_type,
        scope_id,
        source_type,
        external_id,
        title,
        uri
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    const memoryInsert = db.prepare(`
      INSERT INTO memory_records (
        source_id,
        scope_type,
        scope_id,
        memory_type,
        content
      ) VALUES (?, ?, ?, ?, ?)
    `);

    const sourceResult = sourceInsert.run(
      "project",
      "project-alpha",
      "decision",
      "decision-legacy",
      "Legacy ADR",
      "file:///tmp/project-alpha/docs/legacy-adr.md",
    );

    memoryInsert.run(
      sourceResult.lastInsertRowid,
      "project",
      "project-alpha",
      "decision",
      "Legacy SQLite migration notes remain searchable.",
    );

    runMigrations(db);

    const matches = db
      .prepare(`
        SELECT rowid
        FROM memory_records_fts
        WHERE memory_records_fts MATCH 'SQLite'
      `)
      .all() as Array<{ rowid: number }>;

    expect(matches).toHaveLength(1);
  });
});
