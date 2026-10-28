# BACKLOG

Prioritize in this order unless a core product capability materially changes
the value of Akasha: stability/bugs, testability, scalability, developer
experience, documentation, features.

## P0

- None currently known.

## P1

- [#43](https://github.com/YouSangSon/akasha/issues/43): 기본 임베딩의 긴 본문 잘림을 수정한다.
  공백 기준 800개 단위와 모델의 512-token 한도가 맞지 않아 뒷부분이 입력에서 빠진다.
  실제 토큰 분할과 기존 데이터의 재색인·재시도를 함께 검증한다. 나머지 승인 항목과 순서는 `PLAN.md`가 소유한다.

## P2

- None currently known.

## Recently Merged

- PR #42: 검색 평가 52개 질문·실제 사용자 정답 12개·유사 오답 대비 12개와 의도적 scope 불일치 탐침을 검증했다. 상세 수치·한계는 `GATES.md`가 소유한다.
- PR #41 (`74dc5b8`): MCP 전체 턴 입력 토큰과 개별 응답 바이트 계측을 분리하고 명시적 예산 변형을 검증한다. 필수 CI 5개 통과.
- PR #40 (`2314ba3`): 선택적 전체 구조화 컨텍스트 팩 바이트 예산과 경계·기록·감사 계약을 검증했다.

- 기본 `transformers + Qdrant` 검색 게이트는 PR #26으로 반영됐다.
  조직 범위의 recall@5·MRR·사용자 회수·조직 유출·warm 지연 근거는
  `GATES.md`가 소유한다. 이 완료 항목을 신규 구현 작업으로 다시 잡지 않는다.
- PR #23 was squash-merged into `main` as `db93314`
  (`Hardening production boundaries and package surface`), covering the
  post-v1 hardening branch. Detailed implementation history remains in
  `WORKLOG.md`, git history, and the GitHub PR.

## Recently Updated

- Canonical reindex service tool adapter now lives in
  `src/store/tool-handlers.ts`, with the shared registry continuing to expose
  `reindex_memory` unchanged.
- Compaction service tool adapters now live in `src/compact/tool-handlers.ts`,
  with the shared registry continuing to expose `compact_memory` and
  `unarchive_memory` unchanged.
- Audit-log read service tool adapter now lives in
  `src/audit/tool-handlers.ts`, with the shared registry continuing to expose
  `list_audit_log` unchanged.
- Goal-run service tool adapters now live in `src/goal-run/tool-handlers.ts`,
  with the shared registry continuing to expose the same public tool names.
- MCP service tool registration now lives in `src/mcp/service-tools.ts`, with
  MCP server assembly remaining in `src/mcp/server.ts`.
- MCP-only context tool registration now lives in `src/mcp/context-tools.ts`,
  with MCP server assembly remaining in `src/mcp/server.ts`.
- MCP prompt registration now lives in `src/mcp/prompts.ts`, with MCP server
  assembly remaining in `src/mcp/server.ts`.
- MCP resource registration now lives in `src/mcp/resources.ts`, with MCP
  server assembly remaining in `src/mcp/server.ts`.
- Tool-boundary audit/log instrumentation now lives in
  `src/mcp/tool-registry-instrumentation.ts`, with registry assembly remaining
  in `src/mcp/tool-registry.ts`.
- CLI argument parsing now lives in `src/cli-args.ts` while `src/cli.ts`
  preserves the existing parser export and command dispatch surface.
- MCP Streamable HTTP registry guarding and MCP-only tool authorization now live
  in `src/app/middleware/mcp-http-auth.ts`.
- JSON HTTP tool execution now lives in `src/app/routes/tool-handler.ts`, with
  route construction remaining in `src/app/routes/memory.ts`.
- JSON HTTP route handler dispatch now has direct boundary coverage for success
  envelope behavior, organization resolution precedence, and validation failure
  before registry calls.
- MCP tool response formatting now lives behind `src/mcp/tool-result.ts` while
  preserving structured output plus JSON text content.
- Existing MCP structured output coverage is now listed in `CONTRACTS.md` as a
  current contract guard.
- JSON HTTP response envelopes now have a focused contract test for success and
  failure field order.
- `PLAN.md` now records the current architecture state, target structure,
  transition plan, contract gate, risks, rollback, and continuation handoff for
  the clean-architecture/DDD goal.
- JSON body parsing is now shared by JSON HTTP routes and MCP Streamable HTTP;
  both transports keep their previous oversized-body status behavior.
- JSON HTTP organization resolution is now isolated behind an internal
  middleware boundary while `src/app/routes/memory.ts` preserves the existing
  route factory and `resolveOrganizationId` re-export.
- `CONTRACTS.md` now records the public contract baseline for future
  clean-architecture/DDD refactors, and public-docs drift tests guard it against
  route/source drift.
- README comparison now positions code-intelligence MCP servers such as
  `codebase-memory-mcp` as complementary repository-graph tools, not
  replacements for Akasha's durable agent-memory scope.

## Discovery Queue

- Refresh the backlog from current `main` by checking repo docs, recent git
  history, CI/test state, dependency/security posture, and comparable OSS
  memory MCP projects. Promote exactly one concrete item into P0/P1/P2 before
  implementing the next loop.
