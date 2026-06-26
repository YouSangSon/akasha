# Akasha Growth Foundation Wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Akasha growth foundation wave: production-ready Compose/auth behavior, atomic unarchive compensation, internal retrieval scoring foundations, and public documentation drift fixes.

**Architecture:** Keep the public API stable while tightening internals. Operational changes stay at the config/container boundary, unarchive consistency is handled with compensating cleanup around external vector writes, retrieval adds internal scored candidates without exposing debug scores, and documentation drift is pinned by focused tests.

**Tech Stack:** TypeScript, Node HTTP server, Vitest, Docker Compose, Postgres, Qdrant or pgvector, MCP SDK, Markdown documentation.

## Global Constraints

- Work on `feat/akasha-growth-foundation-wave`, not directly on `main`.
- Embedding default remains `transformers`; `OPENAI_API_KEY` remains optional unless `EMBEDDING_PROVIDER=openai`.
- All memory operations remain org-scoped; pass `organizationId` on cleanup and vector-delete paths.
- No full BM25, SQL `tsvector`, entity graph, temporal fact invalidation, hook installer, UI, OAuth, or hosted dashboard in this wave.
- Do not change the public `search_memory` response shape.
- Keep MCP stdio, MCP Streamable HTTP at `/mcp`, and JSON HTTP under `/v1/*` documented as three supported access paths.
- Invalid `MEMORY_API_TOKENS` entries fail deterministically at startup.
- A failed `unarchive_memory` after partial restore must leave no active restored duplicate and must not mark the archive unarchived.
- English and Korean mirror docs must be updated together where a mirror exists.
- Migration docs must say the current range is `001-009`; new migrations append the next unused number after that range.
- Backup docs must distinguish Qdrant backend from pgvector backend.
- Required gates after all tasks: `npm run typecheck`, `npm test`, and `docker build -f docker/app.Dockerfile .` when Docker is available.

---

## File Structure

- `compose.yaml` owns container env pass-through and app healthcheck wiring.
- `docker/app.Dockerfile` owns runtime packages required by container healthchecks.
- `tests/scripts/compose-config.test.ts` pins high-risk Compose contracts without requiring Docker.
- `src/app/middleware/bearer-auth.ts` owns `MEMORY_API_TOKENS` parsing and bearer matching.
- `tests/app/bearer-auth.test.ts` pins valid and invalid token parsing.
- `src/store/memory-archive-repository.ts` owns archive SQL and the new org-scoped restored-record cleanup method.
- `src/compact/unarchive-compaction.ts` owns restore orchestration and compensation around chunk, embedding, vector, and archive-mark failures.
- `tests/compact/unarchive-compaction.test.ts` pins compensation behavior.
- `src/search/scored-candidate.ts` owns internal candidate and score types for future hybrid retrieval.
- `src/search/rank-results.ts` owns pure deterministic scoring and ranking helpers.
- `src/search/retrieve-memory.ts` owns vector-hit score preservation and candidate construction before hydration ranking.
- `tests/search/rank-results.test.ts` and `tests/search/retrieve-memory.test.ts` pin scoring, tie-breaking, and vector-score propagation.
- `tests/scripts/public-docs-drift.test.ts` pins stable documentation facts.
- Public docs updated in this wave: `AGENTS.md`, `CONTRIBUTING.md`, `CONTRIBUTING.ko.md`, `README.ko.md`, `CHANGELOG.md`, `CHANGELOG.ko.md`, `docs/architecture.md`, `docs/architecture.ko.md`, `docs/security.md`, `docs/security.ko.md`, `docs/api-reference.md`, `docs/api-reference.ko.md`, `docs/operations.md`, `docs/operations.ko.md`, `docs/self-hosted-operations.md`, and `docs/self-hosted-operations.ko.md`.

---

### Task 1: Production Compose And Bearer Token Hardening

**Files:**
- Modify: `src/app/middleware/bearer-auth.ts`
- Modify: `tests/app/bearer-auth.test.ts`
- Modify: `compose.yaml`
- Modify: `docker/app.Dockerfile`
- Create: `tests/scripts/compose-config.test.ts`

**Interfaces:**
- Consumes: existing `loadBearerTokens(env: NodeJS.ProcessEnv): BearerToken[]`.
- Produces: same `loadBearerTokens` signature, now throwing `Error` for invalid non-empty entries.
- Produces: Compose app env entries for `MEMORY_API_TOKENS`, `LEGACY_ANONYMOUS_SEARCH`, `LOG_LEVEL`, embedding vars, vector vars, sweeper vars, backup vars, and `RATE_LIMIT_PER_MINUTE`.
- Produces: Compose app healthcheck probing `http://127.0.0.1:$${PORT:-8787}/readyz`.

- [ ] **Step 1: Add failing bearer-token parsing tests**

Add these cases inside the existing `describe("loadBearerTokens", ...)` block in `tests/app/bearer-auth.test.ts`. Replace the current trailing-colon test because trailing colon is invalid after this task.

```ts
  it("rejects a token binding with an empty organization id", () => {
    expect(() =>
      loadBearerTokens({ MEMORY_API_TOKENS: "my-token:" }),
    ).toThrow(/Invalid MEMORY_API_TOKENS entry: organization id is empty/i);
  });

  it("rejects a token binding with an empty token", () => {
    expect(() =>
      loadBearerTokens({ MEMORY_API_TOKENS: ":dev-team" }),
    ).toThrow(/Invalid MEMORY_API_TOKENS entry: token is empty/i);
  });

  it("rejects entries with multiple colons", () => {
    expect(() =>
      loadBearerTokens({ MEMORY_API_TOKENS: "alpha:dev:team" }),
    ).toThrow(/Invalid MEMORY_API_TOKENS entry: tokens may contain at most one colon/i);
  });

  it("ignores empty comma-separated entries while still parsing valid tokens", () => {
    const tokens = loadBearerTokens({
      MEMORY_API_TOKENS: "alpha-token:dev-team,  , legacy-token",
    });

    expect(tokens).toEqual([
      { token: "alpha-token", organizationId: "dev-team" },
      { token: "legacy-token" },
    ]);
  });
```

