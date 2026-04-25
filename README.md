> **English** | [한국어](README.ko.md)

# context-forge

A persistent-memory MCP server for AI coding agents. Attach it to Claude Code,
Codex CLI, or any MCP client and the agent gets durable, searchable memory
across sessions — decisions, constraints, summaries — backed by Postgres +
Qdrant for full vector search.

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

# 1. Copy the env template and fill in OPENAI_API_KEY at minimum.
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
