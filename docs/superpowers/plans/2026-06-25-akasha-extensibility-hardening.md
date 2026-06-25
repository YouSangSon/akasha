# Akasha Extensibility Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Akasha easier to extend and safer to operate by sharing tool schemas across transports, reducing MCP server file size, fixing archive cleanup claim semantics, hardening container defaults, and aligning public docs.

**Architecture:** Keep canonical Postgres as source of truth and vector indexes as derived state. Define the public tool surface once in a descriptor module, consume that descriptor from MCP registration and HTTP validation, and split the existing MCP server implementation into focused modules while preserving current public imports. Treat public docs and Korean mirrors as the user-facing documentation boundary; leave historical `docs/superpowers/**` reports as internal artifacts.

**Tech Stack:** TypeScript, zod/v4, MCP SDK, Node HTTP server, Vitest, Postgres migrations, Docker Compose, Markdown documentation with Korean mirrors.

## Global Constraints

- Do not implement on `main`; work on a feature branch off `origin/main`.
- Preserve default `EMBEDDING_PROVIDER=transformers`; `OPENAI_API_KEY` stays optional unless `EMBEDDING_PROVIDER=openai`.
- Preserve org-scoped behavior. New read/reindex/cleanup behavior must require or propagate `organizationId` instead of widening tenant scope.
- Preserve current MCP JSON text result shape: `{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }`.
- Preserve current HTTP envelope shape: successful tool calls use `sendOk(res, 200, result)`, malformed client payloads use 400, auth conflicts use 403, unhandled handler failures use static 500.
- Keep current public imports from `src/mcp/server.ts` working for CLI, tests, and scripts.
- Use TDD for production behavior changes: add a failing test, run the targeted test to observe RED, then implement.
- Keep docs bilingual where a Korean mirror exists.
- New migrations live in `src/db/migrations/`; append migration `009_memory_archive_qdrant_retry.sql` and register it in `src/db/migrate.ts`.
- Full gates are `npm run typecheck`, `npm test`, and `docker build -f docker/app.Dockerfile .` when Docker is available.

---

## File Structure

- Create `src/mcp/tool-schemas.ts`: shared tool descriptors, zod schema shapes, route mapping, and validation helper.
- Create `src/mcp/tool-utils.ts`: pure conversion helpers moved from `src/mcp/server.ts`.
- Create `src/mcp/tool-handlers.ts`: registry handler construction and canonical orchestration moved from `src/mcp/server.ts`.
- Create `src/mcp/tool-registry.ts`: `createToolRegistry()` and audit instrumentation moved from `src/mcp/server.ts`.
- Modify `src/mcp/server.ts`: retain MCP SDK construction, stdio start, result formatting, compatibility re-exports, and descriptor-driven registration.
- Modify `src/app/routes/memory.ts`: use shared descriptors for `ToolName`, route table, and zod `safeParse` validation.
- Modify `src/store/memory-archive-repository.ts`: add atomic archive cleanup claim with retry visibility.
- Modify `src/compact/outbox-sweeper.ts`: pass the claim clock and use the claimed rows.
- Create `src/db/migrations/009_memory_archive_qdrant_retry.sql`: add archive retry timestamp for visibility-timeout claiming.
- Modify `src/db/migrate.ts`: register migration 009 and mirror it in embedded SQL.
- Modify `docker/app.Dockerfile`: run the runtime stage as a non-root user with a writable backup directory.
- Modify `compose.yaml`, `.env.example`, public docs, and Korean mirrors for changed operational behavior.
- Add or update Vitest tests under `tests/mcp`, `tests/app`, `tests/store`, `tests/compact`, and `tests/scripts`.

---

### Task 1: Shared Tool Descriptors And HTTP Schema Validation

**Files:**
- Create: `src/mcp/tool-schemas.ts`
- Modify: `src/mcp/server.ts`
- Modify: `src/app/routes/memory.ts`
- Test: `tests/mcp/server.test.ts`
- Test: `tests/app/server.test.ts`

**Interfaces:**
- Produces: `TOOL_DESCRIPTORS: readonly ToolDescriptor[]`
- Produces: `TOOL_ROUTES: readonly ToolRoute[]`
- Produces: `type ToolName = keyof ToolRegistry`
- Produces: `validateToolInput(toolName: ToolName, input: Record<string, unknown>): ToolInputValidation`
- Consumes: existing `ToolRegistry` from `src/mcp/types.ts`

- [ ] **Step 1: Write failing descriptor parity tests**

Add this import to `tests/mcp/server.test.ts`:

```ts
import { TOOL_DESCRIPTORS } from "../../src/mcp/tool-schemas.js";
```

Add this test near the existing MCP schema tests:

```ts
it("declares one descriptor for every ToolRegistry method", () => {
  const descriptorNames = TOOL_DESCRIPTORS.map((descriptor) => descriptor.name).sort();
  expect(descriptorNames).toEqual([
    "add_memory",
    "build_context_pack",
    "compact_memory",
    "list_audit_log",
    "reindex_memory",
    "search_memory",
    "unarchive_memory",
  ]);

  for (const descriptor of TOOL_DESCRIPTORS) {
    expect(descriptor.description.length).toBeGreaterThan(20);
    expect(Object.keys(descriptor.inputSchema).length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Write failing HTTP validation parity tests**

Add this test to `tests/app/server.test.ts` in the `createOperatorServer` describe block:

```ts
it("rejects invalid HTTP input with the shared tool schema before dispatch", async () => {
  const res = await fetch(`${handle.baseUrl}/v1/memory/search`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tokens[0]}`,
    },
    body: JSON.stringify({
      projectKey: "p",
      query: "anything",
      limit: "5",
    }),
  });

  expect(res.status).toBe(400);
  const body = (await res.json()) as {
    success: boolean;
    error: { message: string };
  };
  expect(body.success).toBe(false);
  expect(body.error.message).toContain("invalid request body for search_memory");
  expect(registry.search_memory).not.toHaveBeenCalled();
});
```

Add this companion test to prove token-bound org enrichment is validated after resolution:

```ts
it("validates the token-resolved organizationId through the shared schema", async () => {
  await handle.close();
  registry = buildRegistry();
  handle = await startTestServer(registry, [
    { token: "bound-token", organizationId: "org-a" },
  ]);

  const res = await fetch(`${handle.baseUrl}/v1/memory/search`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer bound-token",
    },
    body: JSON.stringify({
      projectKey: "p",
      query: "anything",
    }),
  });

  expect(res.status).toBe(200);
  expect(registry.search_memory).toHaveBeenCalledWith({
    projectKey: "p",
    query: "anything",
    organizationId: "org-a",
  });
});
```

- [ ] **Step 3: Run RED**

Run:

```bash
npm test -- tests/mcp/server.test.ts tests/app/server.test.ts
```

Expected: the descriptor import fails because `src/mcp/tool-schemas.ts` does not exist, and the HTTP invalid `limit` request currently reaches the registry or fails with the old limited validator path.

- [ ] **Step 4: Add the shared descriptor module**

Create `src/mcp/tool-schemas.ts` with this structure:

```ts
import * as z from "zod/v4";
import type { ToolRegistry } from "./types.js";

export type ToolName = keyof ToolRegistry;

export type ToolRoute = {
  readonly name: ToolName;
  readonly method: "POST";
  readonly path: string;
};

export type ToolDescriptor = {
  readonly name: ToolName;
  readonly description: string;
  readonly inputSchema: Record<string, z.ZodTypeAny>;
};

export type ToolInputValidation =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; message: string };

export const TOOL_DESCRIPTORS = [
  {
    name: "add_memory",
    description: "Persist a memory record for a project or user scope.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      projectKey: z.string().min(1).optional(),
      scope: z.enum(["project", "user"]).optional(),
      userScopeId: z.string().min(1).optional(),
      kind: z.string().min(1),
      content: z.string().min(1),
    },
  },
  {
    name: "search_memory",
    description: "Search persisted memory records across one or more scopes.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      projectKey: z.string().min(1),
      query: z.string().min(1),
      userScopeId: z.string().min(1).optional(),
      includeUser: z.boolean().optional(),
      limit: z.number().int().positive().optional(),
    },
  },
  {
    name: "build_context_pack",
    description: "Search memory and assemble a markdown context pack.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      projectKey: z.string().min(1),
      task: z.string().min(1),
      userScopeId: z.string().min(1).optional(),
      includeUser: z.boolean().optional(),
      limit: z.number().int().positive().optional(),
    },
  },
  {
    name: "reindex_memory",
    description: "Reindex all memory chunks for a project and optional user scope into the active vector backend.",
    inputSchema: {
      organizationId: z.string().min(1),
      projectKey: z.string().min(1),
      userScopeId: z.string().min(1).optional(),
    },
  },
  {
    name: "compact_memory",
    description: "Preview or apply conservative memory compaction heuristics.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      projectKey: z.string().min(1).optional(),
      scope: z.enum(["project", "user"]).optional(),
      userScopeId: z.string().min(1).optional(),
      dryRun: z.boolean().optional(),
      limit: z.number().int().positive().max(5000).optional(),
      decayThreshold: z.number().nonnegative().optional(),
      halfLifeDays: z.number().positive().optional(),
      semanticDedupThreshold: z.number().positive().max(1).optional(),
    },
  },
  {
    name: "unarchive_memory",
    description: "Restore one or more archived memory records back to active canonical storage.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      archiveIds: z.array(z.number().int()),
    },
  },
  {
    name: "list_audit_log",
    description: "Return recent audit log entries scoped to a single organization.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      limit: z.number().int().positive().max(1000).optional(),
    },
  },
] as const satisfies readonly ToolDescriptor[];

export const TOOL_ROUTES = [
  { name: "add_memory", method: "POST", path: "/v1/memory" },
  { name: "search_memory", method: "POST", path: "/v1/memory/search" },
  { name: "build_context_pack", method: "POST", path: "/v1/memory/context-pack" },
  { name: "reindex_memory", method: "POST", path: "/v1/memory/reindex" },
  { name: "compact_memory", method: "POST", path: "/v1/memory/compact" },
  { name: "list_audit_log", method: "POST", path: "/v1/audit/list" },
  { name: "unarchive_memory", method: "POST", path: "/v1/memory/unarchive" },
] as const satisfies readonly ToolRoute[];

export function descriptorForTool(name: ToolName): ToolDescriptor {
  const descriptor = TOOL_DESCRIPTORS.find((entry) => entry.name === name);
  if (!descriptor) {
    throw new Error(`No tool descriptor registered for ${name}`);
  }
  return descriptor;
}

export function validateToolInput(
  toolName: ToolName,
  input: Record<string, unknown>,
): ToolInputValidation {
  const schema = z.object(descriptorForTool(toolName).inputSchema);
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return { ok: true, data: parsed.data as Record<string, unknown> };
  }

  const issue = parsed.error.issues[0];
  const path = issue?.path.length ? issue.path.join(".") : "body";
  const reason = issue?.message ?? "invalid value";
  return {
    ok: false,
    message: `invalid request body for ${toolName}: ${path}: ${reason}`,
  };
}
```

- [ ] **Step 5: Use descriptors in MCP registration**

In `src/mcp/server.ts`, remove the `import * as z from "zod/v4";` line and import descriptors:

```ts
import { TOOL_DESCRIPTORS } from "./tool-schemas.js";
```

Replace the seven hand-written `server.registerTool` calls in `createMcpServer()` with:

```ts
  for (const descriptor of TOOL_DESCRIPTORS) {
    server.registerTool(
      descriptor.name,
      {
        description: descriptor.description,
        inputSchema: descriptor.inputSchema,
      },
      async (input) => {
        const handler = registry[descriptor.name] as (
          toolInput: typeof input,
        ) => Promise<unknown>;
        return toToolResult(await handler(input));
      },
    );
  }
```

- [ ] **Step 6: Use descriptors in HTTP route validation**

In `src/app/routes/memory.ts`, remove the local `ToolName` union, `BodyValidator`, `validateCompactBody`, and `TOOL_VALIDATORS`. Import the shared pieces:

```ts
import {
  TOOL_ROUTES,
  type ToolName,
  validateToolInput,
} from "../../mcp/tool-schemas.js";
```

After `enrichedInput` is built, validate it:

```ts
      const validation = validateToolInput(toolName, enrichedInput);
      if (!validation.ok) {
        sendError(res, 400, validation.message);
        return;
      }

      const handler = ctx.registry[toolName] as (
        input: Record<string, unknown>,
      ) => Promise<unknown>;
      const result = await handler(validation.data);
```

Replace the literal route array with descriptor route mapping:

```ts
export function createMemoryRoutes(ctx: RouteContext): Route[] {
  return TOOL_ROUTES.map((route) => ({
    method: route.method,
    path: route.path,
    handle: buildHandler(route.name, ctx),
  }));
}
```

- [ ] **Step 7: Run GREEN**

Run:

```bash
npm test -- tests/mcp/server.test.ts tests/app/server.test.ts
npm run typecheck
```

Expected: targeted tests and typecheck pass. Existing tests that capture MCP schemas still pass because `createMcpServer()` registers the same schema fields through descriptors.

- [ ] **Step 8: Commit**

```bash
git add src/mcp/tool-schemas.ts src/mcp/server.ts src/app/routes/memory.ts tests/mcp/server.test.ts tests/app/server.test.ts
git commit -m "refactor(mcp): share tool schemas across transports"
```

---

### Task 2: Split MCP Server Into Focused Modules

**Files:**
- Create: `src/mcp/tool-utils.ts`
- Create: `src/mcp/tool-handlers.ts`
- Create: `src/mcp/tool-registry.ts`
- Modify: `src/mcp/server.ts`
- Test: `tests/mcp/server.test.ts`
- Test: `tests/cli.test.ts`

**Interfaces:**
- Consumes: `TOOL_DESCRIPTORS` from Task 1.
- Produces: `createToolRegistry(options?: CreateToolRegistryOptions): ToolRegistry` exported from `src/mcp/tool-registry.ts` and re-exported from `src/mcp/server.ts`.
- Produces: `createToolHandlers(options: CreateToolRegistryOptions, deps): ToolRegistry` internal to `src/mcp/tool-handlers.ts`.
- Produces: `src/mcp/server.ts` under 800 lines after extraction.

- [ ] **Step 1: Write failing module boundary tests**

Add this import to `tests/mcp/server.test.ts`:

```ts
import { createToolRegistry as createToolRegistryDirect } from "../../src/mcp/tool-registry.js";
```

Add this test:

```ts
it("keeps createToolRegistry available from the split registry module and server re-export", async () => {
  const directRegistry = createToolRegistryDirect({
    repository: createRepository(),
    defaultUserScopeId: "user-a",
  });
  const serverRegistry = createToolRegistry({
    repository: createRepository(),
    defaultUserScopeId: "user-a",
  });

  expect(Object.keys(directRegistry).sort()).toEqual(Object.keys(serverRegistry).sort());
  await expect(
    directRegistry.add_memory({
      projectKey: "p",
      kind: "decision",
      content: "split registry works",
    }),
  ).resolves.toMatchObject({ ok: true });
});
```

Add this test to `tests/cli.test.ts` or extend an existing import smoke test:

```ts
it("can import public MCP server exports after module split", async () => {
  const module = await import("../src/mcp/server.js");
  expect(typeof module.createMcpServer).toBe("function");
  expect(typeof module.createToolRegistry).toBe("function");
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
npm test -- tests/mcp/server.test.ts tests/cli.test.ts
```

Expected: direct import from `src/mcp/tool-registry.js` fails because the module does not exist.

- [ ] **Step 3: Extract pure MCP utilities**

Create `src/mcp/tool-utils.ts` by moving these pure helpers from `src/mcp/server.ts`:

```ts
export function formatMemoryIdentifier(record: { scopeType: string; scopeId: string; id: number }): string;
export function requireProjectKey(projectKey: string | undefined, scope: ScopeType): string;
export function requireUserScopeId(userScopeId: string | undefined): string;
export function normalizeLimit(limit: number | undefined): number;
export function toMemoryType(kind: string): AddMemoryInput["memoryType"];
export function summarize(content: string): string;
export function resolveUserScopeId(input: {
  cwd: string;
  explicitUserScopeId?: string;
  defaultUserScopeId?: string;
}): string;
```

Keep behavior identical. Move `readGitEmail(cwd)` into the same file as a non-exported helper consumed by `resolveUserScopeId()`.

- [ ] **Step 4: Extract handler construction**

Create `src/mcp/tool-handlers.ts`. Move the registry handler implementation body from the current `createToolRegistry()` into this module. Export:

```ts
export function createToolHandlers(input: {
  options: CreateToolRegistryOptions;
  cwd: string;
  withCanonicalServices: WithCanonicalServices;
}): ToolRegistry;
```

The returned object must expose all seven uninstrumented handler keys in this order: `add_memory`, `search_memory`, `build_context_pack`, `reindex_memory`, `compact_memory`, `list_audit_log`, and `unarchive_memory`.

Relocate the current statement block for each identically named handler from `src/mcp/server.ts` into `tool-handlers.ts`. This is a behavior-preserving move only: keep the same default values, repository calls, vector index calls, result mapping, input validation, and thrown error messages. Move handler-specific helpers, including `collectRecords`, `toRepositoryAddMemoryInput`, `toMemoryView`, `toAuditLogEntryView`, and `resolveRecords`, into `tool-handlers.ts`. Import pure helpers from `tool-utils.ts`.

- [ ] **Step 5: Extract registry instrumentation**

Create `src/mcp/tool-registry.ts`. Move `createToolRegistry()` and audit instrumentation from `src/mcp/server.ts` into this module. The exported function should keep the current signature:

```ts
export function createToolRegistry(
  options: CreateToolRegistryOptions = {},
): ToolRegistry {
  const cwd = options.cwd ?? process.cwd();
  const withCanonicalServices =
    options.withCanonicalServices ??
    createCanonicalServicesResolver({
      resolveCanonicalServices: options.resolveCanonicalServices,
    });
  const handlers = createToolHandlers({ options, cwd, withCanonicalServices });
  return instrumentToolRegistry({ options, cwd, handlers, withCanonicalServices });
}
```

Keep `hasRepositoryOverrides()` and audit logging in this module. The returned `ToolRegistry` must still wrap each handler with `instrument()`.

- [ ] **Step 6: Reduce server.ts to MCP SDK wiring and re-exports**

In `src/mcp/server.ts`, keep:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TOOL_DESCRIPTORS } from "./tool-schemas.js";
import { createToolRegistry } from "./tool-registry.js";
```

Keep exports:

```ts
export { createToolRegistry } from "./tool-registry.js";
export type {
  AddMemoryToolInput,
  AddMemoryToolResult,
  AuditLogEntryView,
  BuildContextPackToolInput,
  BuildContextPackToolResult,
  CanonicalServices,
  CompactMemoryToolInput,
  CompactMemoryToolResult,
  CreateMcpServerOptions,
  CreateToolRegistryOptions,
  ListAuditLogToolInput,
  ListAuditLogToolResult,
  ReindexMemoryToolInput,
  ReindexMemoryToolResult,
  RetrieveMemoryServiceInput,
  RetrieveMemoryService,
  SearchMemoryToolInput,
  SearchMemoryToolResult,
  ToolRegistry,
} from "./types.js";
```

Keep `createMcpServer()`, `startStdioServer()`, and `toToolResult()` in `server.ts`.

- [ ] **Step 7: Run GREEN and file-size check**

Run:

```bash
npm test -- tests/mcp/server.test.ts tests/cli.test.ts
npm run typecheck
wc -l src/mcp/server.ts
```

Expected: targeted tests and typecheck pass. `src/mcp/server.ts` reports fewer than 800 lines.

- [ ] **Step 8: Commit**

```bash
git add src/mcp/server.ts src/mcp/tool-utils.ts src/mcp/tool-handlers.ts src/mcp/tool-registry.ts tests/mcp/server.test.ts tests/cli.test.ts
git commit -m "refactor(mcp): split server registry modules"
```

---

### Task 3: Atomic Archive Cleanup Claim With Visibility Retry

**Files:**
- Create: `src/db/migrations/009_memory_archive_qdrant_retry.sql`
- Modify: `src/db/migrate.ts`
- Modify: `src/store/memory-archive-repository.ts`
- Modify: `src/compact/outbox-sweeper.ts`
- Test: `tests/store/memory-archive-repository.test.ts`
- Test: `tests/compact/outbox-sweeper.test.ts`
- Test: `tests/db/migrate.test.ts`

**Interfaces:**
- Produces: `MemoryArchiveRepository.claimPendingQdrantCleanup(input: { limit: number; now: Date }): Promise<PendingQdrantCleanup[]>`
- Keeps: `MemoryArchiveRepository.findPendingQdrantCleanup(limit)` as a read-only compatibility wrapper for tests/manual monitoring, or removes it only after all call sites are updated.
- Produces: migration 009 adds `memory_archive.qdrant_next_retry_at TIMESTAMPTZ`.
- Produces: `runOutboxSweep(input)` accepts optional `now?: () => Date`.

- [ ] **Step 1: Write failing repository claim tests**

In `tests/store/memory-archive-repository.test.ts`, add a new describe block:

```ts
describe("MemoryArchiveRepository.claimPendingQdrantCleanup", () => {
  it("claims rows with one UPDATE using FOR UPDATE SKIP LOCKED and retry visibility", async () => {
    const now = new Date("2026-06-25T00:00:00.000Z");
    const { pool, query } = makeMockPool(async () => ({
      rows: [
        {
          id: 1,
          organization_id: "org-a",
          qdrant_point_ids: ["pa1"],
          qdrant_attempt_count: 2,
        },
      ],
    }));
    const repo = createMemoryArchiveRepository(pool);

    const result = await repo.claimPendingQdrantCleanup({ limit: 10, now });

    expect(result).toEqual([
      {
        archiveId: 1,
        organizationId: "org-a",
        qdrantPointIds: ["pa1"],
        attemptCount: 2,
      },
    ]);
    const sql = query.mock.calls[0]![0] as string;
    const params = query.mock.calls[0]![1] as unknown[];
    expect(sql).toContain("UPDATE memory_archive");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("qdrant_next_retry_at = $3");
    expect(sql).toContain("archived_at < $1::timestamptz - INTERVAL '60 seconds'");
    expect(params[0]).toBe(now.toISOString());
    expect(params[1]).toBe(10);
    expect(params[2]).toBe("2026-06-25T00:01:00.000Z");
  });
});
```

- [ ] **Step 2: Write failing sweeper clock test**

In `tests/compact/outbox-sweeper.test.ts`, update `makeRepoWithPending()` so the fake repository includes both `findPendingQdrantCleanup` and `claimPendingQdrantCleanup`. Then add:

```ts
it("claims pending rows with the injected clock before deleting vectors", async () => {
  const pending: PendingQdrantCleanup[] = [
    {
      archiveId: 9,
      organizationId: "org-a",
      qdrantPointIds: ["p9"],
      attemptCount: 0,
    },
  ];
  const claimPendingQdrantCleanup = vi.fn().mockResolvedValue(pending);
  const { repo } = makeRepoWithPending([], { claimPendingQdrantCleanup });
  const vectorIndex = {
    delete: vi.fn().mockResolvedValue(undefined),
    deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn(),
    query: vi.fn(),
    ensureCollection: vi.fn(),
  };
  const now = new Date("2026-06-25T00:00:00.000Z");

  const result = await runOutboxSweep({
    archiveRepository: repo,
    vectorIndex,
    logger: SILENT_LOGGER,
    now: () => now,
  });

  expect(result).toEqual({ scanned: 1, cleaned: 1, retried: 0, failed: 0 });
  expect(claimPendingQdrantCleanup).toHaveBeenCalledWith({ limit: 100, now });
  expect(repo.findPendingQdrantCleanup).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run RED**

Run:

```bash
npm test -- tests/store/memory-archive-repository.test.ts tests/compact/outbox-sweeper.test.ts
```

Expected: tests fail because `claimPendingQdrantCleanup` and `runOutboxSweep.now` do not exist.

- [ ] **Step 4: Add migration 009**

Create `src/db/migrations/009_memory_archive_qdrant_retry.sql`:

```sql
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
```

Register it in `src/db/migrate.ts` by appending `"009_memory_archive_qdrant_retry.sql"` to `MIGRATION_FILES` and adding the same SQL block to `embeddedPostgresMigrationSql`.

- [ ] **Step 5: Update repository types and claim implementation**

In `src/store/memory-archive-repository.ts`, add the method to `MemoryArchiveRepository`:

```ts
  claimPendingQdrantCleanup(input: {
    limit: number;
    now: Date;
  }): Promise<PendingQdrantCleanup[]>;
```

Add a constant near the top:

```ts
const QDRANT_CLEANUP_VISIBILITY_TIMEOUT_MS = 60_000;
```

When `applyCompactionRecord()` inserts a `memory_archive` row, include `qdrant_next_retry_at` in the insert column list and set it to `NOW()` only for rows with vector points.

Add this CTE between the existing `deleted` CTE and the existing archive insert CTE:

```sql
deleted_with_points AS (
  SELECT
    d.*,
    COALESCE((
      SELECT array_agg(mc.qdrant_point_id)
      FROM memory_chunks mc
      WHERE mc.memory_record_id = d.id
        AND mc.qdrant_point_id IS NOT NULL
    ), '{}') AS qdrant_point_ids
  FROM deleted d
)
```

In the archive insert, read rows from `deleted_with_points dwp`, select `dwp.qdrant_point_ids` for the `qdrant_point_ids` column, and use this expression for the new `qdrant_next_retry_at` column:

```sql
CASE
  WHEN array_length(dwp.qdrant_point_ids, 1) > 0
  THEN NOW()
  ELSE NULL
END
```

Implement the claim method:

```ts
    async claimPendingQdrantCleanup({ limit, now }) {
      const claimUntil = new Date(
        now.getTime() + QDRANT_CLEANUP_VISIBILITY_TIMEOUT_MS,
      );
      const result = await pool.query<{
        id: number;
        organization_id: string;
        qdrant_point_ids: string[];
        qdrant_attempt_count: number;
      }>(
        `
          UPDATE memory_archive
          SET qdrant_next_retry_at = $3,
              qdrant_last_error = NULL
          WHERE id IN (
            SELECT id
            FROM memory_archive
            WHERE qdrant_status = 'pending'
              AND qdrant_next_retry_at IS NOT NULL
              AND qdrant_next_retry_at <= $1
              AND archived_at < $1::timestamptz - INTERVAL '60 seconds'
              AND array_length(qdrant_point_ids, 1) > 0
            ORDER BY qdrant_next_retry_at ASC, archived_at ASC
            LIMIT $2
            FOR UPDATE SKIP LOCKED
          )
          RETURNING id, organization_id, qdrant_point_ids, qdrant_attempt_count
        `,
        [now.toISOString(), limit, claimUntil.toISOString()],
      );

      return result.rows.map((row) => ({
        archiveId: row.id,
        organizationId: row.organization_id,
        qdrantPointIds: row.qdrant_point_ids ?? [],
        attemptCount: row.qdrant_attempt_count,
      }));
    },
```

Update `markQdrantStatus()` so deleted and failed clear retry visibility, while pending schedules the next due retry:

```sql
-- deleted branch
qdrant_next_retry_at = NULL

-- failed branch
qdrant_next_retry_at = NULL

-- pending branch
qdrant_next_retry_at = NOW() + INTERVAL '30 seconds'
```

Use separate SQL branches for `deleted`, `failed`, and `pending` so the status transitions are explicit and testable.

- [ ] **Step 6: Update sweeper to use claim method**

In `src/compact/outbox-sweeper.ts`, extend input and claim with an injected clock:

```ts
export type RunOutboxSweepInput = {
  archiveRepository: MemoryArchiveRepository;
  vectorIndex: VectorIndex;
  logger: Logger;
  batchSize?: number;
  maxAttempts?: number;
  now?: () => Date;
};
```

In `runOutboxSweep()`:

```ts
  const getNow = input.now ?? (() => new Date());
  const pending = await input.archiveRepository.claimPendingQdrantCleanup({
    limit: batchSize,
    now: getNow(),
  });
```

Update the file header comment so it describes the single-statement claim instead of a bare `findPendingQdrantCleanup` call.

- [ ] **Step 7: Run GREEN**

Run:

```bash
npm test -- tests/store/memory-archive-repository.test.ts tests/compact/outbox-sweeper.test.ts tests/db/migrate.test.ts
npm run typecheck
```

Expected: targeted tests and typecheck pass. DB migration tests may skip when Postgres is unavailable; unit SQL-shape tests must pass.

- [ ] **Step 8: Commit**

```bash
git add src/db/migrations/009_memory_archive_qdrant_retry.sql src/db/migrate.ts src/store/memory-archive-repository.ts src/compact/outbox-sweeper.ts tests/store/memory-archive-repository.test.ts tests/compact/outbox-sweeper.test.ts tests/db/migrate.test.ts
git commit -m "fix(compaction): claim archive cleanup retries atomically"
```

---

### Task 4: Container And Compose Hardening

**Files:**
- Modify: `docker/app.Dockerfile`
- Modify: `compose.yaml`
- Modify: `.env.example`
- Create: `tests/scripts/dockerfile-hardening.test.ts`
- Test: `tests/config/service-config.test.ts`

**Interfaces:**
- Produces: runtime container user `akasha` with UID/GID `10001`.
- Produces: `/var/lib/developer-memory-os/backups` exists and is owned by the runtime user inside the image.
- Keeps: quick-start Compose still works with `.env.example` local defaults.

- [ ] **Step 1: Write failing Dockerfile hardening test**

Create `tests/scripts/dockerfile-hardening.test.ts`:

```ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("docker/app.Dockerfile hardening", () => {
  const dockerfile = fs.readFileSync("docker/app.Dockerfile", "utf8");

  it("runs the runtime image as the non-root akasha user", () => {
    expect(dockerfile).toContain("addgroup -S -g 10001 akasha");
    expect(dockerfile).toContain("adduser -S -D -H -u 10001 -G akasha akasha");
    expect(dockerfile).toContain("USER akasha");
  });

  it("creates a writable backup directory before switching users", () => {
    expect(dockerfile).toContain("mkdir -p /var/lib/developer-memory-os/backups");
    expect(dockerfile).toContain("chown -R akasha:akasha /app /var/lib/developer-memory-os");
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
npm test -- tests/scripts/dockerfile-hardening.test.ts
```

Expected: the test fails because the Dockerfile does not create or switch to a non-root user.

- [ ] **Step 3: Harden the Dockerfile**

Modify `docker/app.Dockerfile` runtime stage:

```dockerfile
FROM node:22-alpine AS runner

WORKDIR /app

RUN addgroup -S -g 10001 akasha \
  && adduser -S -D -H -u 10001 -G akasha akasha \
  && mkdir -p /var/lib/developer-memory-os/backups

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/db/migrations ./dist/src/db/migrations
COPY --from=builder /app/scripts ./scripts

RUN chown -R akasha:akasha /app /var/lib/developer-memory-os

USER akasha

CMD ["node", "dist/src/app/server.js"]
```

- [ ] **Step 4: Clarify local versus production credentials**

Keep `compose.yaml` local defaults so `./install.sh` and quick start remain low-friction. Add comments above the weak defaults:

```yaml
      # Local-dev default. Production deployments must set POSTGRES_PASSWORD
      # in .env or through the orchestrator secret store.
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-memory}
```

```yaml
      # Local-dev default. Production deployments must set QDRANT_API_KEY.
      QDRANT__SERVICE__API_KEY: ${QDRANT_API_KEY:-local-qdrant-key}
```

In `.env.example`, change comments for `POSTGRES_PASSWORD` and `QDRANT_API_KEY` to say:

```text
# Local default for the bundled compose stack. In production, replace with a
# generated secret such as `openssl rand -hex 32`.
```

- [ ] **Step 5: Run GREEN**

Run:

```bash
npm test -- tests/scripts/dockerfile-hardening.test.ts tests/config/service-config.test.ts
npm run typecheck
docker build -f docker/app.Dockerfile .
```

Expected: targeted tests and typecheck pass. Docker build succeeds when Docker is available. If Docker is unavailable, record the exact Docker error in the task report and keep the test/typecheck evidence.

- [ ] **Step 6: Commit**

```bash
git add docker/app.Dockerfile compose.yaml .env.example tests/scripts/dockerfile-hardening.test.ts tests/config/service-config.test.ts
git commit -m "fix(docker): run app container as non-root"
```

---

### Task 5: Public Documentation And Stale Comment Sweep

**Files:**
- Modify: `README.md`
- Modify: `README.ko.md`
- Modify: `docs/architecture.md`
- Modify: `docs/architecture.ko.md`
- Modify: `docs/api-reference.md`
- Modify: `docs/api-reference.ko.md`
- Modify: `docs/deployment.md`
- Modify: `docs/deployment.ko.md`
- Modify: `docs/operations.md`
- Modify: `docs/operations.ko.md`
- Modify: `docs/security.md`
- Modify: `docs/security.ko.md`
- Modify: `docs/configuration.md`
- Modify: `docs/configuration.ko.md`
- Modify: `src/vector/pgvector-index.ts`
- Modify: `CHANGELOG.md`
- Modify: `CHANGELOG.ko.md`

**Interfaces:**
- Consumes: Tasks 1-4 behavior.
- Produces: public docs that match descriptor-driven validation, module split, archive cleanup claim semantics, non-root container, and production credential guidance.
- Removes: stale `ORPHAN VECTORS ON REINDEX (KNOWN FOLLOW-UP)` comment from `src/vector/pgvector-index.ts`, because reindex now calls `VectorIndex.deleteByRecordIds()`.

- [ ] **Step 1: Write documentation drift checks**

Add this test to `tests/scripts/backup-verify.test.ts` or create `tests/scripts/public-docs-drift.test.ts`:

```ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return fs.readFileSync(path, "utf8");
}

describe("public documentation drift checks", () => {
  it("does not describe reindex orphan vectors as an open pgvector follow-up", () => {
    expect(read("src/vector/pgvector-index.ts")).not.toContain(
      "ORPHAN VECTORS ON REINDEX (KNOWN FOLLOW-UP)",
    );
  });

  it("documents descriptor-driven tool validation in API docs", () => {
    expect(read("docs/api-reference.md")).toContain("shared tool schema");
    expect(read("docs/api-reference.ko.md")).toContain("공유 tool schema");
  });

  it("documents non-root container runtime in security docs", () => {
    expect(read("docs/security.md")).toContain("non-root");
    expect(read("docs/security.ko.md")).toContain("non-root");
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
npm test -- tests/scripts/public-docs-drift.test.ts
```

Expected: the test fails because docs and stale source comment do not yet match the new behavior.

- [ ] **Step 3: Update architecture docs**

In `docs/architecture.md` and `docs/architecture.ko.md`:

- Change the Tool registry box from `Tool registry (src/mcp/server.ts)` to descriptor-driven wording:

```text
│ Tool descriptors + registry                                     │
│   src/mcp/tool-schemas.ts     → shared zod schemas + routes     │
│   src/mcp/tool-registry.ts    → audited registry wrappers       │
│   src/mcp/tool-handlers.ts    → tool implementations            │
```

- In the compaction cleanup section, state:

```text
The cleanup sweeper claims pending archive rows with a single
UPDATE memory_archive SET qdrant_next_retry_at = claim_until
WHERE id IN (SELECT id FROM memory_archive FOR UPDATE SKIP LOCKED)
RETURNING id, organization_id, qdrant_point_ids, qdrant_attempt_count
statement and pushes qdrant_next_retry_at into a short visibility window.
If a worker crashes after claim, the row becomes due again after that window.
```

Mirror this in Korean:

```text
cleanup sweeper는 단일
UPDATE memory_archive SET qdrant_next_retry_at = claim_until
WHERE id IN (SELECT id FROM memory_archive FOR UPDATE SKIP LOCKED)
RETURNING id, organization_id, qdrant_point_ids, qdrant_attempt_count
문으로 pending archive row를 claim하고 qdrant_next_retry_at을 짧은
visibility window로 밀어둡니다. claim 이후 worker가 크래시되어도 window가
끝나면 row가 다시 due 상태가 됩니다.
```

- [ ] **Step 4: Update API docs**

In `docs/api-reference.md` and `docs/api-reference.ko.md`, add a paragraph near the error/status section:

```text
HTTP and MCP tool calls share the same zod-backed tool schema definitions.
HTTP requests are validated after bearer-token organization resolution and
before registry dispatch; malformed tool bodies return 400 and do not call
the tool handler.
```

Korean mirror:

```text
HTTP와 MCP tool call은 같은 zod 기반 tool schema 정의를 공유합니다.
HTTP 요청은 bearer token의 organization 해석 이후, registry dispatch 이전에
검증됩니다. 잘못된 tool body는 400을 반환하며 tool handler를 호출하지 않습니다.
```

- [ ] **Step 5: Update deployment, operations, security, configuration, README**

Apply these exact content changes:

- `docs/deployment.md` and `.ko.md`: replace the old compaction sweeper warning with the new atomic claim behavior and keep the recommendation to run one enabled replica unless operators need higher cleanup throughput.
- `docs/operations.md` and `.ko.md`: describe archive cleanup retry visibility and failed-row operator review.
- `docs/security.md` and `.ko.md`: add a control for non-root runtime containers and production credential replacement.
- `docs/configuration.md` and `.ko.md`: describe local credential defaults as development-only and point production operators at generated secrets.
- `README.md` and `.ko.md`: add one high-signal sentence that HTTP and MCP share the same seven-tool schema surface.
- `CHANGELOG.md` and `.ko.md`: add an `[Unreleased]` entry for descriptor-shared validation, non-root container runtime, and archive cleanup claim semantics.

- [ ] **Step 6: Remove stale pgvector comment**

In `src/vector/pgvector-index.ts`, delete the stale block:

```ts
// ORPHAN VECTORS ON REINDEX (KNOWN FOLLOW-UP):
//   When a document is re-chunked with fewer chunks than before, the stale
//   extra vectors remain in the table (upsert-only, no sweep). This affects
//   the Qdrant path too (both are upsert-only on reindex). Track as a
//   follow-up: add a scope-aware delete-then-upsert path on reindex.
```

Do not remove the production hardening notes that are still true.

- [ ] **Step 7: Run GREEN**

Run:

```bash
npm test -- tests/scripts/public-docs-drift.test.ts
npm run typecheck
npm test
```

Expected: the new drift tests pass, typecheck passes, and the full suite passes with only environment-gated skips.

- [ ] **Step 8: Commit**

```bash
git add README.md README.ko.md docs/architecture.md docs/architecture.ko.md docs/api-reference.md docs/api-reference.ko.md docs/deployment.md docs/deployment.ko.md docs/operations.md docs/operations.ko.md docs/security.md docs/security.ko.md docs/configuration.md docs/configuration.ko.md src/vector/pgvector-index.ts CHANGELOG.md CHANGELOG.ko.md tests/scripts/public-docs-drift.test.ts
git commit -m "docs(ops): align hardening docs with runtime"
```

---

## Final Verification

After all tasks are complete:

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `docker build -f docker/app.Dockerfile .` when Docker is available.
- [ ] Run `wc -l src/mcp/server.ts` and confirm the count is below 800.
- [ ] Run `rg -n "full schema validation lives in P17|ORPHAN VECTORS ON REINDEX|multi-replica-safe at the SQL level" src docs README.md README.ko.md` and confirm no stale claim remains.
- [ ] Run `git status --short --untracked-files=all` and confirm only intentional files are changed.
