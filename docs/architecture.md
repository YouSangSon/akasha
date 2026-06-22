> **English** | [한국어](architecture.ko.md)

# Architecture

This document explains how Akasha is structured and how data flows
through it. For per-tool API details see [api-reference.md](api-reference.md);
for env-var setup see [configuration.md](configuration.md).

## Layers

```
┌────────────────────────────────────────────────────────────────┐
│ Clients                                                         │
│   • Claude Code / Codex CLI  (MCP stdio)                        │
│   • curl / app code          (HTTP JSON)                        │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│ Transports                                                      │
│   src/mcp/server.ts          → MCP SDK stdio                    │
│   src/app/server.ts          → http.createServer                │
│   src/app/middleware/*       → bearer auth, rate limit, envelope│
│   src/app/routes/memory.ts   → POST /v1/* dispatch              │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│ Tool registry  (src/mcp/server.ts)                              │
│   add_memory / search_memory / build_context_pack /             │
│   reindex_memory / compact_memory / unarchive_memory /          │
│   list_audit_log                                                │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│ Domain orchestrators                                            │
│   src/compact/compact-memory.ts        plan builder             │
│   src/compact/apply-compaction.ts      destructive apply path   │
│   src/compact/unarchive-compaction.ts  recovery flow            │
│   src/compact/outbox-sweeper.ts        Qdrant cleanup retry     │
│   src/compact/sweeper-loop.ts          background scheduler     │
│   src/context-pack/build-context-pack.ts  pack assembler        │
│   src/search/retrieve-memory.ts        Qdrant + PG join         │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│ Repositories                                                    │
│   src/store/memory-repository.ts          memory_records, sources│
│   src/store/canonical-indexing.ts         memory_chunks + Qdrant│
│   src/store/memory-archive-repository.ts  compaction_runs +     │
│                                           memory_archive        │
│   src/jobs/ingest-job-repository.ts       ingest_jobs           │
│   src/audit/audit-log-repository.ts       audit_log             │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│ Persistence                                                     │
│   Postgres 16  (compose container or external)                  │
│   Qdrant       (compose container or external)                  │
│   Embeddings   (transformers local ONNX [default] / openai /   │
│                 local deterministic)                            │
└─────────────────────────────────────────────────────────────────┘
```

## Data flow: write

```
Client          Tool                Orchestrator       Repos                Stores
──────          ────                ────────────       ─────                ──────
add_memory  →  add_memory tool  →  writeCanonical  →  memory-repo      →  Postgres (sources, memory_records)
                                   Memory             canonical-       →  Postgres (memory_chunks)
                                                      indexing
                                                      ingestJobs       →  Postgres (ingest_jobs: write-ahead pending)
                                                      embeddings.embed →  transformers / openai / local
                                                      vectorIndex      →  Qdrant or pgvector (chunk vectors)
                                                      ingestJobs       →  Postgres (ingest_jobs: mark completed)
```

Write-ahead outbox: after chunks are committed to Postgres,
`writeCanonicalMemory` calls `markQdrantPending` to record a scheduled
`qdrant_next_retry_at` before touching Qdrant. If the process crashes between
that point and `markQdrantCompleted`, the job row is left with
`qdrant_status='pending'` and a non-null retry timestamp so the ingest sweeper
(`src/compact/ingest-sweeper.ts`, opt-in via `INGEST_SWEEP_ENABLED`) can
re-index the already-committed chunks. In-process failures still go through the
catch block (option-A delete: CASCADE removes record + chunks + job + no orphan),
so `add_memory` success/failure semantics are unchanged.

Pre-write: `assertNoSecrets(content)` runs in
`src/store/secret-scrub.ts` — refuses to persist content matching API key /
PEM / bearer / JWT patterns. The check happens in `writeCanonicalMemory`
before any store touch, so a positive detection short-circuits with no
side effects.

## Data flow: read

```
search_memory  →  search tool  →  retrieveMemory  →  embeddings.embed  →  transformers / openai / local
                                  (Qdrant + PG)     qdrantClient.query →  Qdrant (cosine, scope-filtered)
                                                    repository         →  Postgres (hydrate by id)
                                                    .getMemoryRecordsByIds
                                                    rankResults        →  in-memory ranking
```

