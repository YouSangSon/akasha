> **English** | [한국어](api-reference.ko.md)

# API reference

context-forge exposes the same tool surface through two transports:

- **MCP** (stdio) — for AI clients like Claude Code and Codex CLI.
  Entry point: `dist/src/cli.js`.
- **HTTP** (JSON over POST) — for any other client.
  Entry point: `src/app/server.ts`, default bind `127.0.0.1:8787`.

Both transports invoke the same handler functions in `src/mcp/server.ts`.
Tool inputs and outputs are identical; only the wire format differs.

## Authentication (HTTP only)

Every `/v1/*` route requires a bearer token. `/healthz` and `/readyz` are
unauthenticated.

```bash
curl -H "Authorization: Bearer dev-token" http://localhost:8787/v1/memory/search ...
```

Failure modes:

| Status | Reason |
|---|---|
| 401 | Missing / unknown / wrong-format `Authorization` header |
| 403 | Token bound to a different org than body / header asks for |
| 429 | Per-token rate limit exhausted |
| 503 | `/readyz` saw a dependency outage |

## Response envelope (HTTP)

All HTTP responses use a consistent envelope:

```ts
// Success:
{ "success": true,  "data": <ToolResult> }

// Failure:
{ "success": false, "error": { "message": "<human-readable>" } }
```

MCP responses use the SDK's native shape — no envelope.

## Tools

### add_memory — save a memory

```ts
type AddMemoryInput = {
  organizationId?: string;       // overridden by token binding
  projectKey?: string;           // required for project scope
  scope?: "project" | "user";    // default "project"
  userScopeId?: string;          // required for user scope
  kind: string;                  // "decision" | "fact" | "constraint" | …
  content: string;               // free-form text; secret-scrubbed at write
};

type AddMemoryResult = {
  ok: true;
  memoryId: string;              // "project:<key>:<id>" or "user:<scopeId>:<id>"
  summary: string;
};
```

HTTP: `POST /v1/memory`

```bash
curl -X POST http://localhost:8787/v1/memory \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{
    "projectKey": "my-project",
    "kind": "decision",
    "content": "We decided to use Postgres for canonical persistence"
  }'
```

Errors: `SecretDetectedError` (400) when content contains scrubbed patterns
(API keys, PEM blocks, bearer tokens, JWTs).

---

### search_memory — semantic + scope-filtered retrieval

```ts
type SearchMemoryInput = {
  organizationId?: string;
  projectKey: string;            // required
  query: string;
  userScopeId?: string;          // include user-scoped hits
  limit?: number;                // default 10
};

type SearchMemoryResult = {
  ok: true;
  projectKey: string;
  query: string;
  results: Array<{
    id: number;
    scopeType: "project" | "user";
    scopeId: string;
    memoryType: string;
    content: string;
    importance: number;
    createdAt: string;
    score: number;
    // ... full record shape
  }>;
};
```

HTTP: `POST /v1/memory/search`

Behavior: query gets embedded → Qdrant cosine search (filtered by org +
scope) → top-K hydrated from Postgres → ranked → returned. Project-scope
hits are stably sorted ahead of user-scope hits when there's a tie.

---

### build_context_pack — generate a session-priming pack

```ts
type BuildContextPackInput = {
  organizationId?: string;
  projectKey: string;
  task?: string;                 // task description for ranking
  userScopeId?: string;
  limit?: number;
};

type BuildContextPackResult = {
  ok: true;
  projectKey: string;
  packMarkdown: string;          // ready to paste into a new session
  selectedMemoryIds: string[];
  sections: {
    project_summary: SearchMemoryResult[];
    recent_decisions: SearchMemoryResult[];
    constraints: SearchMemoryResult[];
    open_questions: SearchMemoryResult[];
    relevant_notes: SearchMemoryResult[];
  };
};
```

HTTP: `POST /v1/memory/context-pack`

`packMarkdown` is rendered with the task line at the bottom (after a
delimiter) so the stable body content can sit at the cache-eligible prefix
of an LLM prompt.

---

### reindex_memory — rebuild Qdrant points from Postgres chunks

