import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ingestProjectArtifacts } from "../../src/ingest/ingest-project.js";
import { collectProjectSources } from "../../src/ingest/readers.js";
import type {
  AddMemoryInput,
  MemoryRepository,
  SearchMemoryInput,
  SearchMemoryResult,
} from "../../src/types.js";

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
    const repository = createInMemoryRepository();
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

  it("rejects malformed direct project roots before reading approved files", () => {
    expect(() => collectProjectSources(null as never)).toThrow(
      "projectRoot must be a non-empty string",
    );
    expect(() => collectProjectSources(" \n\t ")).toThrow(
      "projectRoot must be a non-empty string",
    );

    const missingRoot = path.join(
      os.tmpdir(),
      `developer-memory-os-missing-${process.pid}-${Date.now()}`,
    );
    fs.rmSync(missingRoot, { recursive: true, force: true });
    expect(() => collectProjectSources(missingRoot)).toThrow(
      "projectRoot must be an existing directory",
    );

    const tempProjectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "developer-memory-os-ingest-file-root-"),
    );
    tempDirs.push(tempProjectRoot);
    const fileRoot = path.join(tempProjectRoot, "not-a-directory");
    fs.writeFileSync(fileRoot, "not a directory");

    expect(() => collectProjectSources(fileRoot)).toThrow(
      "projectRoot must be an existing directory",
    );
  });

  it.each([
    {
      input: null,
      message: "ingestProjectArtifacts input must be an object",
    },
    {
      input: {
        projectRoot: " \n\t ",
        projectId: "project-alpha",
        repository: createInMemoryRepository(),
      },
      message: "projectRoot must be a non-empty string",
    },
    {
      input: {
        projectRoot: fixtureProjectRoot,
        projectId: " \n\t ",
        repository: createInMemoryRepository(),
      },
      message: "projectId must be a non-empty string",
    },
    {
      input: {
        projectRoot: fixtureProjectRoot,
        projectId: "project-alpha",
        repository: null,
      },
      message: "repository must be an object",
    },
    {
      input: {
        projectRoot: fixtureProjectRoot,
        projectId: "project-alpha",
        repository: { addMemory: "store" },
      },
      message: "repository.addMemory must be a function",
    },
  ])("rejects malformed direct ingest inputs", ({ input, message }) => {
    expect(() => ingestProjectArtifacts(input as never)).toThrow(message);
  });
});

function createInMemoryRepository(): MemoryRepository {
  const records: SearchMemoryResult[] = [];
  let nextId = 1;

  return {
    addMemory(input: AddMemoryInput) {
      const record: SearchMemoryResult = {
        id: nextId,
        sourceId: nextId + 100,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        memoryType: input.memoryType,
        content: input.content,
        createdAt: "2026-03-29T00:00:00.000Z",
        updatedAt: "2026-03-29T00:00:00.000Z",
        source: {
          id: nextId + 100,
          scopeType: input.source.scopeType,
          scopeId: input.source.scopeId,
          sourceType: input.source.sourceType,
          externalId: input.source.externalId ?? input.source.sourceRef ?? "",
          sourceRef: input.source.sourceRef ?? input.source.externalId ?? "",
          title: input.source.title ?? null,
          uri: input.source.uri ?? null,
          createdAt: "2026-03-29T00:00:00.000Z",
        },
      };

      nextId += 1;
      records.push(record);
      return record;
    },
    searchMemory(input: SearchMemoryInput) {
      const queryTerms = input.query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

      return records.filter((record) => {
        const inScope = input.scopes.some(
          (scope) =>
            scope.scopeType === record.scopeType && scope.scopeId === record.scopeId,
        );

        const normalizedContent = record.content.toLowerCase();

        return (
          inScope
          && queryTerms.every((term) => normalizedContent.includes(term))
        );
      });
    },
    listMemory(scope) {
      return records.filter(
        (record) =>
          record.scopeType === scope.scopeType && record.scopeId === scope.scopeId,
      );
    },
    getMemoryRecordsByIds(ids) {
      return ids.flatMap((id) => {
        const record = records.find((candidate) => candidate.id === id);
        return record ? [record] : [];
      });
    },
  };
}