- [ ] **Step 2: Run bearer-token tests and verify failure**

Run:

```bash
npm test -- tests/app/bearer-auth.test.ts
```

Expected: FAIL because `my-token:` is currently accepted as a plain token, `:dev-team` currently produces an empty token, and `alpha:dev:team` currently parses silently.

- [ ] **Step 3: Harden `parseBearerEntry`**

In `src/app/middleware/bearer-auth.ts`, replace `parseBearerEntry` with this complete function:

```ts
function parseBearerEntry(entry: string): BearerToken {
  const colonMatches = entry.match(/:/g) ?? [];
  if (colonMatches.length > 1) {
    throw new Error(
      "Invalid MEMORY_API_TOKENS entry: tokens may contain at most one colon",
    );
  }

  const colonIndex = entry.indexOf(":");
  if (colonIndex === -1) {
    const token = entry.trim();
    if (token.length === 0) {
      throw new Error("Invalid MEMORY_API_TOKENS entry: token is empty");
    }
    return { token };
  }

  const token = entry.slice(0, colonIndex).trim();
  const organizationId = entry.slice(colonIndex + 1).trim();

  if (token.length === 0) {
    throw new Error("Invalid MEMORY_API_TOKENS entry: token is empty");
  }
  if (organizationId.length === 0) {
    throw new Error(
      "Invalid MEMORY_API_TOKENS entry: organization id is empty",
    );
  }

  return { token, organizationId };
}
```

- [ ] **Step 4: Run bearer-token tests and verify pass**

Run:

```bash
npm test -- tests/app/bearer-auth.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add failing Compose drift tests**

Create `tests/scripts/compose-config.test.ts`:

```ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const REQUIRED_APP_ENV = [
  "BACKUP_DIR",
  "BACKUP_TARGET_DIR",
  "BACKUP_TARGET_HOST",
  "COMPACTION_SWEEP_ENABLED",
  "COMPACTION_SWEEP_INTERVAL_MS",
  "DATABASE_URL",
  "EMBEDDING_DIMENSIONS",
  "EMBEDDING_MODEL",
  "EMBEDDING_PROVIDER",
  "HOST",
  "INGEST_SWEEP_ENABLED",
  "INGEST_SWEEP_INTERVAL_MS",
  "LEGACY_ANONYMOUS_SEARCH",
  "LOG_LEVEL",
  "MEMORY_API_TOKENS",
  "NODE_ENV",
  "OPENAI_API_KEY",
  "OPENAI_EMBEDDING_MODEL",
  "PORT",
  "POSTGRES_DB",
  "POSTGRES_PASSWORD",
  "POSTGRES_USER",
  "QDRANT_API_KEY",
  "QDRANT_COLLECTION_NAME",
  "QDRANT_URL",
  "RATE_LIMIT_PER_MINUTE",
  "TRANSFORMERS_EMBEDDING_MODEL",
  "VECTOR_BACKEND",
] as const;

function read(path: string): string {
  return fs.readFileSync(path, "utf8");
}

describe("compose app service contract", () => {
  it("passes all public runtime env knobs through to the app container", () => {
    const compose = read("compose.yaml");

    for (const name of REQUIRED_APP_ENV) {
      expect(compose).toMatch(new RegExp(`^\\s+${name}:\\s+`, "m"));
    }
  });

  it("defines an unauthenticated readiness healthcheck for the app container", () => {
    const compose = read("compose.yaml");

    expect(compose).toContain("healthcheck:");
    expect(compose).toContain("/readyz");
    expect(compose).toContain("127.0.0.1");
    expect(compose).toContain("CMD-SHELL");
  });

  it("installs curl in the runtime image for the Compose readiness probe", () => {
    const dockerfile = read("docker/app.Dockerfile");

    expect(dockerfile).toContain("apk add --no-cache curl");
  });
});
```

- [ ] **Step 6: Run Compose drift tests and verify failure**

Run:

```bash
npm test -- tests/scripts/compose-config.test.ts
```

Expected: FAIL because `compose.yaml` is missing several app env pass-through entries, has no app healthcheck, and `docker/app.Dockerfile` does not install `curl`.

- [ ] **Step 7: Update Compose app environment and healthcheck**

In `compose.yaml`, expand `services.app.environment` to include these exact keys. Preserve existing local-development defaults where already present.

```yaml
      BACKUP_DIR: ${BACKUP_DIR:-/var/lib/developer-memory-os/backups}
      BACKUP_TARGET_DIR: ${BACKUP_TARGET_DIR:-}
      BACKUP_TARGET_HOST: ${BACKUP_TARGET_HOST:-}
      COMPACTION_SWEEP_ENABLED: ${COMPACTION_SWEEP_ENABLED:-false}
      COMPACTION_SWEEP_INTERVAL_MS: ${COMPACTION_SWEEP_INTERVAL_MS:-30000}
      DATABASE_URL: postgres://${POSTGRES_USER:-memory}:${POSTGRES_PASSWORD:-memory}@postgres:5432/${POSTGRES_DB:-memory_os}
      EMBEDDING_DIMENSIONS: ${EMBEDDING_DIMENSIONS:-384}
      EMBEDDING_MODEL: ${EMBEDDING_MODEL:-local-deterministic-v1}
      EMBEDDING_PROVIDER: ${EMBEDDING_PROVIDER:-transformers}
      HOST: 0.0.0.0
      INGEST_SWEEP_ENABLED: ${INGEST_SWEEP_ENABLED:-false}
      INGEST_SWEEP_INTERVAL_MS: ${INGEST_SWEEP_INTERVAL_MS:-30000}
      LEGACY_ANONYMOUS_SEARCH: ${LEGACY_ANONYMOUS_SEARCH:-false}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      MEMORY_API_TOKENS: ${MEMORY_API_TOKENS:-}
      NODE_ENV: ${NODE_ENV:-production}
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      OPENAI_EMBEDDING_MODEL: ${OPENAI_EMBEDDING_MODEL:-text-embedding-3-small}
      PORT: ${PORT:-8787}
      POSTGRES_DB: ${POSTGRES_DB:-memory_os}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-memory}
      POSTGRES_USER: ${POSTGRES_USER:-memory}
      QDRANT_API_KEY: ${QDRANT_API_KEY:-local-qdrant-key}
      QDRANT_COLLECTION_NAME: ${QDRANT_COLLECTION_NAME:-memory_chunks_v1}
      QDRANT_URL: ${QDRANT_URL:-http://qdrant:6333}
      RATE_LIMIT_PER_MINUTE: ${RATE_LIMIT_PER_MINUTE:-60}
      TRANSFORMERS_EMBEDDING_MODEL: ${TRANSFORMERS_EMBEDDING_MODEL:-Xenova/all-MiniLM-L6-v2}
      VECTOR_BACKEND: ${VECTOR_BACKEND:-qdrant}
```

Under `services.app`, add this healthcheck sibling to `ports` and `volumes`:

```yaml
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "curl -fsS \"http://127.0.0.1:$${PORT:-8787}/readyz\" >/dev/null",
        ]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 20s
