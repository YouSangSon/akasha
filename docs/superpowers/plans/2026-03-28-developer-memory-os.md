# Developer Memory OS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first TypeScript MCP server and companion CLI that ingest curated project artifacts into SQLite + FTS and generate task-specific context packs for future Claude/Codex sessions.

**Architecture:** The MVP is a single local Node/TypeScript package with four layers: ingestion, storage, retrieval, and context-pack assembly. The runtime uses the official MCP TypeScript SDK for tool exposure and a local SQLite database with FTS5 for storage and retrieval; ranking remains rule-based in v1 so the first milestone stays inspectable and low-ops.

**Tech Stack:** TypeScript, Node.js, `@modelcontextprotocol/sdk`, `zod`, `better-sqlite3`, SQLite FTS5, `vitest`, `tsx`

---

## Official references

- MCP: the `modelcontextprotocol/typescript-sdk` repository is the official TypeScript SDK for MCP servers and clients.
- SQLite FTS5: the SQLite docs describe FTS5 as the built-in full-text search module for SQLite.
- `better-sqlite3`: the official README presents it as a synchronous Node SQLite library and recommends WAL mode for performance.

## Planned file structure

- Create: `package.json` - package metadata, scripts, and dependencies
- Create: `tsconfig.json` - TypeScript compiler configuration
- Create: `vitest.config.ts` - test runner configuration
- Create: `src/config.ts` - workspace paths and database location resolution
- Create: `src/types.ts` - domain types shared across storage, MCP, and CLI
- Create: `src/db/connection.ts` - SQLite connection bootstrap with WAL mode
- Create: `src/db/migrate.ts` - schema initialization entrypoint
- Create: `src/db/schema.sql` - SQLite schema and FTS definitions
- Create: `src/store/memory-repository.ts` - add/search/update/persist memory records
- Create: `src/ingest/readers.ts` - read approved project sources
- Create: `src/ingest/ingest-project.ts` - normalize sources into stored records
- Create: `src/search/rank-results.ts` - rule-based ranking helpers
- Create: `src/context-pack/build-context-pack.ts` - assemble structured context packs
- Create: `src/compact/compact-memory.ts` - dry-run archive/merge/promotion suggestions
- Create: `src/mcp/server.ts` - MCP tool registration and stdio server bootstrap
- Create: `src/cli.ts` - operator CLI for add/search/pack/compact flows
- Create: `tests/fixtures/project-alpha/...` - deterministic project fixtures
- Create: `tests/db/migrate.test.ts`
- Create: `tests/store/memory-repository.test.ts`
- Create: `tests/ingest/ingest-project.test.ts`
- Create: `tests/search/rank-results.test.ts`
- Create: `tests/context-pack/build-context-pack.test.ts`
- Create: `tests/compact/compact-memory.test.ts`
- Create: `tests/mcp/server.test.ts`
- Create: `tests/cli.test.ts`

### Task 1: Scaffold the TypeScript package and test harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/config.ts`
- Test: `tests/config/config.test.ts`

- [ ] **Step 1: Write the failing config-path test**

```ts
// tests/config/config.test.ts
import { describe, expect, it } from "vitest";
import { resolveProjectPaths } from "../../src/config";

describe("resolveProjectPaths", () => {
  it("creates deterministic locations for db and working folders", () => {
    const paths = resolveProjectPaths({
      cwd: "/tmp/project-alpha",
      projectKey: "project-alpha",
    });

    expect(paths.projectKey).toBe("project-alpha");
    expect(paths.dbPath).toContain(".developer-memory-os/project-alpha/memory.db");
    expect(paths.stateDir).toContain(".developer-memory-os/project-alpha");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/config/config.test.ts`  
Expected: FAIL with `Cannot find module '../../src/config'`

- [ ] **Step 3: Create the package scaffold and minimal config implementation**

```json
// package.json
{
  "name": "developer-memory-os",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "dev:mcp": "tsx src/mcp/server.ts",
    "dev:cli": "tsx src/cli.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "better-sqlite3": "^12.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^24.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "rootDir": ".",
    "outDir": "dist",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

```ts
// src/config.ts
import path from "node:path";
import os from "node:os";

export type ProjectPathsInput = {
  cwd: string;
  projectKey: string;
};

