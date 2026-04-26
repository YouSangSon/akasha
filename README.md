> **English** | [한국어](README.ko.md)

# context-forge

[![CI](https://github.com/YouSangSon/context-forge/actions/workflows/ci.yml/badge.svg)](https://github.com/YouSangSon/context-forge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue.svg)](https://modelcontextprotocol.io/)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)

**Persistent memory for AI coding agents — free, local, self-hosted.**

Attach it to Claude Code, Codex CLI, or any MCP client and the agent
gains durable, searchable memory across sessions: decisions, constraints,
summaries. Postgres for canonical state, Qdrant for vector search, ONNX
embeddings running locally — **no API key required**, `$0` cost, your
data stays on your box.

## How does it compare?

| | **context-forge** | doobidoo/mcp-memory-service | coleam00/mcp-mem0 | mem0ai/mem0 | letta-ai/letta | getzep/zep |
|---|---|---|---|---|---|---|
| **Free out of the box** | ✅ | ✅ | ❌ (OpenAI) | ❌ (OpenAI default) | ❌ (hosted) | ❌ (Cloud SaaS) |
| **Data stays on your box** | ✅ | ✅ | partial (OpenAI calls) | partial (OpenAI calls) | ❌ (Letta Cloud) | ❌ (Zep Cloud) |
| **MCP-native protocol** | ✅ | ✅ | ✅ (wraps Mem0) | wrapper only | wrapper only | ❌ |
| **Multi-tenant out of the box** | ✅ (`organization_id`, token-org binding, SQL + vector filters) | ❌ | inherits Mem0 | ✅ | ✅ | ✅ |
| **Postgres + Qdrant backend** | ✅ (canonical + vector separated) | SQLite-vec | Supabase + pgvector | varies | varies | proprietary |
| **OSS path actively maintained** | ✅ | ✅ | ✅ (template repo) | ✅ | ✅ | ❌ (CE deprecated 2025) |

The MCP memory ecosystem norm is *free/local default* — doobidoo (1.7k★) headlines
`$0` cost, and the convergent free embedding model (`all-MiniLM-L6-v2`) is what
context-forge uses too. Where context-forge distinctively goes further: a
**Postgres canonical store separate from the vector index** (so a Qdrant
collection rebuild loses 0 data and reindex is one tool call), **org-scoped
multi-tenancy at the SQL and vector layers** (peers either skip it or rely on
the upstream framework), and **MCP-native rather than wrapper** (no shim
between the protocol and the memory engine).

If you need a hosted memory product with a polished UI, look at Mem0 or Letta.
If you need a self-hosted memory MCP server with no API key required, this is
that.

## Why

Conversations with coding agents lose context the moment the session ends.
context-forge is the place those agents save what's worth remembering and
read it back next time:

- `add_memory` — save a decision, fact, or summary
- `search_memory` — vector + scope-filtered retrieval
- `build_context_pack` — generate a compact pack to seed a new session
- `compact_memory` — prune duplicates and decayed records (apply or dry-run)
- `unarchive_memory` — restore archived records for forensic recovery
- `list_audit_log` — audit trail for compliance / debugging

Multi-tenant (`organization_id` per record), bearer-token authenticated,
audit-logged, and rate-limited. Designed to run as a single-user MCP server
on your laptop or a multi-team backend in your infra. Personal users can
ignore orgs entirely — see
[Personal / single-tenant use](docs/configuration.md#personal--single-tenant-use).

## Quick start

Requires Docker (for Postgres + Qdrant) and Node.js ≥ 20.

```bash
git clone https://github.com/YouSangSon/context-forge.git
cd context-forge

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
    "context-forge": {
      "command": "node",
      "args": ["$(pwd)/dist/src/cli.js"]
    }
  }
}
EOF
```

For HTTP-API clients (CLIs other than MCP):
```bash
curl -X POST http://localhost:8787/v1/memory/search \
  -H "Authorization: Bearer $MEMORY_API_TOKENS" \
  -H "Content-Type: application/json" \
  -d '{"projectKey": "my-project", "query": "what did we decide about caching"}'
```

## Architecture

| Layer | Responsibility |
|-------|----------------|
| MCP server (`src/mcp/`) | Tool surface for Claude/Codex CLI clients (stdio) |
| HTTP server (`src/app/`) | Same tool surface as JSON-over-HTTP for non-MCP clients |
| Canonical store (`src/store/memory-repository.ts`) | Postgres — records, sources, ingest jobs, audit |
| Vector index (`src/store/canonical-indexing.ts`) | Qdrant — chunked embeddings + similarity search |
| Compaction (`src/compact/`) | Dedup (exact + semantic), decay, archive, unarchive, sweeper |
| Embeddings (`src/embedding/`) | OpenAI `text-embedding-3-small` or offline-deterministic local |

Data flow: caller writes `add_memory` → record persisted to Postgres + chunked
+ embedded + upserted to Qdrant. `search_memory` → embed query → Qdrant cosine
search → hydrate from Postgres → rank → return. See
[docs/architecture.md](docs/architecture.md) for design details.

## Common commands

```bash
npm run dev:server    # HTTP API in watch mode
npm run dev:mcp       # MCP stdio server in watch mode
npm run dev:cli       # CLI in watch mode
npm run typecheck     # tsc --noEmit
npm run test          # vitest run
npm run db:migrate    # apply pending migrations
npm run backup:create # snapshot Postgres + Qdrant to BACKUP_DIR
```

## Configuration

All knobs are env vars. See [.env.example](.env.example) for the complete
list. Required: `OPENAI_API_KEY`, `MEMORY_API_TOKENS`. Everything else has
sensible defaults.

## License

[MIT](LICENSE) — © 2026 YouSangSon.