```

- [ ] **Step 8: Install curl in the runtime image**

In `docker/app.Dockerfile`, add the package installation before creating the non-root user:

```dockerfile
RUN apk add --no-cache curl

RUN addgroup -S -g 10001 akasha \
  && adduser -S -D -H -u 10001 -G akasha akasha \
  && mkdir -p /var/lib/developer-memory-os/backups
```

- [ ] **Step 9: Run focused Task 1 tests**

Run:

```bash
npm test -- tests/app/bearer-auth.test.ts tests/scripts/compose-config.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit Task 1**

Run:

```bash
git add src/app/middleware/bearer-auth.ts tests/app/bearer-auth.test.ts compose.yaml docker/app.Dockerfile tests/scripts/compose-config.test.ts
git commit -m "fix: harden compose and bearer token config"
```

---

### Task 2: Atomic Unarchive Compensation

**Files:**
- Modify: `src/store/memory-archive-repository.ts`
- Modify: `src/compact/unarchive-compaction.ts`
- Modify: `tests/compact/unarchive-compaction.test.ts`
- Modify: `tests/compact/apply-compaction.test.ts`
- Modify: `tests/compact/outbox-sweeper.test.ts`
- Modify: `tests/compact/sweeper-loop.test.ts`

**Interfaces:**
- Consumes: existing `MemoryArchiveRepository.restoreToCanonical`.
- Produces: `MemoryArchiveRepository.deleteRestoredCanonicalRecord(recordId: number, organizationId: string): Promise<void>`.
- Consumes: existing `VectorIndex.delete(ids: string[], options?: { organizationId?: string })`.
- Produces: failed restore outcomes that preserve the original error while best-effort cleanup logs compensation errors.

- [ ] **Step 1: Add failing unarchive compensation tests**

In `tests/compact/unarchive-compaction.test.ts`, extend the `makeRepo` return type with `deleteRestoredCanonicalRecord`, add the default mock, and add these tests inside `describe("unarchiveCompaction (failure isolation)", ...)`:

```ts
  it("deletes the restored canonical row when embedding fails after restore", async () => {
    const repo = makeRepo([makeArchive({ id: 50 })]);
    const deps = makeDeps(repo);
    (deps.embeddings.embedBatch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("embedding provider unavailable"),
    );

    const result = await unarchiveCompaction(
      { archiveIds: [50], organizationId: "org-a", actor: "ops" },
      deps,
    );

    expect(result.outcomes[0]).toEqual({
      archiveId: 50,
      status: "failed",
      error: "embedding provider unavailable",
    });
    expect(repo.deleteRestoredCanonicalRecord).toHaveBeenCalledWith(999, "org-a");
    expect(deps.vectorIndex.delete).not.toHaveBeenCalled();
    expect(repo.markUnarchived).not.toHaveBeenCalled();
  });

  it("deletes vector points and the restored row when chunk point updates fail", async () => {
    const repo = makeRepo([makeArchive({ id: 50 })]);
    const deps = makeDeps(repo);
    (deps.chunkRepository.updatePointIds as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("chunk update failed"));

    const result = await unarchiveCompaction(
      { archiveIds: [50], organizationId: "org-a", actor: "ops" },
      deps,
    );

    expect(result.outcomes[0]).toEqual({
      archiveId: 50,
      status: "failed",
      error: "chunk update failed",
    });
    expect(deps.vectorIndex.delete).toHaveBeenCalledWith(
      ["memory:999:chunk:7000"],
      { organizationId: "org-a" },
    );
    expect(repo.deleteRestoredCanonicalRecord).toHaveBeenCalledWith(999, "org-a");
    expect(repo.markUnarchived).not.toHaveBeenCalled();
  });

  it("preserves the original failure when vector cleanup also fails", async () => {
    const repo = makeRepo([makeArchive({ id: 50 })]);
    const deps = makeDeps(repo);
    (deps.chunkRepository.updatePointIds as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("chunk update failed"));
    (deps.vectorIndex.delete as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("vector cleanup failed"));

    const result = await unarchiveCompaction(
      { archiveIds: [50], organizationId: "org-a", actor: "ops" },
      deps,
    );

    expect(result.outcomes[0]).toEqual({
      archiveId: 50,
      status: "failed",
      error: "chunk update failed",
    });
    expect(repo.deleteRestoredCanonicalRecord).toHaveBeenCalledWith(999, "org-a");
    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "compact.unarchive_vector_compensation_failed",
        archiveId: 50,
      }),
      "failed to delete vector points after unarchive failure",
    );
  });
```

Also add this property to the `makeRepo` return type intersection and default object:

```ts
  deleteRestoredCanonicalRecord: ReturnType<typeof vi.fn>;
```

```ts
    deleteRestoredCanonicalRecord: vi.fn().mockResolvedValue(undefined),
```

- [ ] **Step 2: Run unarchive tests and verify failure**

Run:

```bash
npm test -- tests/compact/unarchive-compaction.test.ts
```

Expected: FAIL because the repository interface has no cleanup method and the orchestrator does not compensate partial restores.

