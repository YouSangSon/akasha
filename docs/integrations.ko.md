> [English](integrations.md) | **한국어**

# 에이전트 통합

Akasha는 MCP stdio, MCP Streamable HTTP, JSON HTTP에서 같은 메모리 surface를
제공합니다. 에이전트 lifecycle에는 이 패턴을 권장합니다:

1. **Session start** — project/task용 context pack을 만들고 에이전트 첫 prompt
   또는 session context에 주입.
2. **작업 중** — 오래 남길 decision, constraint, fact, summary만 `add_memory`로
   저장. raw transcript는 기본 저장하지 않음.
3. **Session end** — 유용할 때 에이전트에게 짧은 durable summary를 저장하게 함.

## One-command init

`npm run build` 후 MCP config snippet과 lifecycle hook script를 생성합니다:

```bash
node dist/src/cli.js init \
  --project my-project \
  --organization-id default \
  --task "continue implementation"
```

생성 파일:

- `.akasha/mcp/claude-desktop.json`
- `.akasha/mcp/codex.toml`
- `.akasha/bin/mcp-server.sh`
- `.akasha/hooks/session-start.sh`
- `.akasha/hooks/session-end.sh`

MCP config snippet은 wrapper script를 가리킵니다. 이 wrapper는 실행 시점에
`.env`를 source하고 `dist/src/mcp/server.js`를 시작합니다. Secret은 client
config JSON/TOML에 복사되지 않고 `.env`에 남습니다.

에이전트 host가 lifecycle command를 지원하면 hook을 직접 연결하세요:

```bash
.akasha/hooks/session-start.sh "continue implementation"
printf '%s\n' "Summary: durable outcome ..." | .akasha/hooks/session-end.sh
```

`./install.sh`도 build와 migration 후 같은 init 단계를 실행합니다. 기존 파일은
기본적으로 덮어쓰지 않으며, 갱신이 필요하면 `--force`를 전달합니다.

## MCP stdio

먼저 빌드:

```bash
npm run build
```

Claude Desktop / Claude Code 형태의 MCP config:

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

Codex CLI TOML 형태:

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

작업 시작 시 MCP prompt `akasha_session_start`를 사용하세요. 이 prompt는
project/task용 context pack 생성을 요청합니다. durable decision/fact를 저장할
때는 `akasha_store_memory`를 사용하세요.

## CLI session-start fallback

에이전트 host가 MCP prompt를 자동 호출하지 못하면 CLI로 pack을 만들고 출력물을
붙여넣거나 주입하세요:

```bash
node dist/src/cli.js pack \
  --project my-project \
  --organization-id default \
  --task "continue implementation"
```

HTTP 서버 없이 짧은 session-end summary를 저장하려면:

```bash
node dist/src/cli.js remember \
  --project my-project \
  --organization-id default \
  --kind summary \
  --content "Summary: durable outcome ..."
```

개인 loopback 배포에서 의도적으로 legacy anonymous read를 쓰는 경우
`LEGACY_ANONYMOUS_SEARCH=true`를 환경에 설정하고 `--organization-id`를 생략할 수
있습니다. token/org 배포에서는 `--organization-id`를 명시하세요.

## HTTP lifecycle 호출

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

Session-end write는 짧고 durable한 내용만 남기세요. Akasha는 secret-shaped
content를 persistence 전에 거부하지만, caller도 raw log나 transcript 대신 요약을
저장하는 편이 맞습니다.
