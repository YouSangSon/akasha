> **English** | [한국어](api-reference.ko.md)

# API reference

Akasha exposes the same core service tool surface through three access paths:

- **MCP stdio** — for AI clients like Claude Code and Codex CLI.
  Entry point: `dist/src/mcp/server.js`. All 20 service tools are registered,
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

type ContextPackSelectionRationale = {
  memoryId: string;
  recordId: number;
  section: "project_summary" | "recent_decisions" | "constraints" | "open_questions" | "relevant_notes";
  reason: "project-summary" | "decision-memory-or-source" | "constraint-prefix" | "open-question-prefix" | "fallback-relevant-note";
  inputRank: number;             // 1-based rank before section capping
  scopeType: "project" | "user";
  scopeId: string;
  sourceType: "decision" | "document" | "conversation";
  sourceTitle: string | null;
};

type BuildContextPackResult = {
  ok: true;
  projectKey: string;
  packMarkdown: string;          // ready to paste into a new session
  selectedMemoryIds: string[];   // memories actually included after section caps
  sections: {
    project_summary: SearchMemoryResult[];
    recent_decisions: SearchMemoryResult[];
    constraints: SearchMemoryResult[];
    open_questions: SearchMemoryResult[];
    relevant_notes: SearchMemoryResult[];
  };
  selectionRationale: ContextPackSelectionRationale[];
};
```

HTTP: `POST /v1/memory/context-pack`

`packMarkdown` is rendered with the task line at the bottom (after a
delimiter) so the stable body content can sit at the cache-eligible prefix
of an LLM prompt. The body starts with a trust-boundary notice: retrieved
memories are untrusted context, and prompt-injection-like excerpts are labeled
with a warning. `selectionRationale` explains why each included memory was
placed in its section and omits retrieved records dropped by section caps.

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
  memories: Array<MemoryRecord>;
};
```

HTTP: `POST /v1/memory/list`
MCP stdio: `list_memory`

Read-only governance review. Tag filters use `memory_tags`; archived rows are
excluded unless `includeArchived` is true.

---

### inspect_memory_graph — inspect scoped entity graph

```ts
type EntityKind = "code_symbol" | "path" | "url" | "date" | "proper_noun";

type InspectMemoryGraphInput = {
  organizationId?: string;
  projectKey?: string;           // required for project scope
  scope?: "project" | "user";    // default "project"
  userScopeId?: string;          // required for user scope
  kind?: EntityKind;
  query?: string;                // filters normalized/display text
  includeArchived?: boolean;
  limit?: number;                // max 5000
  relationshipLimit?: number;    // max 5000
};

type MemoryGraphEntity = {
  id: number;
  kind: EntityKind;
  normalized: string;
  displayText: string;
  firstSeenAt: string;
  lastSeenAt: string;
  mentionCount: number;
  memoryIds: number[];
};

type MemoryGraphEntityRef = {
  id: number;
  kind: EntityKind;
  normalized: string;
  displayText: string;
};

type MemoryGraphRelationship = {
  id: number;
  fromEntityId: number;
  toEntityId: number;
  fromEntity: MemoryGraphEntityRef;
  toEntity: MemoryGraphEntityRef;
  relationType: string;          // "co_mentions" or "temporal_context"
  evidenceMemoryRecordId: number;
  validFrom: string | null;
  validTo: string | null;
  confidence: number;
  createdAt: string;
};

type InspectMemoryGraphResult = {
  ok: true;
  scopeType: "project" | "user";
  scopeId: string;
  entities: MemoryGraphEntity[];
  relationships: MemoryGraphRelationship[];
};
```

HTTP: `POST /v1/memory/graph`
MCP stdio: `inspect_memory_graph`

Read-only graph inspection for the write-time entity graph. Use this to audit
which symbols, paths, URLs, dates, and named concepts are driving entity-backed
lexical rescue/boost behavior.

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

### start_goal_run — begin a persistent objective