- [ ] **Step 3: Add the repository cleanup method**

In `src/store/memory-archive-repository.ts`, add this method to `MemoryArchiveRepository`:

```ts
  deleteRestoredCanonicalRecord(
    recordId: number,
    organizationId: string,
  ): Promise<void>;
```

Add this implementation near `restoreToCanonical`:

```ts
    async deleteRestoredCanonicalRecord(recordId, organizationId) {
      await pool.query(
        `
          DELETE FROM memory_records
          WHERE id = $1
            AND organization_id = $2
        `,
        [recordId, organizationId],
      );
    },
```

This uses the canonical `memory_records` cascade path so restored chunks and ingest jobs are removed by existing foreign keys.

- [ ] **Step 4: Update existing typed repository mocks**

In `tests/compact/apply-compaction.test.ts`, `tests/compact/outbox-sweeper.test.ts`, and `tests/compact/sweeper-loop.test.ts`, add this property to each object typed as `MemoryArchiveRepository`:

```ts
    deleteRestoredCanonicalRecord: vi.fn().mockResolvedValue(undefined),
```

If a helper creates the repo object, add the property inside that helper so every test instance satisfies the expanded interface.

- [ ] **Step 5: Add compensation in `restoreOne`**

In `src/compact/unarchive-compaction.ts`, wrap the body of `restoreOne` after variable initialization so it tracks restored record and upserted points. The complete control shape should be:

```ts
async function restoreOne(
  archive: ArchiveRow,
  organizationId: string,
  deps: UnarchiveCompactionDeps,
): Promise<UnarchiveOutcome> {
  let restoredRecordId: number | null = null;
  let upsertedPointIds: string[] = [];

  try {
    const restored = await deps.archiveRepository.restoreToCanonical(
      archive,
      organizationId,
    );
    restoredRecordId = restored.restoredRecordId;

    const restoredRecord: SearchMemoryResult = {
      id: restoredRecordId,
      organizationId,
      sourceId: archive.sourceId!,
      scopeType: archive.scopeType as ScopeType,
      scopeId: archive.scopeId,
      projectKey: archive.projectKey,
      memoryType: archive.kind as MemoryType,
      title: archive.title,
      content: archive.content,
      summary: archive.summary,
      durability: archive.durability as Durability,
      importance: archive.importance,
      createdAt: archive.originalCreatedAt,
      updatedAt: archive.originalUpdatedAt,
      source: {
        id: archive.sourceId!,
        scopeType: archive.scopeType as ScopeType,
        scopeId: archive.scopeId,
        sourceType: "document" as SourceType,
        externalId: `restored-from-archive-${archive.id}`,
        title: archive.title,
        uri: null,
        createdAt: archive.originalCreatedAt,
      },
    };

    const chunks = chunkText({
      text: archive.content,
      targetTokens: deps.embedding.targetTokens,
      overlapTokens: deps.embedding.overlapTokens,
    });
    const storedChunks = await deps.chunkRepository.insertChunks({
      record: restoredRecord,
      chunks,
      embedding: deps.embedding,
    });

    const embeddings = await deps.embeddings.embedBatch(
      storedChunks.map((chunk) => chunk.content),
    );
    if (embeddings.length !== storedChunks.length) {
      throw new Error(
        `unarchive embedBatch returned ${embeddings.length} vectors for ${storedChunks.length} chunks`,
      );
    }

    const points: VectorPoint[] = storedChunks.map((chunk, index) =>
      buildVectorPoint({
        chunkId: chunk.id,
        vector: embeddings[index] ?? [],
        memoryRecordId: restoredRecord.id,
        organizationId,
        scopeType: restoredRecord.scopeType,
        scopeId: restoredRecord.scopeId,
        projectKey: restoredRecord.projectKey ?? null,
        kind: restoredRecord.memoryType,
        durability: restoredRecord.durability ?? "ephemeral",
        updatedAt: restoredRecord.updatedAt,
        embeddingVersion: chunk.embeddingVersion,
      }),
    );

    if (points.length > 0) {
      await deps.vectorIndex.upsert(points);
      upsertedPointIds = points.map((point) => point.id);
      await deps.chunkRepository.updatePointIds(
        points.map((point, index) => ({
          chunkId: storedChunks[index]!.id,
          qdrantPointId: point.id,
        })),
      );
    }

    await deps.archiveRepository.markUnarchived(archive.id);

    return {
      archiveId: archive.id,
      status: "restored",
      restoredRecordId,
      sourceRecordId: archive.sourceRecordId,
      chunkCount: storedChunks.length,
    };
  } catch (err: unknown) {
    await compensateFailedRestore({
      archiveId: archive.id,
      organizationId,
      restoredRecordId,
      upsertedPointIds,
      deps,
    });
    throw err;
  }
}
```

Add this helper below `restoreOne`:

```ts
async function compensateFailedRestore(args: {
  archiveId: number;
  organizationId: string;
  restoredRecordId: number | null;
  upsertedPointIds: string[];
  deps: UnarchiveCompactionDeps;
}): Promise<void> {
  if (args.upsertedPointIds.length > 0) {
    try {
      await args.deps.vectorIndex.delete(args.upsertedPointIds, {
        organizationId: args.organizationId,
      });
    } catch (err: unknown) {
      args.deps.logger.error(
        {
          event: "compact.unarchive_vector_compensation_failed",
          archiveId: args.archiveId,
          err,
        },
        "failed to delete vector points after unarchive failure",
      );
    }
  }

  if (args.restoredRecordId !== null) {
    try {
      await args.deps.archiveRepository.deleteRestoredCanonicalRecord(
        args.restoredRecordId,
        args.organizationId,
      );
    } catch (err: unknown) {
      args.deps.logger.error(
        {
          event: "compact.unarchive_sql_compensation_failed",
          archiveId: args.archiveId,
          restoredRecordId: args.restoredRecordId,
          err,
        },
        "failed to delete restored canonical record after unarchive failure",
      );
    }
  }
}
```

- [ ] **Step 6: Run focused Task 2 tests**

Run:

