> **English** | [한국어](README.ko.md)

# Akasha

[![CI](https://github.com/YouSangSon/akasha/actions/workflows/ci.yml/badge.svg)](https://github.com/YouSangSon/akasha/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue.svg)](https://modelcontextprotocol.io/)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)

**Persistent memory for AI coding agents — free, local, self-hosted.**

Attach it to Claude Code, Codex CLI, or any MCP client and the agent
gains durable, searchable memory across sessions: decisions, constraints,
summaries. Postgres for canonical state, Qdrant for vector search, ONNX
embeddings running locally — **no API key required**, `$0` cost, your
data stays on your box.

> Named after the *Akashic records* — the mythical compendium of all
> knowledge. Akasha is where your agents write down what's worth remembering.

## How does it compare?

| | **Akasha** | doobidoo/mcp-memory-service | coleam00/mcp-mem0 | mem0ai/mem0 | letta-ai/letta | getzep/zep |
|---|---|---|---|---|---|---|
| **Free out of the box** | ✅ | ✅ | ❌ (OpenAI) | ❌ (OpenAI default) | ❌ (hosted) | ❌ (Cloud SaaS) |
| **Data stays on your box** | ✅ | ✅ | partial (OpenAI calls) | partial (OpenAI calls) | ❌ (Letta Cloud) | ❌ (Zep Cloud) |
| **MCP-native protocol** | ✅ | ✅ | ✅ (wraps Mem0) | wrapper only | wrapper only | ❌ |
| **Multi-tenant out of the box** | ✅ (`organization_id`, token-org binding, SQL + vector filters) | ❌ | inherits Mem0 | ✅ | ✅ | ✅ |
| **Postgres + vector backend** | ✅ (Qdrant default; pgvector option for Postgres-only deploy) | SQLite-vec | Supabase + pgvector | varies | varies | proprietary |
| **OSS path actively maintained** | ✅ | ✅ | ✅ (template repo) | ✅ | ✅ | ❌ (CE deprecated 2025) |

The MCP memory ecosystem norm is *free/local default* — doobidoo (1.7k★) headlines
`$0` cost, and the convergent free embedding model (`all-MiniLM-L6-v2`) is what
Akasha uses too. Where Akasha distinctively goes further: a
**Postgres canonical store separate from the vector index** (so a Qdrant
collection rebuild loses 0 data and reindex is one tool call), **org-scoped
multi-tenancy at the SQL and vector layers** (peers either skip it or rely on
the upstream framework), and **MCP-native rather than wrapper** (no shim
between the protocol and the memory engine). For deployments where running a
second service is inconvenient, set `VECTOR_BACKEND=pgvector` to store vectors
in Postgres itself — no Qdrant required.

If you need a hosted memory product with a polished UI, look at Mem0 or Letta.
If you need a self-hosted memory MCP server with no API key required, this is
that.

## Features

Beyond the free/local/multi-tenant basics above, Akasha is built to be
operated in production:

- **Canonical store, derived index.** Postgres holds the truth; the vector
  index is rebuildable. A wiped vector index costs 0 data — one
  `reindex_memory` tool call re-embeds Postgres chunks in bounded pages.
- **Crash-safe ingest.** Writes record a write-ahead intent before touching the
  vector store; a background sweeper retries any upsert that failed mid-flight
  (visibility-timeout claim, `FOR UPDATE SKIP LOCKED`). No silent index drift.
- **Secrets scrubbed at write.** Content is scanned before it ever lands —
  API keys, PEM blocks, bearer tokens, and JWTs are rejected (`SecretDetectedError`)
  rather than persisted.
- **Compaction with a dry run.** Exact + semantic dedup and time-decay archival
  are previewed by default (`dryRun: true`); apply is idempotent and
  rate-limited. Archived records are restorable via `unarchive_memory`.
- **Audited and rate-limited.** Every tool call lands in an org-scoped audit log;
  per-token rate limits protect the HTTP API.
- **Dual MCP transports plus JSON HTTP.** MCP clients can use stdio or
  Streamable HTTP at `POST /mcp`; scripts and non-MCP clients can keep using
  JSON HTTP under `/v1/*`.
- **Production health probes.** `/healthz` (liveness) and a dependency-aware
  `/readyz` (readiness) drive Kubernetes / load-balancer health checks.
- **Pluggable vector backend.** Qdrant by default, or `VECTOR_BACKEND=pgvector`
  to run on Postgres alone.

## Why

Conversations with coding agents lose context the moment the session ends.
Akasha is the place those agents save what's worth remembering and
read it back next time. The same 7 tools are exposed over MCP stdio,
MCP Streamable HTTP at `POST /mcp`, and JSON-HTTP under `/v1/*` — full
request/response schemas live in
[docs/api-reference.md](docs/api-reference.md).
HTTP and MCP share the same seven-tool schema surface, so validation and
payload shapes stay aligned across both transports.

| Tool | What it does | HTTP route |
|------|--------------|------------|
| `add_memory` | Save a decision, fact, or summary (secret-scrubbed at write) | `POST /v1/memory` |
| `search_memory` | Hybrid vector + lexical scope-filtered retrieval | `POST /v1/memory/search` |
| `build_context_pack` | Generate a compact pack to seed a new session | `POST /v1/memory/context-pack` |
| `compact_memory` | Prune duplicates and decayed records (apply or dry-run) | `POST /v1/memory/compact` |
| `reindex_memory` | Rebuild the vector index from Postgres (0 data loss) | `POST /v1/memory/reindex` |
| `unarchive_memory` | Restore archived records for forensic recovery | `POST /v1/memory/unarchive` |
| `list_audit_log` | Read the audit trail for compliance / debugging | `POST /v1/audit/list` |

Multi-tenant (`organization_id` per record), bearer-token authenticated,
audit-logged, and rate-limited. Designed to run as a single-user MCP server
on your laptop or a multi-team backend in your infra. Personal users can
ignore orgs entirely — see
[Personal / single-tenant use](docs/configuration.md#personal--single-tenant-use).

## Quick start

Requires Docker (for Postgres + Qdrant) and Node.js ≥ 20.

```bash
git clone https://github.com/YouSangSon/akasha.git
cd akasha

# 1. Copy the env template (defaults work — OPENAI_API_KEY only needed if
#    you set EMBEDDING_PROVIDER=openai later).
cp .env.example .env
${EDITOR:-nano} .env

# 2. Bring up Postgres + Qdrant + run migrations + build.
./install.sh

# 3. Point your MCP client at it. Claude Desktop config:
cat <<EOF
{
  "mcpServers": {
    "akasha": {
      "command": "node",
      "args": ["$(pwd)/dist/src/cli.js"]
    }
  }
}
EOF
```

## Worked example

Save a decision, search it back, then build a pack to seed a fresh session —
over the HTTP API (the MCP tools take the same fields). Responses are
abbreviated for illustration.

```bash
TOKEN=$MEMORY_API_TOKENS   # from your .env

# 1. Save a memory.
curl -sX POST http://localhost:8787/v1/memory \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"projectKey":"checkout","kind":"decision",
       "content":"Use idempotency keys on POST /charge to make retries safe."}'
# → {"success":true,"data":{"ok":true,"memoryId":"project:checkout:42",
#                           "summary":"Use idempotency keys on POST /charge…"}}

# 2. Search semantically — no keyword match needed.
curl -sX POST http://localhost:8787/v1/memory/search \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"projectKey":"checkout","query":"how do we avoid double-charging?"}'
# → {"success":true,"data":{"ok":true,"results":[
#      {"id":42,"memoryType":"decision",
#       "content":"Use idempotency keys on POST /charge…"}]}}

# 3. Build a context pack to paste into a new agent session.
curl -sX POST http://localhost:8787/v1/memory/context-pack \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"projectKey":"checkout","task":"add refund endpoint"}'
# → data.packMarkdown is ready to drop into your prompt.
```

## Architecture

| Layer | Responsibility |
|-------|----------------|
| MCP server (`src/mcp/`) | Shared MCP server surface: tool descriptors, schemas, registry, and handlers |
| HTTP server (`src/app/`) | Serves MCP Streamable HTTP at `/mcp` plus JSON HTTP under `/v1/*` |
| Canonical store (`src/store/memory-repository.ts`) | Postgres — records, sources, ingest jobs, audit |
| Vector index (`src/vector/`) | Qdrant (default) or pgvector — chunked embeddings + similarity search. Set `VECTOR_BACKEND=pgvector` for Postgres-only deploy. |
| Compaction (`src/compact/`) | Dedup (exact + semantic), decay, archive, unarchive, sweeper |
| Embeddings (`src/embedding/`) | `transformers` (free local ONNX, default), `openai` (`text-embedding-3-small`), or `local` (deterministic stub for CI) |

Data flow: caller writes `add_memory` → record persisted to Postgres + chunked
+ embedded + upserted to the active vector backend. `search_memory` → embed
query → vector similarity search → hydrate from Postgres → rank → return. See
[docs/architecture.md](docs/architecture.md) for design details.

## Configuration

All knobs are env vars. The three a first-timer usually touches:

| Var | Default | Purpose |
|-----|---------|---------|
| `MEMORY_API_TOKENS` | _(required)_ | Bearer tokens for the HTTP API; `token:org` binds a token to an org |
| `EMBEDDING_PROVIDER` | `transformers` | `transformers` (free local ONNX), `openai`, or `local` (CI stub) |
| `VECTOR_BACKEND` | `qdrant` | `qdrant`, or `pgvector` for a Postgres-only deploy |

`OPENAI_API_KEY` is optional — only needed when `EMBEDDING_PROVIDER=openai`.
Everything else has sensible defaults. See [.env.example](.env.example) for the
complete list and [docs/configuration.md](docs/configuration.md) for types,
defaults, and examples.

## Documentation

Full operator and contributor docs live in [`docs/`](docs/README.md). Every
page has a Korean (`*.ko.md`) mirror.

| Topic | Description |
|-------|-------------|
| [Architecture](docs/architecture.md) | Component diagram, data flow, embedding providers, migration history |
| [Configuration](docs/configuration.md) | Every environment variable with types, defaults, examples |
| [API reference](docs/api-reference.md) | HTTP endpoints and MCP tool schemas |
| [Deployment](docs/deployment.md) | Docker Compose setup, production checklist |
| [Operations](docs/operations.md) | Day-to-day tasks: health checks, compaction, audit log |
| [Security](docs/security.md) | Auth model, secret scrubber, org isolation, threat model |
| [Self-hosted operations](docs/self-hosted-operations.md) | Backup, restore, and smoke-test runbook |
| [Troubleshooting](docs/troubleshooting.md) | Common failure modes and resolution steps |

## Common commands

```bash
npm run dev:server    # HTTP API in watch mode
npm run dev:mcp       # MCP stdio server in watch mode
npm run dev:cli       # CLI in watch mode
npm run typecheck     # tsc --noEmit
npm run test          # vitest run
npm run db:migrate    # apply pending migrations
npm run backup:create # backend-aware backup for VECTOR_BACKEND
npm run backup:create:pgvector # explicit Postgres-only pgvector backup
```

With `VECTOR_BACKEND=qdrant`, `backup:create` captures Postgres plus a Qdrant
snapshot. With `VECTOR_BACKEND=pgvector`, logical vector data lives in Postgres,
so `backup:create` skips `scripts/snapshot-qdrant.sh` and does not require
`QDRANT_URL`.

## Contributing & security

- **Contributing:** see [CONTRIBUTING.md](CONTRIBUTING.md) and the
  [Code of Conduct](CODE_OF_CONDUCT.md).
- **Security:** report vulnerabilities per [SECURITY.md](SECURITY.md) — please
  don't open public issues for them.
- **Changes:** the [CHANGELOG](CHANGELOG.md) tracks releases.

## License

[MIT](LICENSE) — © 2026 YouSangSon.