```ts
type StartGoalRunInput = {
  organizationId?: string;
  scope?: "project" | "user";    // default "project"
  projectKey?: string;           // required for project scope
  userScopeId?: string;          // resolved like memory user-scope tools
  goal: string;                  // secret-scrubbed
  terminationCriteria?: string | null; // secret-scrubbed when present
};

type GoalRun = {
  id: number;
  organizationId: string;
  scopeType: "project" | "user";
  scopeId: string;
  projectKey: string | null;
  goal: string;
  terminationCriteria: string | null;
  status: "active" | "completed" | "abandoned";
  iterationCount: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  closeNote: string | null;
};

type StartGoalRunResult = {
  ok: true;
  goalRun: GoalRun;
};
```

HTTP: `POST /v1/goal-run/start`
MCP stdio: `start_goal_run`

Use this to make a long-running objective first-class in memory. While a run is
active, memories linked by `record_iteration.memoryIds` are pinned out of
compaction.

---

### record_iteration — append one goal-run attempt

```ts
type RecordIterationInput = {
  organizationId?: string;
  goalRunId: number;
  attempt: string;               // secret-scrubbed
  outcome: "success" | "failure" | "partial";
  summary?: string | null;       // secret-scrubbed when present
  error?: string | null;         // secret-scrubbed when present
  memoryIds?: number[];          // org-scoped records to pin to this run
};

type GoalRunIteration = {
  id: number;
  goalRunId: number;
  organizationId: string;
  iterationIndex: number;
  attempt: string;
  outcome: "success" | "failure" | "partial";
  summary: string | null;
  error: string | null;
  createdAt: string;
};

type RecordIterationResult = {
  ok: true;
  iteration: GoalRunIteration;
};
```

HTTP: `POST /v1/goal-run/iteration`
MCP stdio: `record_iteration`

The repository atomically increments `iterationCount`, inserts the ordered
iteration, and links any same-org `memoryIds` to `memory_records.goal_run_id`.
Closed or cross-org runs fail rather than accepting new iterations.

---

### get_goal_run — fetch one run with iterations

```ts
type GetGoalRunInput = {
  organizationId?: string;
  goalRunId: number;
};

type GoalRunWithIterations = GoalRun & {
  iterations: GoalRunIteration[];
};

type GetGoalRunResult = {
  ok: true;
  goalRun: GoalRunWithIterations | null;
};
```

HTTP: `POST /v1/goal-run/get`
MCP stdio: `get_goal_run`

Returns `null` when the run is missing or outside the caller's organization.

---

### list_goal_runs — list scoped runs

```ts
type ListGoalRunsInput = {
  organizationId?: string;
  scope?: "project" | "user";    // default "project"
  projectKey?: string;           // required for project scope
  userScopeId?: string;          // resolved like memory user-scope tools
  status?: "active" | "completed" | "abandoned";
};

type ListGoalRunsResult = {
  ok: true;
  goalRuns: GoalRun[];
};
```

HTTP: `POST /v1/goal-run/list`
MCP stdio: `list_goal_runs`

Use this at session start to discover active or recently closed runs for a
project/user scope.

---

### complete_goal_run — close a run as completed

```ts
type CompleteGoalRunInput = {
  organizationId?: string;
  goalRunId: number;
  resolution?: string | null;    // stored as closeNote; secret-scrubbed
};

type CompleteGoalRunResult = {
  ok: true;
  goalRun: GoalRun;
};
```

HTTP: `POST /v1/goal-run/complete`
MCP stdio: `complete_goal_run`

Only active same-org runs can be completed. Closing a run makes its linked
memories eligible for future compaction again.

---

### abandon_goal_run — close a run as abandoned

```ts
type AbandonGoalRunInput = {
  organizationId?: string;
  goalRunId: number;
  reason?: string | null;        // stored as closeNote; secret-scrubbed
};

type AbandonGoalRunResult = {
  ok: true;
  goalRun: GoalRun;
};
```