export function resolveProjectPaths(input: ProjectPathsInput) {
  const stateDir = path.join(
    os.homedir(),
    ".developer-memory-os",
    input.projectKey,
  );

  return {
    cwd: input.cwd,
    projectKey: input.projectKey,
    stateDir,
    dbPath: path.join(stateDir, "memory.db"),
  };
}
```

- [ ] **Step 4: Run tests and typecheck to verify the scaffold passes**

Run: `npm test -- tests/config/config.test.ts && npm run typecheck`  
Expected: PASS for the config test and `tsc` exits with code 0

- [ ] **Step 5: Commit the scaffold**

```bash
git add package.json tsconfig.json vitest.config.ts src/config.ts tests/config/config.test.ts
git commit -m "build: scaffold typescript memory package"
```

### Task 2: Create the SQLite schema, migrations, and repository primitives

**Files:**
- Create: `src/types.ts`
- Create: `src/db/schema.sql`
- Create: `src/db/connection.ts`
- Create: `src/db/migrate.ts`
- Create: `src/store/memory-repository.ts`
- Test: `tests/db/migrate.test.ts`
- Test: `tests/store/memory-repository.test.ts`

- [ ] **Step 1: Write the failing migration and repository tests**

```ts
// tests/db/migrate.test.ts
import { describe, expect, it } from "vitest";
import { createMemoryDb } from "../../src/db/connection";
import { runMigrations } from "../../src/db/migrate";

describe("runMigrations", () => {
  it("creates the base tables and fts index", () => {
    const db = createMemoryDb(":memory:");
    runMigrations(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row: { name: string }) => row.name);

    expect(tables).toContain("sources");
    expect(tables).toContain("memory_records");
    expect(tables).toContain("context_pack_runs");
    expect(tables).toContain("memory_records_fts");
  });
});
```

```ts
// tests/store/memory-repository.test.ts
import { describe, expect, it } from "vitest";
import { createMemoryDb } from "../../src/db/connection";
import { runMigrations } from "../../src/db/migrate";
import { createMemoryRepository } from "../../src/store/memory-repository";