```bash
npm test -- tests/compact/unarchive-compaction.test.ts tests/compact/apply-compaction.test.ts tests/compact/outbox-sweeper.test.ts tests/compact/sweeper-loop.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git add src/store/memory-archive-repository.ts src/compact/unarchive-compaction.ts tests/compact/unarchive-compaction.test.ts tests/compact/apply-compaction.test.ts tests/compact/outbox-sweeper.test.ts tests/compact/sweeper-loop.test.ts
git commit -m "fix: compensate failed unarchive restores"
```

---

### Task 3: Retrieval Scoring Foundation

**Files:**
- Create: `src/search/scored-candidate.ts`
- Modify: `src/search/rank-results.ts`
- Modify: `src/search/retrieve-memory.ts`
- Modify: `tests/search/rank-results.test.ts`
- Modify: `tests/search/retrieve-memory.test.ts`

**Interfaces:**
- Produces: `CandidateSource = "vector" | "lexical"`.
- Produces: `RetrievedMemoryCandidate` internal type with `record`, `source`, `scores`, and `reasons`.
- Produces: `rankCandidates(candidates: readonly RetrievedMemoryCandidate[]): RetrievedMemoryCandidate[]`.
- Preserves: `rankResults(records: readonly SearchMemoryResult[]): SearchMemoryResult[]`.
- Preserves: `retrieveMemory(input): Promise<SearchMemoryResult[]>` public return shape.

- [ ] **Step 1: Add failing ranker tests for score components and vector score ordering**

In `tests/search/rank-results.test.ts`, update the import and add tests:

```ts
import {
  buildRetrievedMemoryCandidate,
  rankCandidates,
  rankResults,
  scoreSearchResult,
} from "../../src/search/rank-results.js";
```

Append:

```ts
  it("exposes deterministic internal score components", () => {
    const record = createResult({
      id: 31,
      memoryType: "decision",
      content: "Decision: keep deterministic ranking helpers.",
      updatedAt: "2026-03-28T10:00:00.000Z",
      source: { sourceType: "decision" },
    });

    const candidate = scoreSearchResult(record, {
      newestUpdatedAt: Date.parse("2026-03-28T10:00:00.000Z"),
      vectorScore: 0.4,
      source: "vector",
    });

    expect(candidate.source).toBe("vector");
    expect(candidate.scores.vector).toBeCloseTo(20);
    expect(candidate.scores.scope).toBe(1000);
    expect(candidate.scores.metadata).toBe(150);
    expect(candidate.scores.recency).toBe(25);
    expect(candidate.scores.total).toBeCloseTo(1195);
    expect(candidate.reasons).toEqual(
      expect.arrayContaining([
        "scope:project",
        "memoryType:decision",
        "sourceType:decision",
        "recency:25",
        "vector:20",
      ]),
    );
  });

  it("uses vector score to order records when metadata ties", () => {
    const lowerVector = buildRetrievedMemoryCandidate(
      createResult({
        id: 41,
        memoryType: "summary",
        content: "Project retrieval summary A.",
        updatedAt: "2026-03-28T10:00:00.000Z",
      }),
      { source: "vector", vectorScore: 0.2 },
    );
    const higherVector = buildRetrievedMemoryCandidate(
      createResult({
        id: 42,
        memoryType: "summary",
        content: "Project retrieval summary B.",
        updatedAt: "2026-03-28T10:00:00.000Z",
      }),
      { source: "vector", vectorScore: 0.9 },
    );

    const ranked = rankCandidates([lowerVector, higherVector]);

    expect(ranked.map((candidate) => candidate.record.id)).toEqual([42, 41]);
  });
```

- [ ] **Step 2: Add failing retrieve test for vector score propagation**

In `tests/search/retrieve-memory.test.ts`, add:

```ts
  it("preserves vector scores when ranking hydrated records", async () => {
    const vectorIndex = {
      query: vi.fn().mockResolvedValue([
        { id: "chunk:12", score: 0.2, payload: { memory_record_id: 12 } },
        { id: "chunk:13", score: 0.95, payload: { memory_record_id: 13 } },
      ]),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
      ensureCollection: vi.fn(),
    };

    const baseRecord = {
      sourceId: 202,
      scopeType: "project" as const,
      scopeId: "project-alpha",
      memoryType: "summary" as const,
      content: "Project retrieval summary.",
      createdAt: "2026-04-25T00:00:00.000Z",
      updatedAt: "2026-04-25T00:00:00.000Z",
      source: {
        id: 302,
        scopeType: "project" as const,
        scopeId: "project-alpha",
        sourceType: "document" as const,
        externalId: "doc",
        title: "Doc",
        uri: "file:///tmp/doc.md",
        createdAt: "2026-04-25T00:00:00.000Z",
      },
    };
    const repository = {
      getMemoryRecordsByIds: vi.fn().mockResolvedValue([
        { ...baseRecord, id: 12 },
        { ...baseRecord, id: 13 },
      ]),
    };

    const results = await retrieveMemory({
      vectorIndex: vectorIndex as never,
      repository: repository as never,
      vector: [0.1, 0.2, 0.3],
      organizationId: "dev-team",
      projectKey: "project-alpha",
      limit: 5,
    });

    expect(results.map((result) => result.id)).toEqual([13, 12]);
  });
```

- [ ] **Step 3: Run focused retrieval tests and verify failure**

Run:

```bash
npm test -- tests/search/rank-results.test.ts tests/search/retrieve-memory.test.ts
```

Expected: FAIL because scored candidate exports do not exist and vector scores are not passed into ranking.

- [ ] **Step 4: Add internal scored candidate types**

Create `src/search/scored-candidate.ts`:

```ts
import type { SearchMemoryResult } from "../types.js";

export type CandidateSource = "vector" | "lexical";

export type RetrievedMemoryCandidate = {
  record: SearchMemoryResult;
  source: CandidateSource;
  scores: {
    vector?: number;
    lexical?: number;
    scope: number;
    metadata: number;
    recency: number;
    total: number;
  };
  reasons: string[];
};
```