HTTP: `POST /v1/goal-run/abandon`
MCP stdio: `abandon_goal_run`

Only active same-org runs can be abandoned. The optional `reason` is persisted
as `goalRun.closeNote`.

---

### build_goal_context — render goal-focused continuation context

```ts
type BuildGoalContextInput = {
  organizationId?: string;
  goalRunId: number;
  limit?: number;                // max 200
};

type BuildGoalContextResult = {
  ok: true;
  found: boolean;
  goalRunId: number;
  packMarkdown: string;
};
```

HTTP: `POST /v1/goal-run/context`
MCP stdio: `build_goal_context`

When the run exists, the pack includes the goal, termination criteria, recent
iterations, last error, and normal context-pack sections from scoped memories.
Missing runs return `found: false` and an empty `packMarkdown`.

---

### check_repeat_attempt — detect repeated failed attempts

```ts
type CheckRepeatAttemptInput = {
  organizationId?: string;
  goalRunId: number;
  attempt: string;               // secret-scrubbed before embedding
  threshold?: number;            // default 0.85, range (0, 1]
};

type CheckRepeatAttemptResult = {
  ok: true;
  found: boolean;
  repeat: boolean;
  threshold: number;
  matches: Array<{
    iterationIndex: number;
    attempt: string;
    score: number;
  }>;
};
```

HTTP: `POST /v1/goal-run/check-repeat`
MCP stdio: `check_repeat_attempt`

Embeds the candidate attempt and compares it with prior failed iterations in
the same goal run. Use this before retrying a strategy so the agent can avoid
looping on approaches that already failed.

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

Emitted background sweeper metrics (only after a loop tick has run):

- `akasha_sweeper_ticks_total{worker,status}` — compaction/ingest sweeper tick
  counter.
- `akasha_sweeper_tick_duration_seconds_count{worker,status}` — sweeper tick
  duration sample count.
- `akasha_sweeper_tick_duration_seconds_sum{worker,status}` — cumulative
  sweeper tick duration.
- `akasha_sweeper_rows_total{worker,outcome}` — rows observed by sweepers by
  bounded outcome (`scanned`, `cleaned`, `completed`, `retried`, `failed`).

These tick counters are in-process. The dedicated `npm run start:worker`
process currently has no HTTP metrics listener. If sweepers run there, use
worker process logs for tick activity and use HTTP `/metrics` for backlog
gauges. Add a worker-local metrics endpoint or sidecar only if Prometheus must
scrape per-worker tick counters from that process.

Emitted background queue backlog metrics:

- `akasha_background_queue_collect_success` — `1` when the scrape-time backlog
  collection succeeded, `0` when it failed.
- `akasha_background_queue_rows{queue,state}` — current backlog counts for
  `queue` values `ingest` and `compaction`, with `state` values `pending`,
  `due`, and `failed`.

Route labels use static route names such as `/v1/memory/search`, `/mcp`,
`/admin/memory`, `/healthz`, `/readyz`, `/metrics`, or `unknown`. Raw URLs and
query strings are never emitted. Labels and values do not include bearer
tokens, organization IDs, request bodies, search queries, or memory content.
Sweeper labels are fixed worker/status/outcome names and do not include row ids,
organization ids, or error strings.
Background queue labels are fixed queue/state names and do not include row ids,
organization ids, or error strings. Backlog collection failures keep `/metrics`
at HTTP 200 with `akasha_background_queue_collect_success 0`.

Readiness dependency metrics come only from the most recent `/readyz` result:

- `akasha_dependency_up{name="postgres"}` — `1` when the latest check passed,
  `0` when it failed.
- `akasha_dependency_check_duration_seconds{name="postgres"}` — duration of
  the latest check.

If `/readyz` has not run yet, dependency metrics are omitted. `/metrics` does
not call readiness probes for Postgres, Qdrant, or OpenAI, but production
servers do issue read-only Postgres count queries for background queue backlog
gauges.
