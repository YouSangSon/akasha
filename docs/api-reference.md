> **English** | [한국어](api-reference.ko.md)

# API reference

Akasha exposes the same core service tool surface through three access paths:

- **MCP stdio** — for AI clients like Claude Code and Codex CLI.
  Entry point: `dist/src/mcp/server.js`. All 11 service tools are registered,
  plus MCP-only client-context helpers.
- **MCP Streamable HTTP** — for MCP clients that connect over HTTP.
  Primary documented endpoint: `POST /mcp` for JSON-RPC requests. The SDK
  transport also supports GET and DELETE on the same `/mcp` endpoint.
- **JSON HTTP** — for any other client under `/v1/*`.
  Entry point: `src/app/server.ts`, default bind `127.0.0.1:8787`.

All three access paths share the same descriptor/schema/registry path in
`src/mcp/tool-schemas.ts` and `src/mcp/tool-registry.ts`, then dispatch to the
service tool implementations in `src/mcp/tool-handlers.ts`. Service tool inputs
and outputs are identical; only the wire format differs.

HTTP and MCP tool calls share the same zod-backed shared tool schema
definitions. HTTP requests are validated after bearer-token organization
resolution and before registry dispatch; malformed tool bodies return 400 and
do not call the tool handler.

MCP additionally registers three context-aware tools that do not have `/v1/*`
routes: `list_workspace_roots` calls the client `roots/list` capability when it
is advertised, and `add_memory_interactive` uses MCP form elicitation to collect
memory details before dispatching to `add_memory`. `classify_memory_candidate`
uses MCP sampling to suggest a memory `kind` and concise `summary` for candidate
text without storing it.

## Authentication (HTTP only)

When `MEMORY_API_TOKENS` or OAuth token validation is configured, every `/mcp`
and `/v1/*` route requires a bearer token. Static tokens are configured via
`MEMORY_API_TOKENS`; OAuth/OIDC JWT access tokens are accepted when
`MCP_OAUTH_AUTHORIZATION_SERVERS` and `MCP_OAUTH_RESOURCE_URL` are configured
and the token validates against issuer JWKS, audience, expiry, and scope.
`/healthz`, `/readyz`, `/metrics`, and the static `/admin/memory` shell are
unauthenticated. `/admin/memory` embeds no data or token and its browser-side
JSON calls still target the authenticated `/v1/*` API. For local development
only, an empty token list is allowed when the server binds to loopback
(`127.0.0.1`, `localhost`, or `::1`); binding to a non-loopback host without
static tokens or OAuth token validation fails at startup.

```bash
curl -H "Authorization: Bearer dev-token" http://localhost:8787/v1/memory/search ...
```

Failure modes:

| Status | Reason |
|---|---|
| 401 | Missing / unknown / wrong-format `Authorization` header |
| 403 | Token bound to a different org than body / header asks for, or OAuth token lacks the required scope (`insufficient_scope`) |
| 429 | Per-token rate limit exhausted |
| 503 | `/readyz` saw a dependency outage (see health section) |

## Response shapes

All HTTP responses use a consistent envelope:

```ts
// Success:
{ "success": true,  "data": <ToolResult> }

// Failure:
{ "success": false, "error": { "message": "<human-readable>" } }
```

MCP responses use the SDK's native shape — no envelope.

Tool results are also exposed to MCP clients as both:

- `structuredContent` — the JSON object form of the tool result.
- `content` — one serialized JSON text content item for clients that read tool
  output as text.

The payload is the same information in both fields.

## MCP resources and prompts

Resources:

- `akasha://memory/recent/{projectKey}` — JSON search result. Query params:
  `organizationId`, `query`, `limit`.
- `akasha://context-pack/{projectKey}/{task}` — markdown context pack. Query
  params: `organizationId`, `limit`.

Prompts:

- `akasha_session_start` — builds a context pack for a new agent session.
- `akasha_store_memory` — template for asking an agent to store durable memory.

## MCP-only context tools

These tools are registered only on MCP transports because they use
server-to-client MCP capabilities. Each returns `supported: false` when the
connected client does not advertise the required capability.

```ts
type ListWorkspaceRootsResult = {
  ok: true;
  supported: boolean;
  roots: { uri: string; name?: string }[];
  message?: string;
};

type AddMemoryInteractiveResult = {
  ok: true;
  action: "accept" | "decline" | "cancel" | "unsupported";
  stored: boolean;
  memoryId?: string;
  summary?: string;
};

type ClassifyMemoryCandidateResult = {
  ok: true;
  supported: boolean;
  classification?: {
    kind: "decision" | "summary" | "fact";
    summary: string;
    confidence?: number;
  };
  model?: string;
  rawText?: string;
};
```

