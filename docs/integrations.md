> **English** | [한국어](integrations.ko.md)

# Agent integrations

Akasha exposes the same memory surface through MCP stdio, MCP Streamable HTTP,
and JSON HTTP. For agent lifecycle use, prefer this pattern:

1. **Session start** — build a context pack for the project/task and inject it
   into the agent's first prompt or session context.
2. **During work** — call `add_memory` only for durable decisions, constraints,
   facts, or summaries. Do not store raw transcripts by default.
3. **Session end** — ask the agent to save a short durable summary when useful.

## One-command init

After `npm run build`, generate MCP config snippets and lifecycle hook scripts:

```bash
node dist/src/cli.js init \
  --project my-project \
  --organization-id default \
  --task "continue implementation"
```

This writes:

- `.akasha/mcp/claude-desktop.json`
- `.akasha/mcp/codex.toml`
- `.akasha/bin/mcp-server.sh`
- `.akasha/hooks/session-start.sh`
- `.akasha/hooks/session-end.sh`

The MCP config snippets point at the wrapper script, which sources `.env` at
runtime and starts `dist/src/mcp/server.js`. Secrets stay in `.env` instead of
being copied into client config JSON/TOML.

Use the hooks directly when your agent host supports lifecycle commands:

```bash
.akasha/hooks/session-start.sh "continue implementation"
printf '%s\n' "Summary: durable outcome ..." | .akasha/hooks/session-end.sh
```

`./install.sh` runs the same init step after build and migrations. Re-running
init skips existing files by default; pass `--force` to refresh generated files.

## MCP stdio

Build first:

```bash
npm run build
```

Claude Desktop / Claude Code style MCP config:

```json
{
  "mcpServers": {
    "akasha": {
      "command": "node",
      "args": ["/absolute/path/to/akasha/dist/src/mcp/server.js"],
      "env": {
        "DATABASE_URL": "postgres://memory:memory@127.0.0.1:5432/memory_os",
        "VECTOR_BACKEND": "qdrant",
        "QDRANT_URL": "http://127.0.0.1:6333",
        "MEMORY_API_TOKENS": "dev-token:default"
      }
    }
  }
}
```

Codex CLI TOML shape:

```toml
[mcp_servers.akasha]
command = "node"
args = ["/absolute/path/to/akasha/dist/src/mcp/server.js"]

[mcp_servers.akasha.env]
DATABASE_URL = "postgres://memory:memory@127.0.0.1:5432/memory_os"
VECTOR_BACKEND = "qdrant"
QDRANT_URL = "http://127.0.0.1:6333"
MEMORY_API_TOKENS = "dev-token:default"
```

Use the MCP prompt `akasha_session_start` at the start of work. It asks Akasha
to build a context pack for the project/task. Use `akasha_store_memory` when the
agent has a durable decision or fact to save.

## CLI session-start fallback

When your agent host cannot invoke MCP prompts automatically, generate the pack
with the CLI and paste or inject the output:

```bash
node dist/src/cli.js pack \
  --project my-project \
  --organization-id default \
  --task "continue implementation"
```

To store a short session-end summary without an HTTP server:

```bash
node dist/src/cli.js remember \
  --project my-project \
  --organization-id default \
  --kind summary \
  --content "Summary: durable outcome ..."
```

For personal loopback deployments that intentionally use legacy anonymous
reads, omit `--organization-id` and set `LEGACY_ANONYMOUS_SEARCH=true` in the
environment. For token/org deployments, keep `--organization-id` explicit.

## HTTP lifecycle calls

Session start:

```bash
curl -sX POST http://localhost:8787/v1/memory/context-pack \
  -H "Authorization: Bearer $AKASHA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"organizationId":"default","projectKey":"my-project","task":"continue implementation"}'
```

Session end:

```bash
curl -sX POST http://localhost:8787/v1/memory \
  -H "Authorization: Bearer $AKASHA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"organizationId":"default","projectKey":"my-project","kind":"summary","content":"Decision: ..."}'
```

Keep session-end writes short and durable. Akasha rejects secret-shaped content
before persistence, but callers should still summarize rather than upload raw
logs or transcripts.