Org filter is applied at both the Qdrant query layer (payload filter) and
the Postgres hydration layer (defense-in-depth — if Qdrant returned a
cross-org point id, the PG join filters it out).

## Data flow: compact apply (P17)

```
compact_memory dryRun=false
  ↓
applyCompaction (src/compact/apply-compaction.ts)
  ├─ rate-limit check        (countRecentApplyRuns, 1/h/org default)
  ├─ createCompactionRun     (UUID idempotency_key, ON CONFLICT DO NOTHING)
  ├─ for each archive candidate:
  │    ├─ applyCompactionRecord    (single CTE: DELETE memory_records
  │    │                            + INSERT memory_archive, TOCTOU-guarded
  │    │                            by updated_at <= planGeneratedAt)
  │    ├─ qdrantClient.deletePoints
  │    └─ markQdrantStatus('deleted')
  │       (or 'pending' on Qdrant failure → sweeper picks up)
  └─ completeCompactionRun
```

Cross-store consistency: PG-first means a crash after PG commit but before
Qdrant delete leaves an orphan vector in Qdrant. The sweeper
(`src/compact/sweeper-loop.ts`, opt-in) reconciles. Reverse order would
leave a live `memory_records` row pointing at a deleted Qdrant point — a
user-visible "search hit vanishes" bug.

## Data flow: unarchive (P19.1)

```
unarchive_memory
  ↓
unarchiveCompaction (src/compact/unarchive-compaction.ts)
  ├─ findArchiveByIds         (org-scoped)
  ├─ for each archive row:
  │    ├─ skip if already_unarchived / org mismatch / pre-P19.1 (no source_id)
  │    ├─ restoreToCanonical  (INSERT memory_records preserving original
  │    │                       timestamps + source_id; new BIGSERIAL id)
  │    ├─ chunkText + insertChunks
  │    ├─ embeddings.embedBatch (per restored archive)
  │    ├─ qdrantClient.upsert (new point ids)
  │    ├─ chunkRepository.updatePointIds
  │    └─ markUnarchived (set unarchived_at = NOW())
```

The restore path guards provider consistency: `embedBatch` must return one
vector per stored chunk, or that archive is reported as a failed outcome.

Per-archive failure isolation: one bad restore doesn't kill the batch;
the response carries per-archive `outcomes[]` so callers see exactly
what succeeded and what didn't.

## Schema

```
sources                memory_records          memory_chunks
─────────              ──────────────          ─────────────
id PK                  id PK                   id PK
organization_id        organization_id         organization_id
scope_type             scope_type              memory_record_id FK
scope_id               scope_id                chunk_index
source_type            project_key             content
source_ref             kind                    qdrant_point_id (→ Qdrant)
captured_at            content                 embedding_provider
                       summary                 embedding_dimensions
                       durability              embedding_version
                       importance              created_at
                       source_id FK
                       created_at
                       updated_at

ingest_jobs            relationships           audit_log
───────────            ─────────────           ─────────
id PK                  id PK                   id PK
memory_record_id FK    from_memory_record_id   organization_id
organization_id        to_memory_record_id     actor / tool
status                 relation_type           outcome / error_message
attempts               created_at              duration_ms / request_id
last_error                                      metadata JSONB
qdrant_status                                   created_at
qdrant_attempts
qdrant_next_retry_at
qdrant_last_error

compaction_runs        memory_archive
───────────────        ──────────────
id PK                  id PK
organization_id        compaction_run_id FK
actor                  organization_id
scope_type/id          source_record_id (former memory_records.id)
dry_run                source_id (loose ref to sources)
status                 archive_reason ('duplicate'|'decay')
archived/duplicate/    qdrant_point_ids TEXT[]
  decay/qdrant_failed  qdrant_status ('pending'|'deleted'|'failed')
                       qdrant_attempt_count
plan_generated_at      qdrant_cleaned_at
started_at             original_created_at / original_updated_at
completed_at           archived_at / unarchived_at
idempotency_key UUID   UNIQUE (compaction_run_id, source_record_id)
```

Migrations live in `src/db/migrations/`. The runner applies `001` through
`008` on bootstrap (each is idempotent, `CREATE … IF NOT EXISTS` /
`ADD COLUMN IF NOT EXISTS`). `007_ingest_jobs_qdrant_outbox.sql` is now
registered in `MIGRATION_FILES` and supplies the `qdrant_*` ingest-outbox
columns used by the background ingest sweeper.

