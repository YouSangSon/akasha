import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryDb } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrate.js";
import { ingestProjectArtifacts } from "../../src/ingest/ingest-project.js";
import { collectProjectSources } from "../../src/ingest/readers.js";
import { createMemoryRepository } from "../../src/store/memory-repository.js";

const fixtureProjectRoot = path.resolve(
  "tests/fixtures/project-alpha",
);

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("project ingestion", () => {
  it("collects only the explicit approved project sources and stores normalized records", () => {
    const tempProjectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "developer-memory-os-ingest-fixture-"),
    );
    tempDirs.push(tempProjectRoot);

    fs.cpSync(fixtureProjectRoot, tempProjectRoot, { recursive: true });
    fs.mkdirSync(path.join(tempProjectRoot, ".omx", "tmux"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tempProjectRoot, ".omx", "tmux", "session-log.md"),
      "# Session Log\n\nThis file should not be ingested.\n",
    );
    fs.writeFileSync(
      path.join(tempProjectRoot, "docs", "notes.md"),
      "# Notes\n\nThis file should not be ingested.\n",
    );

    const sources = collectProjectSources(tempProjectRoot);

    expect(sources).toEqual([
      expect.objectContaining({
        sourceType: "conversation",
        sourceRef: ".omx/context/session-1.md",
        title: "session-1",
        content: expect.stringContaining("Captured the architecture constraints"),
      }),
      expect.objectContaining({
        sourceType: "document",
        sourceRef: "README.md",
        title: "README",
        content: expect.stringContaining("Project Alpha is a sample workspace"),
      }),
      expect.objectContaining({
        sourceType: "decision",
        sourceRef: "docs/decision-log.md",
        title: "decision-log",
        content: expect.stringContaining("Decision: keep local-first storage"),
      }),
      expect.objectContaining({
        sourceType: "document",
        sourceRef: "git-log.txt",
        title: "git-log",
        content: expect.stringContaining("feat: scaffold memory repository"),
      }),
    ]);
    expect(sources).toHaveLength(4);
    expect(sources.map((source) => source.sourceRef)).toEqual([
      ".omx/context/session-1.md",
      "README.md",
      "docs/decision-log.md",
      "git-log.txt",
    ]);

    for (const source of sources) {
      expect(source.content.length).toBeGreaterThan(0);
    }

    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "developer-memory-os-ingest-project-"),
    );
    tempDirs.push(tempDir);

    const db = createMemoryDb(path.join(tempDir, "memory.db"));
    runMigrations(db);

    const repository = createMemoryRepository(db);
    const records = ingestProjectArtifacts({
      projectRoot: tempProjectRoot,
      projectId: "project-alpha",
      repository,
    });

    expect(records).toHaveLength(4);
    expect(records.map((record) => record.source.externalId)).toEqual([
      ".omx/context/session-1.md",
      "README.md",
      "docs/decision-log.md",
      "git-log.txt",
    ]);
    expect(records.map((record) => record.source.sourceType)).toEqual([
      "conversation",
      "document",
      "decision",
      "document",
    ]);
    expect(records.map((record) => record.memoryType)).toEqual([
      "summary",
      "summary",
      "decision",
      "fact",
    ]);

    expect(
      repository.searchMemory({
        query: "architecture constraints",
        scopes: [{ scopeType: "project", scopeId: "project-alpha" }],
        limit: 10,
      }),
    ).toEqual([
      expect.objectContaining({
        memoryType: "summary",
        source: expect.objectContaining({
          sourceType: "conversation",
          externalId: ".omx/context/session-1.md",
        }),
      }),
    ]);

    expect(
      repository.searchMemory({
        query: "sync designed",
        scopes: [{ scopeType: "project", scopeId: "project-alpha" }],
        limit: 10,
      }),
    ).toEqual([
      expect.objectContaining({
        memoryType: "decision",
        source: expect.objectContaining({
          sourceType: "decision",
          externalId: "docs/decision-log.md",
        }),
      }),
    ]);

    expect(
      repository.searchMemory({
        query: "scaffold memory repository",
        scopes: [{ scopeType: "project", scopeId: "project-alpha" }],
        limit: 10,
      }),
    ).toEqual([
      expect.objectContaining({
        memoryType: "fact",
        source: expect.objectContaining({
          sourceType: "document",
          externalId: "git-log.txt",
        }),
      }),
    ]);
  });
});
