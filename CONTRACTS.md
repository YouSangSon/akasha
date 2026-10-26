# CONTRACTS

Akasha refactors must preserve the public contracts below unless a later PR
adds an explicit compatibility plan. `docs/api-reference.md` remains the full
per-tool schema reference; this file is the contract inventory for architecture
work.

## Contract Sources

- Shared service tool descriptors and JSON HTTP routes:
  `src/mcp/tool-schemas.ts`
- Tool registry dispatch and audit instrumentation:
  `src/mcp/tool-registry.ts`, `src/mcp/tool-registry-instrumentation.ts`
- Service tool implementations:
  `src/mcp/tool-handlers.ts`, `src/audit/tool-handlers.ts`,
  `src/compact/tool-handlers.ts`, `src/goal-run/tool-handlers.ts`,
  `src/store/tool-handlers.ts`
- Shared service-handler repository access:
  `src/mcp/tool-repository-access.ts`
- SDK-facing TypeScript tool input/result types:
  `src/mcp/types.ts`
- HTTP JSON body parsing, organization resolution, and JSON HTTP response
  envelope:
  `src/app/routes/memory.ts`,
  `src/app/routes/tool-handler.ts`,
  `src/app/routes/types.ts`,
  `src/app/middleware/json-body.ts`,
  `src/app/middleware/organization-resolution.ts`,
  `src/app/middleware/envelope.ts`
- MCP stdio and MCP Streamable HTTP transport wiring:
  `src/mcp/server.ts`, `src/mcp/context-tools.ts`,
  `src/mcp/service-tools.ts`, `src/mcp/resources.ts`, `src/mcp/prompts.ts`,
  `src/mcp/tool-result.ts`, `src/app/mcp-http.ts`,
  `src/app/middleware/mcp-http-auth.ts`
- Operator HTTP endpoints:
  `src/app/server.ts`
- CLI and package command surface:
  `package.json`, `src/cli.ts`, `src/cli-args.ts`, `src/lifecycle/init.ts`
- DB-facing schema and migration order:
  `src/db/migrations/001_initial.sql` through
  `src/db/migrations/015_background_queue_metrics_indexes.sql`

## Transports

- MCP stdio entrypoint: `dist/src/mcp/server.js`
- MCP Streamable HTTP endpoint: `/mcp`
- JSON HTTP service routes: `/v1/*`
- JSON HTTP success envelope:
  `{ "success": true, "data": <ToolResult> }`
- JSON HTTP failure envelope:
  `{ "success": false, "error": { "message": "<human-readable>" } }`
- MCP responses use native SDK content plus structured tool output; they do not
  use the JSON HTTP envelope.

## Service Tools And JSON HTTP Routes

All 20 service tools use `POST` JSON HTTP routes and share the same zod-backed
tool schema before registry dispatch.

| Tool | JSON HTTP route |
|---|---|
| `add_memory` | `/v1/memory` |
| `search_memory` | `/v1/memory/search` |
| `build_context_pack` | `/v1/memory/context-pack` |
| `reindex_memory` | `/v1/memory/reindex` |
| `compact_memory` | `/v1/memory/compact` |
| `list_memory` | `/v1/memory/list` |
| `inspect_memory_graph` | `/v1/memory/graph` |
| `update_memory` | `/v1/memory/update` |
| `delete_memory` | `/v1/memory/delete` |
| `tag_memory` | `/v1/memory/tag` |
| `list_audit_log` | `/v1/audit/list` |
| `unarchive_memory` | `/v1/memory/unarchive` |
| `start_goal_run` | `/v1/goal-run/start` |
| `record_iteration` | `/v1/goal-run/iteration` |
| `get_goal_run` | `/v1/goal-run/get` |
| `list_goal_runs` | `/v1/goal-run/list` |
| `complete_goal_run` | `/v1/goal-run/complete` |
| `abandon_goal_run` | `/v1/goal-run/abandon` |
| `build_goal_context` | `/v1/goal-run/context` |
| `check_repeat_attempt` | `/v1/goal-run/check-repeat` |

## MCP-Only Tools

These tools have no `/v1/*` route and must keep unsupported-client behavior as
structured success results rather than transport failures.

- `list_workspace_roots`
- `add_memory_interactive`
- `classify_memory_candidate`

## Operator HTTP Endpoints

- `GET /healthz`
- `GET /readyz`
- `GET /metrics`
- `GET /admin/memory`
- OAuth protected-resource metadata:
  `/.well-known/oauth-protected-resource` and
  `/.well-known/oauth-protected-resource/mcp`

## Compatibility Rules

- Do not rename tool names, JSON HTTP paths, package scripts, CLI flags, DB
  migration filenames, or documented response fields without an adapter or
  versioned migration path.
- Preserve `organizationId` semantics, token-org binding precedence, HTTP status
  classes, response envelope shapes, default values, nullable fields, ordering,
  and side effects.
- Clean-architecture and DDD refactors should move internals behind the existing
  descriptors, handlers, repositories, and CLI entrypoints first.

`build_context_pack`의 선택적 `maxOutputBytes`와 `budget` 메타데이터는 추가 계약이다.
옵션 생략 시 기존 출력·기본값·side effect를 유지한다. 지정 시 compact structured data만 제한하고,
기존 선택된 결정·제약이 들어가지 않으면 context-pack 실행 기록 없이 실패하되 기존 감사는 유지한다.

## Current Contract Guards

- `tests/scripts/public-docs-drift.test.ts` verifies public docs include every
  service tool and JSON HTTP route from `TOOL_ROUTES`.
- `tests/app/memory-routes-boundary.test.ts` verifies JSON HTTP routes are
  constructed from `TOOL_ROUTES`, valid route handlers dispatch through the
  registry with the JSON HTTP envelope, and invalid input is rejected before
  dispatch.
- `tests/app/envelope.test.ts` verifies JSON HTTP success/failure envelope
  shape and field order.
- `tests/mcp/server.test.ts` verifies MCP tool descriptor registration,
  resource templates, prompts, and the structuredContent plus JSON text content
  response contract.
- `tests/app/mcp-http.test.ts` verifies MCP Streamable HTTP auth, bound
  `organizationId` injection, scope denial, body limits, and cleanup behavior.
- `tests/cli.test.ts` verifies CLI argument parsing, command dispatch, and
  lifecycle init output behavior.
- `tests/audit/audit-write.test.ts` verifies tool-boundary audit rows,
  best-effort audit failure handling, and audit listing through canonical
  services.
- `tests/scripts/package-manifest.test.ts` verifies public package scripts and
  package surface.