## Multi-tenancy

Every record-bearing table has `organization_id TEXT NOT NULL`. SQL queries
include `WHERE organization_id = $org` in every read and write path. Bearer
tokens in `MEMORY_API_TOKENS` may bind to an org with `:org` syntax — when
present, the token's org overrides body / header values; mismatch is 403.

**Org enforcement on all read paths.** `retrieveMemory` (search),
`listMemory` (used by `compact_memory`), and `getMemoryRecordsByIds`
(vector-hydration step) all throw when `organizationId` is undefined and
the operator has not set `LEGACY_ANONYMOUS_SEARCH=true`. This means an
unbound token (no `:org` in `MEMORY_API_TOKENS`, no `x-organization-id`
header, no body org) cannot silently read across tenants — it receives a
clear operational error describing all three remediation paths. The shared
`assertOrganizationId` helper (`src/store/assert-organization-id.ts`)
enforces this consistently across all three entry points.

The `organization_id` written into `memory_archive` during apply is read
from the canonical record itself (RETURNING from the DELETE), not from
the caller token — defense-in-depth against the unlikely case where a
token's bound org disagrees with a record's org.

## Audit trail

Every tool invocation produces an `audit_log` row via the `instrument()`
wrapper in `src/mcp/server.ts`. The row captures org, actor, tool name,
project key, outcome (`ok`/`error`), error message, duration ms, request
id, and (for destructive operations) `metadata` JSONB with structured
detail (archived ids, run ids, etc.).

Reads via `list_audit_log` are org-scoped — entries from other orgs never
leak. Writes are best-effort (failures don't block the user request) but
logged at error level so ops can detect audit-stream issues.

## Vector backend pluggability

`src/mcp/canonical-services.ts` selects the vector backend via
`VECTOR_BACKEND` (default: `qdrant`):

- `qdrant` **(default)** → `src/vector/qdrant-index.ts`, wraps
  `@qdrant/js-client-rest`. Requires `QDRANT_URL` + `QDRANT_API_KEY`.
- `pgvector` → `src/vector/pgvector-index.ts`, stores embeddings in
  Postgres using the `vector` extension. Reuses the existing PG pool —
  **no second service needed**. Qdrant credentials are not required.
  `ensureCollection(dims)` verifies the `vector` extension is already
  installed, then creates the table and HNSW/BTree indexes at bootstrap;
  subsequent restarts are no-ops (`CREATE … IF NOT EXISTS`).

Both adapters implement the `VectorIndex` interface
(`src/vector/vector-index.ts`): `ensureCollection`, `upsert`, `query`,
`delete`. Filter translation (`VectorFilter` → Qdrant `must` / SQL
`WHERE`) is encapsulated inside each adapter so no Qdrant or pgvector
SQL dialect leaks into orchestration code.

### Postgres-only deploy

Set `VECTOR_BACKEND=pgvector` to run Akasha on a single Postgres
instance with no Qdrant service. The local compose override
`compose.pgvector.yaml` swaps in `pgvector/pgvector:pg16`:

```bash
docker compose -f compose.yaml -f compose.pgvector.yaml up -d
```

**Switching backends requires a reindex** (`reindex_memory` tool) —
vector dimensions and content topology differ between backends.

## Embedding pluggability

`src/embedding/embedding-factory.ts` selects the provider via
`EMBEDDING_PROVIDER` (default: `transformers`):

- `transformers` **(default)** → `src/embedding/transformers-embedding.ts`,
  free local ONNX inference via `@huggingface/transformers` (optional dep).
  Default model `Xenova/all-MiniLM-L6-v2`, 384-dim. First call downloads
  ~22 MB to the HF cache; subsequent calls are fully offline. No API key
  required.
- `openai` → `src/embedding/openai-embeddings.ts`,
  `text-embedding-3-small`, 1536-dim. Requires `OPENAI_API_KEY`.
- `local` → `src/embedding/local-embeddings.ts`, deterministic SHA-256
  hashing into 384-dim vectors. No external calls; intended for CI /
  air-gapped / offline use where semantic search is not needed.

The provider is selected at bootstrap and held in `services.embeddings`
for the process lifetime. Changing provider requires a reindex
(`reindex_memory` tool) because dimensions and content semantics differ.