- `list_workspace_roots` — calls client `roots/list` (`akasha:read`).
- `add_memory_interactive` — uses form elicitation, then calls `add_memory`
  when the user accepts (`akasha:write`).
- `classify_memory_candidate` — uses client sampling to classify candidate
  text without storing it (`akasha:read`).

## Tools

### add_memory — save a memory

```ts
type AddMemoryInput = {
  organizationId?: string;       // overridden by token binding
  projectKey?: string;           // required for project scope
  scope?: "project" | "user";    // default "project"
  userScopeId?: string;          // required for user scope
  kind: "decision" | "summary" | "fact"; // decision | summary | fact
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

### search_memory — hybrid semantic + lexical retrieval

```ts
type SearchMemoryInput = {
  organizationId?: string;
  projectKey: string;            // required
  query: string;
  userScopeId?: string;          // include user-scoped hits
  includeUser?: boolean;         // default true; set false to suppress user-scope hits
  limit?: number;                // default 10
};

type SearchMemoryResult = {
  id: number;
  organizationId?: string;
  sourceId: number;
  projectKey?: string | null;
  scopeType: "project" | "user";
  scopeId: string;
  memoryType: "decision" | "summary" | "fact";
  title?: string | null;
  content: string;
  summary?: string | null;
  durability?: "ephemeral" | "durable" | "archived";
  importance?: number;
  createdAt: string;
  updatedAt: string;
  source: {
    id: number;
    organizationId?: string;
    scopeType: "project" | "user";
    scopeId: string;
    sourceType: "decision" | "document" | "conversation";
    externalId?: string;
    sourceRef?: string;
    title: string | null;
    uri: string | null;
    createdAt: string;
  };
};