- [ ] **Step 5: Replace `rank-results.ts` with pure scoring helpers**

Replace `src/search/rank-results.ts` with:

```ts
import type { SearchMemoryResult } from "../types.js";
import type {
  CandidateSource,
  RetrievedMemoryCandidate,
} from "./scored-candidate.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const RANKING_WEIGHTS = {
  scope: {
    project: 1000,
    user: 0,
  },
  memoryType: {
    decision: 120,
    summary: 70,
    fact: 45,
  },
  sourceType: {
    decision: 30,
    document: 15,
    conversation: 0,
  },
  recency: {
    maxBonus: 25,
  },
  vector: {
    maxBonus: 50,
  },
  penalty: {
    genericNote: 35,
  },
} as const;

export { type CandidateSource, type RetrievedMemoryCandidate };

export type ScoreSearchResultOptions = {
  newestUpdatedAt: number;
  source?: CandidateSource;
  vectorScore?: number;
  lexicalScore?: number;
};

export function rankResults(
  records: readonly SearchMemoryResult[],
): SearchMemoryResult[] {
  if (records.length <= 1) {
    return [...records];
  }

  const newestUpdatedAt = newestUpdatedAtFor(records);
  return rankCandidates(
    records.map((record) =>
      scoreSearchResult(record, {
        newestUpdatedAt,
        source: "vector",
      }),
    ),
  ).map((candidate) => candidate.record);
}

export function rankCandidates(
  candidates: readonly RetrievedMemoryCandidate[],
): RetrievedMemoryCandidate[] {
  return [...candidates].sort((left, right) => {
    const scoreDiff = right.scores.total - left.scores.total;
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const updatedAtDiff =
      Date.parse(right.record.updatedAt) - Date.parse(left.record.updatedAt);
    if (updatedAtDiff !== 0) {
      return updatedAtDiff;
    }

    return right.record.id - left.record.id;
  });
}

export function buildRetrievedMemoryCandidate(
  record: SearchMemoryResult,
  options: Omit<ScoreSearchResultOptions, "newestUpdatedAt"> = {},
): RetrievedMemoryCandidate {
  return scoreSearchResult(record, {
    ...options,
    newestUpdatedAt: Date.parse(record.updatedAt),
  });
}

export function scoreSearchResult(
  record: SearchMemoryResult,
  options: ScoreSearchResultOptions,
): RetrievedMemoryCandidate {
  const reasons: string[] = [];
  const scope = scopeScore(record, reasons);
  const metadata = metadataScore(record, reasons);
  const recency = recencyScore(record.updatedAt, options.newestUpdatedAt, reasons);
  const vector = vectorScore(options.vectorScore, reasons);
  const lexical = lexicalScore(options.lexicalScore, reasons);
  const total = scope + metadata + recency + (vector ?? 0) + (lexical ?? 0);

  return {
    record,
    source: options.source ?? "vector",
    scores: {
      ...(vector === undefined ? {} : { vector }),
      ...(lexical === undefined ? {} : { lexical }),
      scope,
      metadata,
      recency,
      total,
    },
    reasons,
  };
}

export function newestUpdatedAtFor(
  records: readonly SearchMemoryResult[],
): number {
  return Math.max(...records.map((record) => Date.parse(record.updatedAt)));
}

function scopeScore(
  record: SearchMemoryResult,
  reasons: string[],
): number {
  const score =
    record.scopeType === "project"
      ? RANKING_WEIGHTS.scope.project
      : RANKING_WEIGHTS.scope.user;
  reasons.push(`scope:${record.scopeType}`);
  return score;
}

function metadataScore(
  record: SearchMemoryResult,
  reasons: string[],
): number {
  const memoryType = RANKING_WEIGHTS.memoryType[record.memoryType];
  const sourceType = RANKING_WEIGHTS.sourceType[record.source.sourceType];
  let total = memoryType + sourceType;

  reasons.push(`memoryType:${record.memoryType}`);
  reasons.push(`sourceType:${record.source.sourceType}`);

  if (looksGeneric(record)) {
    total -= RANKING_WEIGHTS.penalty.genericNote;
    reasons.push("penalty:generic-note");
  }

  return total;
}

function recencyScore(
  updatedAt: string,
  newestUpdatedAt: number,
  reasons: string[],
): number {
  const updatedAtTime = Date.parse(updatedAt);
  const dayDistance = Math.max(0, (newestUpdatedAt - updatedAtTime) / DAY_IN_MS);
  const score = Math.max(
    0,
    RANKING_WEIGHTS.recency.maxBonus - Math.floor(dayDistance),
  );
  reasons.push(`recency:${score}`);
  return score;
}

function vectorScore(
  rawScore: number | undefined,
  reasons: string[],
): number | undefined {
  if (rawScore === undefined) {
    return undefined;
  }
  const score =
    clampUnitScore(rawScore) * RANKING_WEIGHTS.vector.maxBonus;
  reasons.push(`vector:${score}`);
  return score;
}

function lexicalScore(
  rawScore: number | undefined,
  reasons: string[],
): number | undefined {
  if (rawScore === undefined) {
    return undefined;
  }
  const score = clampUnitScore(rawScore) * RANKING_WEIGHTS.vector.maxBonus;
  reasons.push(`lexical:${score}`);
  return score;
}

function clampUnitScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.min(1, Math.max(0, score));
}

function looksGeneric(record: SearchMemoryResult): boolean {
  if (record.memoryType === "decision") {
    return false;
  }

  if (record.source.sourceType === "conversation") {
    return true;
  }

  return /\bgeneral notes?\b|\bcaptured note\b/i.test(record.content);
}
```

- [ ] **Step 6: Preserve vector hit scores in `retrieve-memory.ts`**

In `src/search/retrieve-memory.ts`, replace the `rankResults` import and ranking path with scored candidates:

```ts
import {
  rankCandidates,
  scoreSearchResult,
  newestUpdatedAtFor,
} from "./rank-results.js";
```

Replace:

```ts
  const ids = uniqueMemoryRecordIds(responses.flat());
```

with:

```ts
  const hits = responses.flat();
  const ids = uniqueMemoryRecordIds(hits);
```