```ts
type ReindexMemoryInput = {
  organizationId?: string;
  projectKey?: string;
  userScopeId?: string;
};

type ReindexMemoryResult = {
  ok: true;
  projectKey: string;
  scopes: ScopeRef[];
  chunkCount: number;
};
```

HTTP: `POST /v1/memory/reindex`

Recompute embeddings for existing chunks and upsert to Qdrant. Use after
changing `EMBEDDING_PROVIDER` or `OPENAI_EMBEDDING_MODEL`.

---

### compact_memory — dedup + decay (dry-run by default)

```ts
type CompactMemoryInput = {
  organizationId?: string;
  projectKey?: string;
  scope?: "project" | "user";
  userScopeId?: string;
  dryRun?: boolean;              // default true; STRICT boolean check
  limit?: number;
  decayThreshold?: number;       // default 0.5
  halfLifeDays?: number;         // default 30
  semanticDedupThreshold?: number; // (0, 1]; replaces exact-match when set
};

type CompactMemoryResult = {
  ok: true;
  projectKey: string;
  dryRun: boolean;
  archivedIds: string[];         // empty in dry-run
  duplicateGroups: Array<{ keepId: string; archiveIds: string[] }>;
  decayCandidates: Array<{ id: string; score: number }>;
  promotionCandidates: string[];
  summary: string;
  // When dryRun=false:
  compactionRunId?: string;
  applyStats?: {
    archived: number;
    skipped: number;
    qdrantPointsDeleted: number;
    qdrantPointsPending: number;
    durationMs: number;
  };
};
```

HTTP: `POST /v1/memory/compact`

When `dryRun=false`, the apply path runs:
1. Plan computed via the same logic as dry-run.
2. Per record: PG CTE archives + deletes (TOCTOU-guarded), Qdrant deletes.
3. Failures isolated per record; partial failures populate
   `qdrantPointsPending` for the sweeper.

Idempotent: replays of the same UUID return the prior outcome instead of
re-executing. Rate-limited to 1 per hour per org by default.

---

### unarchive_memory — restore from `memory_archive`

```ts
type UnarchiveMemoryInput = {
  organizationId?: string;
  archiveIds: number[];
};

type UnarchiveMemoryResult = {
  ok: true;
  outcomes: Array<
    | { archiveId: number; status: "restored"; restoredRecordId: number; sourceRecordId: number; chunkCount: number }
    | { archiveId: number; status: "skipped"; reason: string }
    | { archiveId: number; status: "failed"; error: string }
  >;
  restoredCount: number;
  skippedCount: number;
  failedCount: number;
};
```

HTTP: `POST /v1/memory/unarchive`

Skip reasons:
- `archive_not_found_or_org_mismatch` — id missing or org-scoped out
- `already_unarchived` — `unarchived_at` set (idempotent)
- `pre_p19.1_archive_missing_source_id` — archive predates the source_id
  capture; manual recovery only

The restored record gets a fresh BIGSERIAL id; the response maps it to
the original via `sourceRecordId` so callers can update references.

---

### list_audit_log — read the audit trail

```ts
type ListAuditLogInput = {
  organizationId?: string;
  limit?: number;                // default 100
};

type ListAuditLogResult = {
  ok: true;
  organizationId: string;
  entries: Array<{
    id: string;
    organizationId: string;
    actor: string;
    tool: string;
    projectKey: string | null;
    outcome: "ok" | "error";
    errorMessage: string | null;
    durationMs: number;
    requestId: string | null;
    createdAt: string;
  }>;
};
```

HTTP: `POST /v1/audit/list`

Read-only. Org-scoped by token binding; entries from other orgs never leak.

---

## Health probes (HTTP only)

### `GET /healthz` — liveness

Unauthenticated. Always 200 once the process is up. No dependency check.

### `GET /readyz` — readiness

Unauthenticated. Probes Postgres (`SELECT 1`), Qdrant (`/healthz`), and
OpenAI (`/v1/models`). Returns:

- 200 with each probe's status when all OK
- 503 with the same envelope when any probe fails (drains a load balancer)

Use this for Kubernetes readiness, Docker healthcheck, or external monitor
integrations.