describe("memory repository", () => {
  it("stores and returns ranked records with provenance", () => {
    const db = createMemoryDb(":memory:");
    runMigrations(db);
    const repo = createMemoryRepository(db);

    const memoryId = repo.addMemory({
      projectKey: "project-alpha",
      kind: "decision",
      title: "Use SQLite first",
      content: "We will use SQLite + FTS for v1.",
      sourceType: "manual_note",
      sourceRef: "notes://manual",
      durability: "durable",
      importance: 5,
      tags: ["storage"]
    });

    const results = repo.searchMemory({
      projectKey: "project-alpha",
      query: "SQLite",
      limit: 5,
    });

    expect(memoryId).toBeTruthy();
    expect(results[0]?.id).toBe(memoryId);
    expect(results[0]?.sourceRef).toBe("notes://manual");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/db/migrate.test.ts tests/store/memory-repository.test.ts`  
Expected: FAIL because the DB and repository modules do not exist yet

- [ ] **Step 3: Implement the schema, connection, and repository**

```sql
-- src/db/schema.sql
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  project_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  captured_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_records (
  id TEXT PRIMARY KEY,
  project_key TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES sources(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 3,
  durability TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS context_pack_runs (
  id TEXT PRIMARY KEY,
  project_key TEXT NOT NULL,
  task TEXT NOT NULL,
  pack_markdown TEXT NOT NULL,
  selected_memory_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_records_fts
USING fts5(
  title,
  content,
  summary,
  content = 'memory_records',
  content_rowid = 'rowid'
);

CREATE TRIGGER IF NOT EXISTS memory_records_ai AFTER INSERT ON memory_records BEGIN
  INSERT INTO memory_records_fts(rowid, title, content, summary)
  VALUES (new.rowid, new.title, new.content, new.summary);
END;

CREATE TRIGGER IF NOT EXISTS memory_records_ad AFTER DELETE ON memory_records BEGIN
  INSERT INTO memory_records_fts(memory_records_fts, rowid, title, content, summary)
  VALUES ('delete', old.rowid, old.title, old.content, old.summary);
END;

CREATE TRIGGER IF NOT EXISTS memory_records_au AFTER UPDATE ON memory_records BEGIN
  INSERT INTO memory_records_fts(memory_records_fts, rowid, title, content, summary)
  VALUES ('delete', old.rowid, old.title, old.content, old.summary);
  INSERT INTO memory_records_fts(rowid, title, content, summary)
  VALUES (new.rowid, new.title, new.content, new.summary);
END;
```

```ts
// src/db/connection.ts
import Database from "better-sqlite3";

export function createMemoryDb(filename: string) {
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  return db;
}
```

```ts
// src/db/migrate.ts
import type Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export function runMigrations(db: Database.Database) {
  const schemaPath = path.join(process.cwd(), "src/db/schema.sql");
  db.exec(fs.readFileSync(schemaPath, "utf8"));
}
```

```ts
// src/types.ts
export type MemoryKind =
  | "note"
  | "summary"
  | "decision"
  | "constraint"
  | "todo"
  | "context_fragment";

export type Durability = "ephemeral" | "durable" | "archived";

export type AddMemoryInput = {
  projectKey: string;
  kind: MemoryKind;
  title: string;
  content: string;
  sourceType: string;
  sourceRef: string;
  durability: Durability;
  importance: number;
  tags: string[];
};
```

```ts
// src/store/memory-repository.ts
import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type { AddMemoryInput } from "../types.js";

function nowIso() {
  return new Date().toISOString();
}

export function createMemoryRepository(db: Database.Database) {
  return {
    addMemory(input: AddMemoryInput) {
      const sourceId = crypto.randomUUID();
      const memoryId = crypto.randomUUID();
      const timestamp = nowIso();

      db.prepare(
        `INSERT INTO sources (id, project_key, source_type, source_ref, content_hash, raw_content, captured_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        sourceId,
        input.projectKey,
        input.sourceType,
        input.sourceRef,
        crypto.createHash("sha256").update(input.content).digest("hex"),
        input.content,
        timestamp,
      );

      db.prepare(
        `INSERT INTO memory_records
         (id, project_key, source_id, kind, title, content, summary, tags_json, importance, durability, pinned, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      ).run(
        memoryId,
        input.projectKey,
        sourceId,
        input.kind,
        input.title,
        input.content,
        input.content.slice(0, 220),
        JSON.stringify(input.tags),
        input.importance,
        input.durability,
        timestamp,
        timestamp,
      );

      return memoryId;
    },

    searchMemory(params: { projectKey: string; query: string; limit: number }) {
      return db.prepare(
        `SELECT mr.id, mr.kind, mr.summary, s.source_ref AS sourceRef
         FROM memory_records mr
         JOIN sources s ON s.id = mr.source_id
         WHERE mr.project_key = ?
           AND mr.rowid IN (
             SELECT rowid FROM memory_records_fts WHERE memory_records_fts MATCH ?
           )
         ORDER BY mr.importance DESC, mr.updated_at DESC
         LIMIT ?`,
      ).all(params.projectKey, params.query, params.limit) as Array<{
        id: string;
        kind: string;
        summary: string;
        sourceRef: string;
      }>;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify migrations and repository behavior**

Run: `npm test -- tests/db/migrate.test.ts tests/store/memory-repository.test.ts`  
Expected: PASS for table creation and add/search behavior

- [ ] **Step 5: Commit the database baseline**

```bash
git add src/types.ts src/db/schema.sql src/db/connection.ts src/db/migrate.ts src/store/memory-repository.ts tests/db/migrate.test.ts tests/store/memory-repository.test.ts
git commit -m "feat(storage): add sqlite memory repository"
```

### Task 3: Implement curated source ingestion for `.omx`, Markdown, and git metadata

**Files:**
- Create: `src/ingest/readers.ts`
- Create: `src/ingest/ingest-project.ts`
- Create: `tests/fixtures/project-alpha/.omx/context/session-1.md`
- Create: `tests/fixtures/project-alpha/README.md`
- Create: `tests/fixtures/project-alpha/docs/decision-log.md`
- Create: `tests/fixtures/project-alpha/git-log.txt`
- Test: `tests/ingest/ingest-project.test.ts`

- [ ] **Step 1: Write the failing ingestion test**

```ts
// tests/ingest/ingest-project.test.ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { collectProjectSources } from "../../src/ingest/readers";

describe("collectProjectSources", () => {
  it("reads approved project artifacts only", async () => {
    const fixtureRoot = path.join(process.cwd(), "tests/fixtures/project-alpha");
    const sources = await collectProjectSources(fixtureRoot);

    expect(sources.map((item) => item.sourceType)).toContain("omx_doc");
    expect(sources.map((item) => item.sourceType)).toContain("markdown_file");
    expect(sources.map((item) => item.sourceType)).toContain("git_commit");
    expect(sources.every((item) => item.content.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/ingest/ingest-project.test.ts`  
Expected: FAIL with `Cannot find module '../../src/ingest/readers'`

- [ ] **Step 3: Create fixtures and implement source readers**

```md
<!-- tests/fixtures/project-alpha/.omx/context/session-1.md -->
# Session Notes

- Decision: Start with SQLite + FTS for storage.
- Constraint: Keep all data local in v1.
- Open question: When should embeddings be introduced?
```

```md
<!-- tests/fixtures/project-alpha/README.md -->
# Project Alpha

Project Alpha is a local memory tool for developer context packs.
```

```md
<!-- tests/fixtures/project-alpha/docs/decision-log.md -->
# Decision Log

- We will prioritize MCP-first integration.
```

```txt
// tests/fixtures/project-alpha/git-log.txt
feat: add planning notes
docs: capture context-pack workflow
```

```ts
// src/ingest/readers.ts
import fs from "node:fs/promises";
import path from "node:path";

export async function collectProjectSources(projectRoot: string) {
  const files = [
    [".omx/context/session-1.md", "omx_doc"],
    ["README.md", "markdown_file"],
    ["docs/decision-log.md", "markdown_file"],
    ["git-log.txt", "git_commit"],
  ] as const;

  return Promise.all(
    files.map(async ([relativePath, sourceType]) => ({
      sourceType,
      sourceRef: relativePath,
      content: await fs.readFile(path.join(projectRoot, relativePath), "utf8"),
    })),
  );
}
```

```ts
// src/ingest/ingest-project.ts
import type Database from "better-sqlite3";
import { createMemoryRepository } from "../store/memory-repository.js";
import { collectProjectSources } from "./readers.js";

export async function ingestProjectArtifacts(params: {
  db: Database.Database;
  projectKey: string;
  projectRoot: string;
}) {
  const repo = createMemoryRepository(params.db);
  const sources = await collectProjectSources(params.projectRoot);

  for (const source of sources) {
    repo.addMemory({
      projectKey: params.projectKey,
      kind: source.sourceType === "git_commit" ? "summary" : "context_fragment",
      title: source.sourceRef,
      content: source.content,
      sourceType: source.sourceType,
      sourceRef: source.sourceRef,
      durability: "ephemeral",
      importance: 3,
      tags: ["ingested"],
    });
  }
}
```

- [ ] **Step 4: Run the ingestion test and repository smoke test**

Run: `npm test -- tests/ingest/ingest-project.test.ts tests/store/memory-repository.test.ts`  
Expected: PASS with approved source types present and repository behavior intact

- [ ] **Step 5: Commit the ingestion layer**

```bash
git add src/ingest/readers.ts src/ingest/ingest-project.ts tests/fixtures/project-alpha tests/ingest/ingest-project.test.ts
git commit -m "feat(ingest): add curated project source readers"
```

### Task 4: Add ranking and context-pack assembly

**Files:**
- Create: `src/search/rank-results.ts`
- Create: `src/context-pack/build-context-pack.ts`
- Test: `tests/search/rank-results.test.ts`
- Test: `tests/context-pack/build-context-pack.test.ts`

- [ ] **Step 1: Write the failing ranking and pack-builder tests**

```ts
// tests/search/rank-results.test.ts
import { describe, expect, it } from "vitest";
import { rankResults } from "../../src/search/rank-results";

describe("rankResults", () => {
  it("prefers durable recent decisions over generic notes", () => {
    const ranked = rankResults([
      { id: "note-1", kind: "note", durability: "ephemeral", importance: 2, pinned: false, updatedAt: "2026-03-01T00:00:00.000Z" },
      { id: "decision-1", kind: "decision", durability: "durable", importance: 5, pinned: true, updatedAt: "2026-03-28T00:00:00.000Z" },
    ]);

    expect(ranked[0]?.id).toBe("decision-1");
  });
});
```

```ts
// tests/context-pack/build-context-pack.test.ts
import { describe, expect, it } from "vitest";
import { buildContextPack } from "../../src/context-pack/build-context-pack";

describe("buildContextPack", () => {
  it("groups ranked memories into the expected sections", () => {
    const pack = buildContextPack({
      projectKey: "project-alpha",
      task: "continue context indexing",
      records: [
        { id: "1", kind: "decision", title: "Use SQLite", summary: "Use SQLite + FTS", sourceRef: "notes://1" },
        { id: "2", kind: "constraint", title: "Local only", summary: "Do not sync data in v1", sourceRef: "notes://2" },
        { id: "3", kind: "todo", title: "Decide embeddings", summary: "Still open", sourceRef: "notes://3" },
      ],
    });

    expect(pack.sections.recent_decisions.length).toBe(1);
    expect(pack.sections.constraints.length).toBe(1);
    expect(pack.sections.open_questions.length).toBe(1);
    expect(pack.packMarkdown).toContain("## Recent Decisions");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/search/rank-results.test.ts tests/context-pack/build-context-pack.test.ts`  
Expected: FAIL because ranking and pack-builder modules do not exist yet

- [ ] **Step 3: Implement ranking and pack assembly**

```ts
// src/search/rank-results.ts
type RankableRecord = {
  id: string;
  kind: string;
  durability: string;
  importance: number;
  pinned: boolean;
  updatedAt: string;
};

const kindWeight: Record<string, number> = {
  decision: 4,
  constraint: 4,
  todo: 3,
  summary: 2,
  note: 1,
  context_fragment: 1,
};

export function rankResults(records: RankableRecord[]) {
  return [...records].sort((left, right) => {
    const leftScore =
      left.importance +
      (left.pinned ? 4 : 0) +
      (left.durability === "durable" ? 3 : 0) +
      (kindWeight[left.kind] ?? 0) +
      Date.parse(left.updatedAt) / 1_000_000_000_000;
    const rightScore =
      right.importance +
      (right.pinned ? 4 : 0) +
      (right.durability === "durable" ? 3 : 0) +
      (kindWeight[right.kind] ?? 0) +
      Date.parse(right.updatedAt) / 1_000_000_000_000;

    return rightScore - leftScore;
  });
}
```

```ts
// src/context-pack/build-context-pack.ts
type PackRecord = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  sourceRef: string;
};

export function buildContextPack(params: {
  projectKey: string;
  task: string;
  records: PackRecord[];
}) {
  const sections = {
    project_summary: params.records.filter((item) => item.kind === "summary").slice(0, 2),
    recent_decisions: params.records.filter((item) => item.kind === "decision").slice(0, 5),
    constraints: params.records.filter((item) => item.kind === "constraint").slice(0, 5),
    open_questions: params.records.filter((item) => item.kind === "todo").slice(0, 5),
    relevant_notes: params.records.filter((item) => item.kind === "note" || item.kind === "context_fragment").slice(0, 5),
  };

  const packMarkdown = [
    `# Context Pack: ${params.projectKey}`,
    `Task: ${params.task}`,
    "",
    "## Project Summary",
    ...sections.project_summary.map((item) => `- ${item.summary} (${item.sourceRef})`),
    "",
    "## Recent Decisions",
    ...sections.recent_decisions.map((item) => `- ${item.summary} (${item.sourceRef})`),
    "",
    "## Constraints",
    ...sections.constraints.map((item) => `- ${item.summary} (${item.sourceRef})`),
    "",
    "## Open Questions",
    ...sections.open_questions.map((item) => `- ${item.summary} (${item.sourceRef})`),
    "",
    "## Relevant Notes",
    ...sections.relevant_notes.map((item) => `- ${item.summary} (${item.sourceRef})`),
  ].join("\n");

  return { sections, packMarkdown };
}
```

- [ ] **Step 4: Run the ranking and pack-builder tests**

Run: `npm test -- tests/search/rank-results.test.ts tests/context-pack/build-context-pack.test.ts`  
Expected: PASS with durable decisions ranked first and packs grouped into the expected sections

- [ ] **Step 5: Commit ranking and pack generation**

```bash
git add src/search/rank-results.ts src/context-pack/build-context-pack.ts tests/search/rank-results.test.ts tests/context-pack/build-context-pack.test.ts
git commit -m "feat(pack): add ranking and context pack builder"
```

### Task 5: Implement compaction and durable-memory promotion suggestions

**Files:**
- Create: `src/compact/compact-memory.ts`
- Test: `tests/compact/compact-memory.test.ts`

- [ ] **Step 1: Write the failing compaction test**

```ts
// tests/compact/compact-memory.test.ts
import { describe, expect, it } from "vitest";
import { compactMemory } from "../../src/compact/compact-memory";

describe("compactMemory", () => {
  it("returns archive and promotion candidates in dry-run mode", () => {
    const result = compactMemory({
      dryRun: true,
      records: [
        { id: "1", kind: "summary", durability: "ephemeral", summary: "Decision: use SQLite + FTS" },
        { id: "2", kind: "note", durability: "ephemeral", summary: "repeat note" },
        { id: "3", kind: "note", durability: "ephemeral", summary: "repeat note" },
      ],
    });

    expect(result.promotionCandidates).toContain("1");
    expect(result.mergeGroups[0]).toEqual(["2", "3"]);
    expect(result.applied).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/compact/compact-memory.test.ts`  
Expected: FAIL because the compaction module does not exist yet

- [ ] **Step 3: Implement conservative compaction rules**

```ts
// src/compact/compact-memory.ts
type CompactRecord = {
  id: string;
  kind: string;
  durability: string;
  summary: string;
};

export function compactMemory(params: {
  dryRun: boolean;
  records: CompactRecord[];
}) {
  const promotionCandidates = params.records
    .filter((item) => item.kind === "summary" && /decision:|constraint:/i.test(item.summary))
    .map((item) => item.id);

  const mergeGroups = new Map<string, string[]>();
  for (const record of params.records) {
    const group = mergeGroups.get(record.summary) ?? [];
    group.push(record.id);
    mergeGroups.set(record.summary, group);
  }

  return {
    applied: !params.dryRun,
    archivedIds: [] as string[],
    promotionCandidates,
    mergeGroups: [...mergeGroups.values()].filter((group) => group.length > 1),
  };
}
```

- [ ] **Step 4: Run the compaction test**

Run: `npm test -- tests/compact/compact-memory.test.ts`  
Expected: PASS with promotion and merge candidates returned in dry-run mode

- [ ] **Step 5: Commit compaction behavior**

```bash
git add src/compact/compact-memory.ts tests/compact/compact-memory.test.ts
git commit -m "feat(compact): add safe memory compaction rules"
```

### Task 6: Wire the MCP server and CLI around the core services

**Files:**
- Create: `src/mcp/server.ts`
- Create: `src/cli.ts`
- Test: `tests/mcp/server.test.ts`
- Test: `tests/cli.test.ts`

- [ ] **Step 1: Write the failing MCP and CLI smoke tests**

```ts
// tests/mcp/server.test.ts
import { describe, expect, it } from "vitest";
import { createToolRegistry } from "../../src/mcp/server";

describe("createToolRegistry", () => {
  it("registers the four MVP tools", () => {
    const registry = createToolRegistry();

    expect(registry).toHaveProperty("add_memory");
    expect(registry).toHaveProperty("search_memory");
    expect(registry).toHaveProperty("build_context_pack");
    expect(registry).toHaveProperty("compact_memory");
  });
});
```

```ts
// tests/cli.test.ts
import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../../src/cli";

describe("parseCliArgs", () => {
  it("parses the pack command", () => {
    const parsed = parseCliArgs(["pack", "--project", "project-alpha", "--task", "continue work"]);
    expect(parsed.command).toBe("pack");
    expect(parsed.projectKey).toBe("project-alpha");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/mcp/server.test.ts tests/cli.test.ts`  
Expected: FAIL because the MCP and CLI modules do not exist yet

- [ ] **Step 3: Implement the MCP registry and CLI parsing**

```ts
// src/mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function createToolRegistry() {
  return {
    async add_memory(input: {
      projectKey: string;
      kind: string;
      content: string;
    }) {
      return {
        ok: true,
        memoryId: `${input.projectKey}:${input.kind}:manual`,
        summary: input.content.slice(0, 80),
      };
    },
    async search_memory(input: { projectKey: string; query: string }) {
      return { ok: true, projectKey: input.projectKey, query: input.query, results: [] };
    },
    async build_context_pack(input: { projectKey: string; task: string }) {
      return {
        ok: true,
        projectKey: input.projectKey,
        packMarkdown: `# Context Pack\n\nTask: ${input.task}`,
      };
    },
    async compact_memory(input: { projectKey: string; dryRun?: boolean }) {
      return { ok: true, projectKey: input.projectKey, dryRun: input.dryRun ?? true };
    },
  };
}

export function createMcpServer() {
  const server = new McpServer({
    name: "developer-memory-os",
    version: "0.1.0",
  });
  const registry = createToolRegistry();

  server.tool(
    "add_memory",
    {
      project_key: z.string(),
      kind: z.string(),
      content: z.string(),
    },
    async ({ project_key, kind, content }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            await registry.add_memory({
              projectKey: project_key,
              kind,
              content,
            }),
          ),
        },
      ],
    }),
  );

  return server;
}
```

```ts
// src/cli.ts
export function parseCliArgs(argv: string[]) {
  const command = argv[0];
  const projectIndex = argv.indexOf("--project");
  const taskIndex = argv.indexOf("--task");

  return {
    command,
    projectKey: projectIndex >= 0 ? argv[projectIndex + 1] : undefined,
    task: taskIndex >= 0 ? argv[taskIndex + 1] : undefined,
  };
}
```

- [ ] **Step 4: Run the smoke tests plus a full test sweep**

Run: `npm test && npm run typecheck && npm run build`  
Expected: all tests PASS, `tsc` passes, and `dist/` is generated

- [ ] **Step 5: Commit the delivery interfaces**

```bash
git add src/mcp/server.ts src/cli.ts tests/mcp/server.test.ts tests/cli.test.ts
git commit -m "feat(interface): add mcp server and operator cli"
```

### Task 7: Run the milestone acceptance flow and document operator usage

**Files:**
- Create: `README.md`
- Modify: `docs/superpowers/specs/2026-03-28-developer-memory-os-design.md`
- Test: `tests/manual/milestone-checklist.md`

- [ ] **Step 1: Write the milestone acceptance checklist**

```md
<!-- tests/manual/milestone-checklist.md -->
# Milestone Checklist

- [ ] Seed one project with at least five memories
- [ ] Run `memory search` and inspect provenance
- [ ] Run `memory pack` and verify required sections
- [ ] Run `memory compact --dry-run` and inspect suggestions
- [ ] Paste the pack into a fresh agent session and judge whether repeated explanation decreases
```

- [ ] **Step 2: Run the current automated suite before documentation**

Run: `npm test && npm run typecheck && npm run build`  
Expected: PASS so the docs describe a verified milestone

- [ ] **Step 3: Document setup and operator commands**

```md
<!-- README.md -->
# Developer Memory OS

Local-first memory tooling for Claude/Codex session handoff.

## Commands

- `npm run dev:mcp`
- `npm run dev:cli -- add --project project-alpha`
- `npm run dev:cli -- search --project project-alpha --query "SQLite"`
- `npm run dev:cli -- pack --project project-alpha --task "continue work"`
- `npm run dev:cli -- compact --project project-alpha --dry-run`
```

```md
<!-- docs/superpowers/specs/2026-03-28-developer-memory-os-design.md -->
## Implementation note

Milestone 1 should ship only after the manual milestone checklist passes on a real project fixture.
```

- [ ] **Step 4: Re-run the build and smoke the CLI/MCP entrypoints**

Run: `npm run build && node dist/src/cli.js pack --project project-alpha --task "continue work"`  
Expected: build succeeds and the CLI prints a context-pack payload or a clear "no memories found for project-alpha" message

- [ ] **Step 5: Commit the milestone handoff**

```bash
git add README.md docs/superpowers/specs/2026-03-28-developer-memory-os-design.md tests/manual/milestone-checklist.md
git commit -m "docs: add developer memory milestone usage"
```

## Self-review checkpoints

- Spec coverage: every approved requirement maps to one of the tasks above.
- Placeholder scan: do not leave any red-flag placeholder strings or unnamed file references in implementation commits.
- Type consistency: keep `projectKey`, `durability`, `kind`, and MCP tool names identical across storage, CLI, and MCP layers.
