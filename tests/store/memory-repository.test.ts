import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryDb } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrate.js";
import { createMemoryRepository } from "../../src/store/memory-repository.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("createMemoryRepository", () => {
  it("stores scoped memories and finds them with provenance for allowed scopes", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "developer-memory-os-repository-"),
    );
    tempDirs.push(tempDir);

    const db = createMemoryDb(path.join(tempDir, "memory.db"));
    runMigrations(db);

    const repository = createMemoryRepository(db);

    repository.addMemory({
      scopeType: "project",
      scopeId: "project-alpha",
      source: {
        scopeType: "project",
        scopeId: "project-alpha",
        sourceType: "decision",
        externalId: "decision-1",
        title: "ADR 1",
        uri: "file:///tmp/project-alpha/docs/adr-1.md",
      },
      memoryType: "decision",
      content: "Use SQLite for local memory search in project alpha.",
    });

    repository.addMemory({
      scopeType: "project",
      scopeId: "project-beta",
      source: {
        scopeType: "project",
        scopeId: "project-beta",
        sourceType: "decision",
        externalId: "decision-2",
        title: "ADR 2",
        uri: "file:///tmp/project-beta/docs/adr-2.md",
      },
      memoryType: "decision",
      content: "Use Postgres for unrelated project beta experiments.",
    });

    const results = repository.searchMemory({
      query: "SQLite local memory",
      scopes: [{ scopeType: "project", scopeId: "project-alpha" }],
      limit: 10,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      scopeType: "project",
      scopeId: "project-alpha",
      memoryType: "decision",
      content: "Use SQLite for local memory search in project alpha.",
      source: {
        sourceType: "decision",
        externalId: "decision-1",
        title: "ADR 1",
        uri: "file:///tmp/project-alpha/docs/adr-1.md",
        scopeType: "project",
        scopeId: "project-alpha",
      },
    });
  });
});