type SearchMemoryResponse = {
  ok: true;
  projectKey: string;
  query: string;
  results: SearchMemoryResult[];
};
```

HTTP: `POST /v1/memory/search`

Behavior: query gets embedded for active vector backend similarity search
(filtered by org + scope) and also runs through Postgres lexical candidate
search over scoped records. Lexical retrieval uses a generated `tsvector` GIN
index with `ts_rank_cd`, plus a substring fallback for exact paths, env vars,
and short code tokens. Query entity mentions (code symbols, paths, URLs, dates,
and proper nouns) also match the persisted entity graph as an exact rescue/boost
path. Vector and lexical candidates are merged, hydrated from Postgres when
needed, scored with reciprocal-rank source boosts plus metadata/recency signals,
ranked, sliced to `limit`, and returned. Project-scope hits are stably sorted
ahead of user-scope hits when there's a tie.

---

### build_context_pack — generate a session-priming pack

```ts
type BuildContextPackInput = {
  organizationId?: string;
  projectKey: string;
  task: string;                  // required; task description for ranking
  userScopeId?: string;
  includeUser?: boolean;         // default true; set false to suppress user-scope hits
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
of an LLM prompt. The body starts with a trust-boundary notice: retrieved
memories are untrusted context, and prompt-injection-like excerpts are labeled
with a warning.

---

### reindex_memory — rebuild the active vector index from Postgres chunks

```ts
type ReindexMemoryInput = {
  organizationId: string;        // required; throws without it (data-isolation guard)
  projectKey: string;            // required
  userScopeId?: string;
};

type ReindexMemoryResult = {
  ok: true;
  projectKey: string;
  scopes: string[];              // e.g. ["project:my-project", "user:abc123"]
  chunkCount: number;
};
```

HTTP: `POST /v1/memory/reindex`
MCP stdio: `reindex_memory`

Recompute embeddings for existing chunks and upsert to the configured vector
backend (`qdrant` or `pgvector`). Use after changing `EMBEDDING_PROVIDER` or
`OPENAI_EMBEDDING_MODEL`.

---

### list_memory — governance list

```ts
type ListMemoryInput = {
  organizationId?: string;
  projectKey?: string;           // required for project scope
  scope?: "project" | "user";    // default "project"
  userScopeId?: string;          // required for user scope
  includeArchived?: boolean;
  tag?: string;
  limit?: number;                // max 5000
};

type MemoryRecord = SearchMemoryResult & {
  tags: string[];
};

type ListMemoryResult = {
  ok: true;
  scopeType: "project" | "user";
  scopeId: string;
  memories: MemoryRecord[];
};
```

HTTP: `POST /v1/memory/list`
MCP stdio: `list_memory`

Read-only governance review. Tag filters use `memory_tags`; archived rows are
excluded unless `includeArchived` is true.

---

### update_memory — edit one canonical record

```ts
type UpdateMemoryInput = {
  organizationId?: string;
  memoryId: number;
  kind?: "decision" | "summary" | "fact";
  title?: string | null;
  content?: string;
  summary?: string | null;
  importance?: number;
  durability?: "ephemeral" | "durable" | "archived";
  tags?: string[];
};

type UpdateMemoryResult = {
  ok: true;
  updated: boolean;
  memory?: MemoryRecord;
};
```

HTTP: `POST /v1/memory/update`
MCP stdio: `update_memory`

Updates the canonical Postgres row, replaces tags when supplied, refreshes
entity mentions, and refreshes vector state. Embedding/vector failures leave a
due ingest retry marker instead of silently dropping index work.

---

### delete_memory — governance archive one record

```ts
type DeleteMemoryInput = {
  organizationId?: string;
  memoryId: number;
};

type DeleteMemoryResult = {
  ok: true;
  archived: boolean;
  qdrantPointsDeleted: number;
  qdrantPointsPending: number;
};
```

HTTP: `POST /v1/memory/delete`
MCP stdio: `delete_memory`

Archives one canonical record through the same recovery path used by
compaction, then removes active vector points. If vector deletion fails, the
archive row remains pending for the cleanup sweeper.

---

### tag_memory — replace governance tags

```ts
type TagMemoryInput = {
  organizationId?: string;
  memoryId: number;
  tags: string[];
};

type TagMemoryResult = {
  ok: true;
  updated: boolean;
  memory?: MemoryRecord;
};
```

HTTP: `POST /v1/memory/tag`
MCP stdio: `tag_memory`

Normalizes and replaces the record's governance tags, then refreshes vector
payload metadata so tag-aware inspection sees current values.

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
  mergedIds: string[];           // record ids represented by duplicateGroups
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
MCP stdio: `compact_memory`

When `dryRun=false`, the apply path runs:
1. Plan computed via the same logic as dry-run.
2. Per record: PG CTE archives + deletes (TOCTOU-guarded), active vector
   backend deletes.
3. Failures isolated per record; partial failures populate
   `qdrantPointsPending` for the sweeper.

Idempotent: replays of the same UUID return the prior outcome instead of
re-executing. Rate-limited to 1 per hour per org by default; exceeding the
limit returns HTTP **429** with a `Retry-After` header.

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
MCP stdio: `unarchive_memory`

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

## Health and metrics (HTTP only)

### `GET /healthz` — liveness

Unauthenticated. Always 200 once the process is up. No dependency check.

### `GET /readyz` — readiness

Unauthenticated. Probes live dependencies and returns:

- **200** with each probe's status when all pass
- **503** with the same envelope when any dependency is unreachable (drains a
  load balancer or fails a Kubernetes readiness check)

The built-in production server (`startOperatorServer`) wires the following
probes automatically:

| Probe | Check | Always active? |
|---|---|---|
| `postgres` | `SELECT 1` | Yes |
| `qdrant` | `GET /healthz` on the Qdrant host | Only when `VECTOR_BACKEND=qdrant` |
| `openai` | `GET /v1/models` with your API key | Only when `EMBEDDING_PROVIDER=openai` |

The OpenAI probe is skipped for `transformers` and `local` providers — those
deployments have no API key and must not fail readiness on that account.
The Qdrant probe is skipped for `VECTOR_BACKEND=pgvector` deployments because
vectors live in Postgres in that mode.

Use this for Kubernetes readiness probes, Docker `HEALTHCHECK`, or external
uptime monitors. The `/healthz` endpoint remains the unconditional liveness
check (process alive, no dependency checks).

### `GET /metrics` — Prometheus text exposition

Unauthenticated. Returns `text/plain; version=0.0.4` for Prometheus scraping.

Emitted HTTP metrics:

- `akasha_http_requests_total{method,route,status}` — request counter.
- `akasha_http_request_duration_seconds_count{method,route,status}` — request
  duration sample count.
- `akasha_http_request_duration_seconds_sum{method,route,status}` — cumulative
  request duration.

Route labels use static route names such as `/v1/memory/search`, `/mcp`,
`/admin/memory`, `/healthz`, `/readyz`, `/metrics`, or `unknown`. Raw URLs and
query strings are never emitted. Labels and values do not include bearer
tokens, organization IDs, request bodies, search queries, or memory content.

Readiness dependency metrics come only from the most recent `/readyz` result:

- `akasha_dependency_up{name="postgres"}` — `1` when the latest check passed,
  `0` when it failed.
- `akasha_dependency_check_duration_seconds{name="postgres"}` — duration of
  the latest check.

If `/readyz` has not run yet, dependency metrics are omitted; `/metrics` does
not probe Postgres, Qdrant, or OpenAI itself.