Replace:

```ts
  return rankResults(hydratedRecords).slice(0, input.limit);
```

with:

```ts
  const vectorScores = maxVectorScoresByRecordId(hits);
  const newestUpdatedAt = newestUpdatedAtFor(hydratedRecords);
  return rankCandidates(
    hydratedRecords.map((record) =>
      scoreSearchResult(record, {
        newestUpdatedAt,
        source: "vector",
        vectorScore: vectorScores.get(record.id),
      }),
    ),
  )
    .map((candidate) => candidate.record)
    .slice(0, input.limit);
```

Add this helper below `uniqueMemoryRecordIds`:

```ts
function maxVectorScoresByRecordId(hits: VectorHit[]): Map<number, number> {
  const scores = new Map<number, number>();

  for (const hit of hits) {
    const id = hit.payload?.memory_record_id;
    if (typeof id !== "number") {
      continue;
    }

    const existing = scores.get(id);
    if (existing === undefined || hit.score > existing) {
      scores.set(id, hit.score);
    }
  }

  return scores;
}
```

- [ ] **Step 7: Run focused Task 3 tests**

Run:

```bash
npm test -- tests/search/rank-results.test.ts tests/search/retrieve-memory.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

Run:

```bash
git add src/search/scored-candidate.ts src/search/rank-results.ts src/search/retrieve-memory.ts tests/search/rank-results.test.ts tests/search/retrieve-memory.test.ts
git commit -m "feat: add internal retrieval score components"
```

---

### Task 4: Public Documentation Drift Fixes

**Files:**
- Modify: `AGENTS.md`
- Modify: `CONTRIBUTING.md`
- Modify: `CONTRIBUTING.ko.md`
- Modify: `README.ko.md`
- Modify: `CHANGELOG.md`
- Modify: `CHANGELOG.ko.md`
- Modify: `docs/architecture.md`
- Modify: `docs/architecture.ko.md`
- Modify: `docs/security.md`
- Modify: `docs/security.ko.md`
- Modify: `docs/api-reference.md`
- Modify: `docs/api-reference.ko.md`
- Modify: `docs/operations.md`
- Modify: `docs/operations.ko.md`
- Modify: `docs/self-hosted-operations.md`
- Modify: `docs/self-hosted-operations.ko.md`
- Modify: `tests/scripts/public-docs-drift.test.ts`

**Interfaces:**
- Consumes: source truth from `src/db/migrations/001_*` through `009_*`, `src/mcp/tool-schemas.ts`, `src/app/mcp-http.ts`, and `package.json` backup scripts.
- Produces: docs that match current transports, schemas, migrations, and backup behavior.
- Produces: drift tests that assert stable facts rather than whole paragraphs.

- [ ] **Step 1: Add failing public docs drift tests**

Append these tests to `tests/scripts/public-docs-drift.test.ts`:

```ts
  it("documents the current migration range and next migration number", () => {
    const files = [
      "AGENTS.md",
      "CONTRIBUTING.md",
      "CONTRIBUTING.ko.md",
      "docs/architecture.md",
      "docs/architecture.ko.md",
      "docs/operations.md",
      "docs/operations.ko.md",
    ];

    for (const path of files) {
      const text = read(path);
      expect(text).toContain("001-009");
      expect(text).not.toContain("001–008");
      expect(text).not.toContain("001-008");
    }

    expect(read("CONTRIBUTING.md")).toContain("010_");
    expect(read("CONTRIBUTING.ko.md")).toContain("010_");
  });

  it("documents all three public transports in architecture and security docs", () => {
    for (const path of [
      "docs/architecture.md",
      "docs/architecture.ko.md",
      "docs/security.md",
      "docs/security.ko.md",
    ]) {
      const text = read(path);
      expect(text).toContain("/mcp");
      expect(text).toContain("/v1/*");
      expect(text).toContain("MCP Streamable HTTP");
    }
  });

  it("keeps API reference examples aligned with tool schemas and context-pack output", () => {
    const api = read("docs/api-reference.md");
    const apiKo = read("docs/api-reference.ko.md");

    expect(api).toContain("decision | summary | fact");
    expect(apiKo).toContain("decision | summary | fact");
    expect(api).toContain("sections: {");
    expect(apiKo).toContain("sections: {");
    expect(api).toContain("project_summary");
    expect(apiKo).toContain("project_summary");
    expect(api).toContain("structuredContent");
    expect(apiKo).toContain("structuredContent");
    expect(api).toContain("text content item");
    expect(apiKo).toContain("text content item");
  });

  it("records PR 19 MCP changes in both changelogs", () => {
    for (const path of ["CHANGELOG.md", "CHANGELOG.ko.md"]) {
      const text = read(path);
      expect(text).toContain("#19");
      expect(text).toContain("/mcp");
      expect(text).toContain("resources");
      expect(text).toContain("prompts");
      expect(text).toContain("structured");
    }
  });

  it("documents backup differences for Qdrant and pgvector backends", () => {
    for (const path of [
      "docs/operations.md",
      "docs/operations.ko.md",
      "docs/self-hosted-operations.md",
      "docs/self-hosted-operations.ko.md",
    ]) {
      const text = read(path);
      expect(text).toContain("VECTOR_BACKEND=qdrant");
      expect(text).toContain("VECTOR_BACKEND=pgvector");
      expect(text).toContain("Postgres");
      expect(text).toContain("Qdrant");
    }
  });
