<div align="center">

# 🧠 Akasha

**Persistent memory for AI coding agents.**

Keep decisions, constraints, and summaries across sessions.<br/>
Self-hosted storage, local embeddings, and MCP access for your coding workflow.

[![CI](https://github.com/YouSangSon/akasha/actions/workflows/ci.yml/badge.svg)](https://github.com/YouSangSon/akasha/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue.svg)](https://modelcontextprotocol.io/)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org/)

**English** · [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

[Overview](#overview) · [Quick start](#quick-start) · [Features](#features) · [Memory UI](#memory-ui) · [Architecture](#architecture) · [Documentation](#documentation)

</div>

---

<a id="overview"></a>
## At a glance

Akasha gives MCP clients a shared place to save and retrieve durable context.
Postgres stores the canonical records; Qdrant or pgvector provides a rebuildable
search index. The default `transformers` provider embeds text locally with ONNX,
without an embedding API key. Model files are downloaded on first use; client
subscriptions, optional paid APIs, and hosting costs are separate.

| Need | What Akasha provides |
|------|----------------------|
| Resume work in a fresh session | Searchable decisions and task-specific context packs |
| Keep control of stored memory | Self-hosted Postgres, org-scoped reads/writes, and an audit trail |
| Repair the search index | Rebuild vectors from canonical Postgres chunks |
| Run fewer services | `VECTOR_BACKEND=pgvector` stores vectors in Postgres instead of Qdrant |
| Review what an agent remembers | A memory UI to inspect, edit, tag, and archive records |

Named after the *Akashic records*: a place for agents to write down what is worth
remembering.

Code-intelligence MCP servers such as
[DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)
are complementary rather than replacements. They index repository symbols,
routes, call graph, and ADRs for structural code questions; Akasha stores
durable agent memory: decisions, constraints, summaries, org-scoped audit
trails, and context packs that follow work across sessions and clients.

<a id="quick-start"></a>
## Quick start

Requires Docker (for Postgres + Qdrant) and Node.js ≥ 22.

```bash
git clone https://github.com/YouSangSon/akasha.git
cd akasha

# 1. Copy the local development template and review its credentials.
#    OPENAI_API_KEY is only needed with EMBEDDING_PROVIDER=openai.
cp .env.example .env
${EDITOR:-nano} .env

# 2. Bring up Postgres + Qdrant + run migrations + build.
./install.sh

# 3. Add the generated configuration to your MCP client:
cat .akasha/mcp/claude-desktop.json
cat .akasha/mcp/codex.toml

# Optional lifecycle helpers for hosts that support session hooks:
.akasha/hooks/session-start.sh "continue implementation"
printf '%s\n' "Summary: durable outcome ..." | .akasha/hooks/session-end.sh
```

The installer prepares the database, build, and client snippets; it does not
start the HTTP server or export `.env` into your next terminal. For HTTP examples and the memory UI, keep this running
in a separate terminal:

```bash
set -a
source .env
set +a
export DATABASE_URL="${DATABASE_URL:-postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT:-5432}/${POSTGRES_DB}}"
npm run start:server
```

See [client integration recipes](docs/integrations.md) for configuration details.
Default Compose credentials are for local development; replace them before
exposing the service to other machines.

<a id="features"></a>
## Features

The implementation includes the following controls. Deployment readiness still
depends on your configuration, backups, and workload checks:

- **Canonical store, derived index.** Postgres holds the truth; the vector
  index is rebuildable while the canonical records and chunks remain intact.
  `reindex_memory` re-embeds those chunks in bounded pages; it is not a backup.
- **Recoverable ingest.** Writes record a write-ahead intent before touching the
  vector store. Enable the ingest sweeper to retry pending work after an
  interrupted write (visibility-timeout claim, `FOR UPDATE SKIP LOCKED`).
- **Secrets scrubbed at write.** Content is scanned before it ever lands —
  provider API keys, PEM blocks, bearer/JWT tokens, and credentialed database
  URLs are rejected (`SecretDetectedError`) rather than persisted.
- **Compaction with a dry run.** Exact + semantic dedup and time-decay archival
  are previewed by default (`dryRun: true`); apply is idempotent and
  rate-limited. Archived records are restorable via `unarchive_memory`.
- **Audit and rate-limit controls.** Tool calls attempt an org-scoped audit write;
  audit failures are logged. Configurable per-token HTTP limits are process-local.
- **Dual MCP transports plus JSON HTTP.** MCP clients can use stdio or
  Streamable HTTP at `POST /mcp`; scripts and non-MCP clients can keep using
  JSON HTTP under `/v1/*`.
- **Memory governance UI.** Operators can review, edit, tag, and archive
  records from the static `/admin/memory` shell while all data calls still go
  through the authenticated `/v1/*` API.
- **Production health probes.** `/healthz` (liveness) and a dependency-aware
  `/readyz` (readiness) drive Kubernetes / load-balancer health checks.
- **Pluggable vector backend.** Qdrant by default, or `VECTOR_BACKEND=pgvector`
  to run on Postgres alone.

<a id="memory-ui"></a>
## Memory UI

Open [http://localhost:8787/admin/memory](http://localhost:8787/admin/memory)
after starting the HTTP server. Enter one configured bearer token and its
organization ID, load the records, then inspect, edit, tag, or archive a memory.
The page uses the authenticated API and asks for confirmation before archiving.
See [memory governance](docs/operations.md) for the operator workflow.

## Tools and API

Conversations with coding agents lose context the moment the session ends.
Akasha is the place those agents save what's worth remembering and
read it back next time. The same 20 service tools are exposed over MCP
stdio, MCP Streamable HTTP at `POST /mcp`, and JSON-HTTP under `/v1/*` — full
request/response schemas live in
[docs/api-reference.md](docs/api-reference.md).
HTTP and MCP share that service schema surface, so validation and
payload shapes stay aligned across both transports. MCP additionally exposes
client-context helpers for workspace roots, user elicitation, and sampling when
the connected client advertises those capabilities.

| Tool | What it does | HTTP route |
|------|--------------|------------|
| `add_memory` | Save a decision, fact, or summary (secret-scrubbed at write) | `POST /v1/memory` |
| `search_memory` | Hybrid vector + lexical scope-filtered retrieval | `POST /v1/memory/search` |
| `build_context_pack` | Generate a compact pack to seed a new session | `POST /v1/memory/context-pack` |
| `compact_memory` | Prune duplicates and decayed records (apply or dry-run) | `POST /v1/memory/compact` |
| `reindex_memory` | Rebuild vectors from retained Postgres chunks | `POST /v1/memory/reindex` |
| `list_memory` | Review canonical records with tag / archived filters | `POST /v1/memory/list` |
| `inspect_memory_graph` | Inspect persisted entity mentions and relationships | `POST /v1/memory/graph` |
| `update_memory` | Edit one canonical record and refresh its vector state | `POST /v1/memory/update` |
| `delete_memory` | Governance archive of one record plus vector cleanup | `POST /v1/memory/delete` |
| `tag_memory` | Replace governance tags on one record | `POST /v1/memory/tag` |
| `unarchive_memory` | Restore archived records for forensic recovery | `POST /v1/memory/unarchive` |
| `list_audit_log` | Read the audit trail for compliance / debugging | `POST /v1/audit/list` |
| `start_goal_run` | Start a persistent objective with optional termination criteria | `POST /v1/goal-run/start` |
| `record_iteration` | Append an attempt/outcome and optionally pin linked memories | `POST /v1/goal-run/iteration` |
| `get_goal_run` | Fetch one goal run with ordered iterations | `POST /v1/goal-run/get` |
| `list_goal_runs` | List scoped goal runs by status | `POST /v1/goal-run/list` |
| `complete_goal_run` | Close an active goal run as completed with a resolution note | `POST /v1/goal-run/complete` |
| `abandon_goal_run` | Close an active goal run as abandoned with a reason note | `POST /v1/goal-run/abandon` |
| `build_goal_context` | Build goal-focused continuation context from run history and memory | `POST /v1/goal-run/context` |
| `check_repeat_attempt` | Detect candidate attempts that repeat prior failed iterations | `POST /v1/goal-run/check-repeat` |

MCP-only context tools: `list_workspace_roots` reads client-advertised roots,
`add_memory_interactive` uses MCP elicitation to collect and store
user-confirmed memory, and `classify_memory_candidate` uses MCP sampling to
suggest a memory kind and summary.

Multi-tenant (`organization_id` per record), bearer-token authenticated,
audit-logged, and rate-limited. Designed to run as a single-user MCP server
on your laptop or a multi-team backend in your infra. Personal users can use a single org label consistently — see
[Personal / single-tenant use](docs/configuration.md#personal--single-tenant-use).

## Worked example

Save a decision, search it back, then build a pack to seed a fresh session —
over the HTTP API (the MCP tools take the same fields). Responses are
abbreviated for illustration.

```bash
# Enter ONE configured token, without its optional :org suffix.
read -r -s -p "API token: " TOKEN
printf '\n'
ORGANIZATION_ID=default   # use the token's bound org if it has one

# 1. Save a memory.
curl -sX POST http://localhost:8787/v1/memory \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "x-organization-id: $ORGANIZATION_ID" \
  -d '{"projectKey":"checkout","kind":"decision",
       "content":"Use idempotency keys on POST /charge to make retries safe."}'
# → {"success":true,"data":{"ok":true,"memoryId":"project:checkout:42",
#                           "summary":"Use idempotency keys on POST /charge…"}}

# 2. Search semantically — no keyword match needed.
curl -sX POST http://localhost:8787/v1/memory/search \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "x-organization-id: $ORGANIZATION_ID" \
  -d '{"projectKey":"checkout","query":"how do we avoid double-charging?"}'
# → {"success":true,"data":{"ok":true,"results":[
#      {"id":42,"memoryType":"decision",
#       "content":"Use idempotency keys on POST /charge…"}]}}

# 3. Build a context pack to paste into a new agent session.
curl -sX POST http://localhost:8787/v1/memory/context-pack \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "x-organization-id: $ORGANIZATION_ID" \
  -d '{"projectKey":"checkout","task":"add refund endpoint"}'
# → data.packMarkdown is ready to drop into your prompt.
```

The optional `maxOutputBytes` context-pack input bounds the compact structured result in UTF-8 bytes. Selected decisions and constraints are retained; insufficient budgets fail. See the [API reference](docs/api-reference.md#build_context_pack--generate-a-session-priming-pack) for scope and CLI usage.

<a id="architecture"></a>
## Architecture

| Layer | Responsibility |
|-------|----------------|
| MCP server (`src/mcp/`) | Shared MCP server surface: tool descriptors, schemas, registry, and handlers |
| HTTP server (`src/app/`) | Serves MCP Streamable HTTP at `/mcp` plus JSON HTTP under `/v1/*` |
| Canonical store (`src/store/memory-repository.ts`) | Postgres — records, sources, ingest jobs, entity graph, audit |
| Vector index (`src/vector/`) | Qdrant (default) or pgvector — chunked embeddings + similarity search. Set `VECTOR_BACKEND=pgvector` for Postgres-only deploy. |
| Compaction (`src/compact/`) | Dedup (exact + semantic), decay, archive, unarchive, sweeper |
| Embeddings (`src/embedding/`) | `transformers` (free local ONNX, default), `openai` (`text-embedding-3-small`), or `local` (deterministic stub for CI) |

Data flow: caller writes `add_memory` → record persisted to Postgres, entity
mentions linked, content chunked + embedded + upserted to the active vector
backend. `search_memory` → embed query → vector similarity + Postgres
FTS/entity lexical search → hydrate → rank → return. See
[docs/architecture.md](docs/architecture.md) for design details.

## Configuration

All knobs are env vars. The three a first-timer usually touches:

| Var | Default | Purpose |
|-----|---------|---------|
| `MEMORY_API_TOKENS` | _(required unless OAuth JWT validation is configured)_ | Static bearer tokens for the HTTP API; `token:org` binds a token to an org |
| `EMBEDDING_PROVIDER` | `transformers` | `transformers` (free local ONNX), `openai`, or `local` (CI stub) |
| `VECTOR_BACKEND` | `qdrant` | `qdrant`, or `pgvector` for a Postgres-only deploy |

`OPENAI_API_KEY` is optional — only needed when `EMBEDDING_PROVIDER=openai`.
Everything else has sensible defaults. See [.env.example](.env.example) for the
complete list and [docs/configuration.md](docs/configuration.md) for types,
defaults, and examples.

<a id="documentation"></a>
## Documentation

This README is available in English, Korean, Japanese, and Simplified Chinese
with the same section order, examples, and capability scope. Detailed operator
and contributor documentation is maintained in English and Korean under
[`docs/`](docs/README.md). Japanese and Chinese README links use the English
reference pages.

| Topic | Description |
|-------|-------------|
| [Architecture](docs/architecture.md) | Component diagram, data flow, embedding providers, migration history |
| [Configuration](docs/configuration.md) | Every environment variable with types, defaults, examples |
| [API reference](docs/api-reference.md) | HTTP endpoints and MCP tool schemas |
| [Deployment](docs/deployment.md) | Docker Compose setup, production checklist |
| [Operations](docs/operations.md) | Day-to-day tasks: health checks, compaction, memory governance, audit log |
| [Security](docs/security.md) | Auth model, secret scrubber, org isolation, threat model |
| [Self-hosted operations](docs/self-hosted-operations.md) | Backup, restore, and smoke-test runbook |
| [Troubleshooting](docs/troubleshooting.md) | Common failure modes and resolution steps |

## Common commands

```bash
npm run dev:server    # HTTP API in watch mode
npm run dev:worker    # background sweepers in watch mode
npm run start:worker  # background sweepers from dist/
npm run dev:mcp       # MCP stdio server in watch mode
npm run dev:cli       # CLI in watch mode
npm run lifecycle:init -- --project my-project --organization-id default
npm run typecheck     # tsc --noEmit
npm run build         # clean dist/ and compile TypeScript
npm run audit:dependencies
npm test              # vitest run
npm run db:migrate    # apply pending migrations
npm run backup:create # backend-aware backup for VECTOR_BACKEND
npm run backup:create:pgvector # explicit Postgres-only pgvector backup
```

With `VECTOR_BACKEND=qdrant`, `backup:create` captures Postgres plus a Qdrant
snapshot. With `VECTOR_BACKEND=pgvector`, logical vector data lives in Postgres,
so `backup:create` skips `scripts/snapshot-qdrant.sh` and does not require
`QDRANT_URL`. Set `BACKUP_ENCRYPTION_KEY_FILE` to encrypt backup artifacts with
AES-256-GCM before any off-host copy.

## Status and limits

- The default setup runs locally; a passing CI badge is not proof of a production
  deployment. Current verification and unresolved delivery items are recorded in
  [GATES.md](https://github.com/YouSangSon/akasha/blob/main/GATES.md).
- Token savings depend on the client and workflow. Controlled MCP and CLI
  evaluations have separate results; they do not guarantee general savings,
  lower latency, or lower cost. See [evaluation evidence](https://github.com/YouSangSon/akasha/blob/main/GATES.md).
- Secret detection rejects known patterns; it cannot identify every possible
  secret. Keep credentials out of memory content.
- A rebuilt vector index does not recover deleted canonical data. Use tested
  backups and the [restore runbook](docs/self-hosted-operations.md).

## Contributing & security

- **Contributing:** see [CONTRIBUTING.md](CONTRIBUTING.md) and the
  [Code of Conduct](CODE_OF_CONDUCT.md).
- **Security:** report vulnerabilities per [SECURITY.md](SECURITY.md) — please
  don't open public issues for them.
- **Changes:** the [CHANGELOG](CHANGELOG.md) tracks releases.

## License

[MIT](LICENSE) — © 2026 YouSangSon.