```

- [ ] **Step 2: Run docs drift tests and verify failure**

Run:

```bash
npm test -- tests/scripts/public-docs-drift.test.ts
```

Expected: FAIL because migration range, security `/mcp` surface, changelog #19 entries, and backup backend distinctions are incomplete.

- [ ] **Step 3: Update migration documentation**

Make these exact semantic edits:

- `AGENTS.md`: replace `001–008` with `001-009`.
- `CONTRIBUTING.md`: replace the migration paragraph with wording that says current files are `001-009`, the next migration should be `010_*.sql`, and future changes append the next unused number after the current range.
- `CONTRIBUTING.ko.md`: make the same Korean mirror change and include literal `001-009` and `010_`.
- `docs/architecture.md`: replace the schema migration paragraph so it says the runner applies `001` through `009`, and `009_memory_archive_qdrant_retry.sql` supplies archive Qdrant retry metadata.
- `docs/architecture.ko.md`: make the Korean mirror change and include literal `001-009`.
- `docs/operations.md` and `docs/operations.ko.md`: add a short operator note that migrations currently span `001-009` and new migrations append the next unused number.

- [ ] **Step 4: Update architecture transport docs**

In `docs/architecture.md` and `docs/architecture.ko.md`, edit the Layers diagram and surrounding text so the transport layer names:

```text
src/mcp/server.ts          → MCP SDK stdio
src/app/mcp-http.ts        → MCP Streamable HTTP at /mcp
src/app/routes/memory.ts   → JSON HTTP under /v1/*
```

Also update read data flow language from Qdrant-only phrasing to active vector backend phrasing:

```text
vectorIndex.query → Qdrant or pgvector (scope-filtered similarity)
```

- [ ] **Step 5: Update security docs for `/mcp`**

In `docs/security.md` and `docs/security.ko.md`, add an HTTP attack-surface subsection stating these facts:

- `/mcp` is an HTTP endpoint and must be treated like `/v1/*`.
- When `MEMORY_API_TOKENS` is configured, `/mcp` requires bearer auth.
- `/mcp` shares the same rate limiter as JSON HTTP.
- Origin validation in `src/app/mcp-http.ts` rejects untrusted browser-origin requests.
- `/healthz` and `/readyz` remain unauthenticated.
- Empty token lists are only acceptable for loopback local development; non-loopback binds fail closed.

- [ ] **Step 6: Update API reference schema docs**

In `docs/api-reference.md` and `docs/api-reference.ko.md`, make these corrections:

- `add_memory.kind` is documented exactly as `decision | summary | fact`.
- `build_context_pack.sections` is documented as an object with `project_summary`, `recent_decisions`, `constraints`, `open_questions`, and `relevant_notes` arrays.
- MCP tool responses mention `structuredContent` and one serialized JSON `text` content item for compatibility.
- Avoid contradictory "both transports" wording because the project now documents three access paths.

- [ ] **Step 7: Update Korean README Qdrant-only wording**

In `README.ko.md`, adjust these statements:

- Quick start can say the default Compose stack starts Postgres and Qdrant, but pgvector deployments can run with Postgres only.
- Data flow should say active vector backend, not only Qdrant, for search and write paths.
- `npm run backup:create` command note should say Postgres plus Qdrant snapshot when `VECTOR_BACKEND=qdrant`; pgvector vectors live in Postgres.

- [ ] **Step 8: Update changelogs for PR #19**

At the top of `CHANGELOG.md` and `CHANGELOG.ko.md` under `## [Unreleased]`, add one user-visible bullet mentioning all of:

- PR `#19`
- MCP Streamable HTTP at `/mcp`
- MCP resources
- MCP prompts
- structured MCP tool output

- [ ] **Step 9: Update backup and restore docs**

In `docs/operations.md`, `docs/operations.ko.md`, `docs/self-hosted-operations.md`, and `docs/self-hosted-operations.ko.md`, distinguish:

- `VECTOR_BACKEND=qdrant`: `npm run backup:create` captures Postgres and Qdrant snapshot data.
- `VECTOR_BACKEND=pgvector`: vectors live in Postgres; Qdrant snapshot is not part of the logical data path.
- Existing restore smoke helpers are still Qdrant-oriented and require `RESTORE_QDRANT_URL` until a later script split.

- [ ] **Step 10: Run focused Task 4 tests**

Run:

```bash
npm test -- tests/scripts/public-docs-drift.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit Task 4**

Run:

```bash
git add AGENTS.md CONTRIBUTING.md CONTRIBUTING.ko.md README.ko.md CHANGELOG.md CHANGELOG.ko.md docs/architecture.md docs/architecture.ko.md docs/security.md docs/security.ko.md docs/api-reference.md docs/api-reference.ko.md docs/operations.md docs/operations.ko.md docs/self-hosted-operations.md docs/self-hosted-operations.ko.md tests/scripts/public-docs-drift.test.ts
git commit -m "docs: close growth foundation drift"
```

---

## Final Verification

- [ ] Run typecheck:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] Run the full test suite:

```bash
npm test
```

Expected: PASS.

- [ ] Run Docker build when Docker is available:

```bash
docker build -f docker/app.Dockerfile .
```

Expected: PASS. If Docker is not available locally, record the exact Docker availability error in the final report.

- [ ] Review the branch diff:

```bash
git diff --stat main...HEAD
git diff --check main...HEAD
```

Expected: `git diff --check` prints no whitespace errors.

- [ ] Run a self-review against the accepted design:

```bash
rg -n "001[–-]008|my-token:|src/mcp/server.ts\\s+→ http|Qdrant \\(cosine|Both transports share" AGENTS.md CONTRIBUTING.md CONTRIBUTING.ko.md README.ko.md CHANGELOG.md CHANGELOG.ko.md docs src tests compose.yaml docker/app.Dockerfile
```

Expected: no matches for stale or unfinished markers. Matches for legitimate source paths that do not indicate drift should be inspected and explained before final review.

## Plan Self-Review

- Spec coverage: Task 1 covers Compose env, healthcheck, and token parsing. Task 2 covers unarchive compensation. Task 3 covers internal scored candidates, vector score preservation, score components, and future lexical boundary. Task 4 covers migration, `/mcp`, API schema, changelog, and backup documentation drift.
- Placeholder scan: this plan contains concrete paths, tests, implementation snippets, commands, and expected outcomes.
- Type consistency: `CandidateSource`, `RetrievedMemoryCandidate`, `scoreSearchResult`, `rankCandidates`, `newestUpdatedAtFor`, and `deleteRestoredCanonicalRecord` are named consistently across tasks.
- Scope check: BM25, graph memory, hooks, UI, and OAuth remain outside this wave by global constraint and are not implemented by any task.
