# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current State

2026-10-28 사용자가 승인한 다음 네 개선은 [#43](https://github.com/YouSangSon/akasha/issues/43)가 추적한다.
각 항목을 구현·관련 검증·독립 검토·필수 CI·main 병합 순서로 완료한다.
기존 청크 재분할의 안전한 적용에 동시 쓰기 제어가 필요하므로 1·2번을 한 PR로 묶고, 3·4번을 이어서 진행한다.

- [x] 긴 본문 보존: 실제 토큰 분할과 기존 데이터 복구. PR #44, main `8741c6f`, 필수 CI 5개 통과.
- [x] 동시 수정·아카이브와 실패 복구: 예약 연결의 쓰기 직렬화와 지속 가능한 재시도. PR #44에서 함께 검증·병합했다.
- [x] 한국어·일본어·중국어 및 교차 언어 검색: PR #45, main `e06cf22`, 필수 CI 6개 통과. 70개 질의 비교와 실험용 MPNet 설정을 제공한다. 엄격한 순위 품질은 RED이며 중국어 유사 오답 1건이 남는다. 상세 근거는 `GATES.md`.
- [ ] 실제 Codex 비용 비교: 예산 적용 전후 정답·필수 사실·전체 입력 토큰을 같은 조건에서 비교한다. 바이트 감소를 토큰 절감으로 대신하지 않는다.

3번의 실제 모델 비교와 병합을 마쳤으며 기본 모델은 유지한다.
4번은 PR #46에서 진행한다. CI 캡처가 공개 문서의 예시 접속 문자열을 비밀 정보로 거부했다.
차단 규칙을 유지하고 해당 문서 조각을 공통 평가 입력에서 제외한 뒤, CI의 실제 검색 결과를
고정해 로컬 DB 없이 Codex MCP 응답·전체 턴 토큰을 측정한다.
기존 공개 계약과 조직 격리, 사용자 `.scratch/`, 무료 실행 조건, 로컬 전체 스택 금지와 VM 보류를 유지한다.

### Previously completed improvements

2026-10-26 사용자가 추가 승인한 작업은 [#39](https://github.com/YouSangSon/akasha/issues/39)가 추적한다.
세 단위를 각각 검증·PR·필수 CI·main 병합 순서로 진행한다.

- [x] 전체 구조화 컨텍스트 팩의 선택적 크기 예산: PR #40, main `2314ba3`, CI 5개 통과.
  정확한 경계와 측정 범위는 `GATES.md`가 소유한다.
- [x] MCP 비용 계측 및 같은 입력 비교: PR #41, main `74dc5b8`, 필수 CI 5개 통과.
- [x] 기존 20개 질문을 보존한 52개 검색 평가와 사용자/조직/프로젝트 격리·유사 오답 검증: PR #42, 소스 `a6dc2e3` 독립 검토 및 필수 CI 5개 통과. 병합 여부는 PR 상태로 확인한다.

로컬 전체 스택·유료 실행·VM 재시도는 하지 않는다. 기존 부정적 측정 결과를 새 성과로 바꾸지 않는다.

2026-10-25 사용자 요청으로 VM 배포·검증은 이번 완료 범위에서 보류한다.
VM 구성 PR #36은 Draft로 보존한다. 이전 빌드 결과와 원격 정리는 미확인이며,
새 접속·빌드 시도보다 기존 증거 보존을 우선한다. 상태는 `GATES.md`가 소유한다.

README의 영어·한국어·일본어·중국어 통일은 PR #35 (`0f9cb6f`)로 반영됐다.
보안 의존성 수정 PR #37은 `eb1575b`로 반영됐고, 최종 head `356ec10`의 CI
5개 작업과 의존성 감사 0건을 확인했다. 이전 로컬 Linux 전체 통과 결과는
변경된 의존성의 검증으로 재사용하지 않는다.

The latest core behavior delivery is
[PR #32](https://github.com/YouSangSon/akasha/pull/32), merged as `183433b`.
All five final CI jobs passed at `b98c397`; its tree matches the merge.
The completed MCP Codex baseline has
18/18 correct answers and no omissions/leakage, but median total input-token
reduction is 0.35%, below the 15% product gate. `GATES.md` owns the current
measurement, host-prompt audit, and verification boundaries.

The user does not currently use Claude Code; it remains unverified and outside
this delivery scope. The user requested usable implementation and truthful
evidence, not a guaranteed positive result for each product hypothesis. Existing
UI, retrieval, and recovery evidence remains valid within its recorded scope.
Required local checks passed in the existing Podman Linux environment on a clean
fixed checkout; earlier macOS failures retain their own scope. The anonymous-volume
deletion's unknown impact remains an unresolved incident.
2026-10-25 사용자는 이 사고를 미확인 후속으로 보존하고 비-VM 제품 전달을
이번 Goal의 종결 범위로 선택했다. 사고 해결이나 무손실을 확인한 것은 아니다.

The existing CLI-to-prompt workflow now has a separate `cli-prefetch` profile.
At `d459e20`, a complete fresh comparison passed 18/18 answers and reduced total
input tokens by a median 53.40%; nine actual CLI outputs matched fresh scoped DB
receipts. A prior sleep-interrupted attempt remains recorded separately.
`GATES.md` owns the protocol and measurement limits. Both owned evaluation
stacks were removed; the existing portfolio bundle retains their receipts.

Real Postgres/Qdrant admin verification then exposed archived records regaining
vectors after Save. PR #32 fixes shared refresh, reindex, and pending ingest
retry paths. Actual UI Save/Tag and API/retry lifecycle checks passed, and the
owned UI database stack was removed. Final CI passed 2,667 tests on each Node
version with 35 skips; the local full run's seven timeouts and failed isolated
recheck remain separate evidence. Concurrent archive/index races and automatic
retry after a committed edit's cleanup failure remain outside this fix.
`GATES.md` owns the detailed verification boundaries and remaining red gates.

Merged CLI lifecycle follow-up PR #31 (`3b30134`) closes command-owned services after draining
best-effort audit writes and releases pools when service initialization fails.
An isolated Postgres + Qdrant + transformers process smoke preserved exact pack
output and audit rows, covered successful writes/reindex and failure paths, and
left no CLI database connections. A single comparison removed the baseline's
30-second post-output idle wait; it is not a new client A/B or general latency
benchmark. Injected registries and long-lived server ownership remain unchanged.

Recent completed architecture-goal commits; run `git log -1 --oneline` for the
newest local commit:
- `e8f9136 fix(vector): use qdrant-compatible point ids`
- `dd014b9 refactor(compact): split compact tool handler`
- `54de9f6 refactor(store): split reindex tool handler`
- `1e93de7 refactor(compact): split unarchive tool handler`
- `4faf7a5 refactor(audit): split audit tool handler`
- `4fb1aaa refactor(goal-run): split tool handlers`
- `b545085 refactor(mcp): split service tool registration`
- `a6edbb7 refactor(mcp): split context tool registration`
- `b18f6d9 refactor(mcp): split prompt registration`
- `ac932bc refactor(mcp): split resource registration`
- `2bbf1b2 refactor(mcp): split registry audit instrumentation`
- `a3d44e0 refactor(cli): split argument parsing`
- `a3d346d docs(plan): refresh architecture handoff commits`
- `5aaa78b refactor(app): split mcp http auth guard`
- `13fe610 docs(worklog): record full suite verification`
- `09c1491 refactor(app): split json http tool handler`
- `e897a10 test(app): guard json http route handler contract`
- `c9a15d7 refactor(mcp): split tool result formatting`
- `158395b docs(contracts): list mcp response guard`
- `7ab0c09 test(app): guard json http envelope contract`
- `bc7b6d2 docs(architecture): expand transition handoff plan`
- `9534382 refactor(app): share http json body parsing`
- `ec8bba9 refactor(app): split organization resolution boundary`
- `47e8e59 docs(contracts): add public contract baseline`

Current structure:
- Public transports live in `src/mcp/server.ts`, `src/app/mcp-http.ts`, and
  `src/app/routes/memory.ts`.
- MCP service tool registration lives in `src/mcp/service-tools.ts` while
  `src/mcp/server.ts` keeps the public server assembly.
- MCP-only context tool registration lives in `src/mcp/context-tools.ts` while
  `src/mcp/server.ts` keeps the public server assembly.
- MCP resource registration lives in `src/mcp/resources.ts` while
  `src/mcp/server.ts` keeps the public server assembly.
- MCP prompt registration lives in `src/mcp/prompts.ts` while
  `src/mcp/server.ts` keeps the public server assembly.
- MCP tool result formatting lives in `src/mcp/tool-result.ts`.
- MCP Streamable HTTP authenticated tool authorization lives in
  `src/app/middleware/mcp-http-auth.ts`.
- JSON HTTP route handler execution lives in `src/app/routes/tool-handler.ts`;
  shared route types live in `src/app/routes/types.ts`.
- CLI argument parsing lives in `src/cli-args.ts`; `src/cli.ts` keeps the
  public re-export and command dispatch.
- Shared public service schemas and JSON HTTP route descriptors live in
  `src/mcp/tool-schemas.ts`; SDK-facing tool types live in `src/mcp/types.ts`.
- Tool dispatch goes through `src/mcp/tool-registry.ts` and
  `src/mcp/tool-handlers.ts`.
- Tool-boundary audit/log instrumentation lives in
  `src/mcp/tool-registry-instrumentation.ts`.
- Shared service-handler repository fallback/canonical access lives in
  `src/mcp/tool-repository-access.ts`.
- Audit-log read service tool adapter lives in `src/audit/tool-handlers.ts`;
  audit persistence stays in `src/audit/audit-log-repository.ts`.
- Compaction service tool adapters live in `src/compact/tool-handlers.ts`;
  compaction planning/apply helpers stay in `src/compact/`.
- Goal-run service tool adapters live in `src/goal-run/tool-handlers.ts`;
  goal-run pack/repeat domain helpers stay in `src/goal-run/`.
- Canonical reindex service tool adapter lives in `src/store/tool-handlers.ts`;
  chunk indexing helpers stay in `src/store/canonical-indexing.ts`.
- Domain work is currently grouped by capability under `src/compact/`,
  `src/context-pack/`, `src/search/`, `src/goal-run/`, `src/store/`,
  `src/vector/`, and `src/embedding/`.
- DB-facing contracts are migration filenames `001-015` plus repository row
  shapes.

Completed in this branch:
- A destructive-safety-guarded default-stack eval now gates real transformers +
  Qdrant retrieval at `k=5`, including user scope, organization leakage, warm
  latency, and context-pack flow. The post-fix local run reached recall 1.00,
  MRR 0.7267, user recall 1.00, and zero leakage across 60 samples.
- Shared ranking now treats project scope as a score-tie breaker and gives
  vector/lexical relevance enough range to outrank unrelated metadata while
  preserving the existing metadata, recency, and generic-note weights.
- Supported lockfile dependencies are refreshed. The Qdrant client is limited
  to compatible 1.14.x patches for the bundled 1.13.2 server. Transformers
  4.3.1 and the refreshed lockfile pass native npm audit with no exceptions;
  the non-root Debian image supplies the glibc required by ONNX.
- The shared point builder now gives every chunk a deterministic,
  Qdrant-compatible UUIDv8-shaped identity. Canonical writes, retries, reindex,
  and unarchive reuse it; `reindex_memory` removes legacy record points before
  repopulating them.
- `CONTRACTS.md` freezes the public contract inventory.
- `src/app/middleware/organization-resolution.ts` owns JSON HTTP
  `organizationId` precedence while `src/app/routes/memory.ts` keeps the
  compatibility re-export.
- `src/app/middleware/json-body.ts` owns bounded JSON body parsing for JSON HTTP
  and MCP Streamable HTTP while preserving their previous status behavior.
- `src/mcp/tool-result.ts` owns MCP tool response formatting while preserving
  `structuredContent` and JSON text `content`.
- `tests/app/memory-routes-boundary.test.ts` now characterizes JSON HTTP route
  handler dispatch before deeper route-handler extraction.
- `src/app/routes/tool-handler.ts` owns JSON HTTP tool execution while
  `src/app/routes/memory.ts` owns route table construction.
- `src/app/middleware/mcp-http-auth.ts` owns MCP Streamable HTTP registry
  guarding and MCP-only tool authorization.
- `src/cli-args.ts` owns CLI argument parsing while `src/cli.ts` preserves the
  existing `parseCliArgs` export and command execution.
- `src/mcp/tool-registry-instrumentation.ts` owns tool-boundary audit/log
  wrapping while `src/mcp/tool-registry.ts` owns registry assembly.
- `src/mcp/resources.ts` owns Akasha MCP resource registration and URI param
  parsing while `src/mcp/server.ts` keeps server assembly.
- `src/mcp/prompts.ts` owns Akasha MCP prompt registration while
  `src/mcp/server.ts` keeps server assembly.
- `src/mcp/context-tools.ts` owns MCP-only context tool registration while
  `src/mcp/server.ts` keeps server assembly.
- `src/mcp/service-tools.ts` owns MCP service tool registration while
  `src/mcp/server.ts` keeps server assembly.
- `src/goal-run/tool-handlers.ts` owns goal-run service tool adapters while
  `src/mcp/tool-handlers.ts` keeps the remaining shared memory/governance
  handlers.
- `src/audit/tool-handlers.ts` owns the `list_audit_log` service tool adapter
  while `src/mcp/tool-handlers.ts` keeps registry composition and the remaining
  shared memory/governance handlers.
- `src/compact/tool-handlers.ts` owns the `compact_memory` and
  `unarchive_memory` service tool adapters while `src/mcp/tool-handlers.ts`
  keeps the remaining shared memory/governance handlers.
- `src/store/tool-handlers.ts` owns the `reindex_memory` service tool adapter
  while `src/mcp/tool-handlers.ts` keeps the remaining shared memory/governance
  handlers.

Known issues:
- Real Codex token reduction is measured but below the 15% bar. Claude remains
  unverified; exact attribution of common-prompt and tool-round-trip cost is open.
- The target architecture is still a staged transition, not a completed module
  split.
- Customer-specific modules and MSA extraction seams are not yet implemented.

## Next Loop Candidates

Execute in this order and close each bounded owner before changing scope:

1. Preserve the fixed-checkout Linux verification: required typecheck/build/audit,
   seven focused cases, and one full suite (2667 passed, 35 skipped). Reuse it only
   for unchanged source/dependencies; keep earlier macOS failures and CI/DB evidence
   separate. Subsequent documentation-only changes need their focused checks.
2. Verify current task-owned cleanup separately from the historical anonymous
   volume deletion. That incident needs an exact ownership link or identified
   data impact and any necessary recovery; current absence proves neither.
3. Preserve both Codex outcomes: the MCP 15% gate remains RED at 0.35%, and the
   separate CLI-prefetch profile passed at 53.40%. Do not change user safety
   instructions, public result fields, cached-token accounting, or the thresholds
   to manufacture a pass. New model runs require a concrete hypothesis.
4. Keep the existing portfolio artifacts attributable and validate their hashes
   and local links after a meaningful update. Claude stays unverified; do not
   request its login or enable paid calls for this delivery.
5. Audit completion against the current user goal. Report remaining safety and
   validation gaps without treating unavailable Claude proof as a blocker.

Additional transport or module extraction stays behind these product-value
gates unless it is required to fix a measured failure.

## Target Architecture

Keep public entrypoints stable while moving internals toward:

- Transport adapters: MCP stdio, MCP Streamable HTTP, and JSON HTTP only parse,
  authenticate, authorize, validate envelopes, and call the shared application
  surface.
- Application services: tool use cases coordinate validation, audit, domain
  operations, repositories, vector adapters, and embeddings behind stable
  interfaces already present in the repo.
- Domain modules: memory, search, compaction, goal-run, governance tags, audit,
  and context-pack each own their rules and tests.
- Infrastructure adapters: Postgres, Qdrant, pgvector, embeddings, OAuth, and
  CLI stay replaceable behind existing factories/interfaces.
- Customer-specific modules: add optional modules behind existing tool schemas
  or versioned adapters first; do not fork public request/response shapes.
- MSA readiness: each future service boundary must already have an explicit
  contract, data owner, idempotency/rollback story, and local test gate before
  extraction.

## Transition Plan

1. Preserve contracts first:
   - Keep `CONTRACTS.md`, `docs/api-reference.md`, `src/mcp/tool-schemas.ts`,
     `src/mcp/types.ts`, migrations, CLI scripts, and docs drift tests aligned.
2. Shrink transport files:
   - Move reusable boundary behavior from `src/app/routes/memory.ts` and
     `src/app/mcp-http.ts` into `src/app/middleware/*` or existing helpers.
3. Define application seams:
   - Extract application-level functions only when two transports or tests can
     call the same behavior without new public surface.
4. Clarify domain modules:
   - Move business rules toward capability folders already used by the repo.
5. Add customer/module seams:
   - Introduce adapters or option objects only after a real caller exists.
6. Consider MSA split last:
   - Split deployable services only after module contracts, queues/retries,
     telemetry, and data ownership are proven locally.

## Contract Gate

Every loop must preserve:
- Tool names, JSON HTTP routes, MCP tool registration, response envelope shape,
  status classes, error messages that docs/tests rely on, field names, field
  meaning, defaults, nullability, ordering, and side effects.
- `organizationId` behavior, including token-bound precedence and mismatch
  rejection.
- CLI/package scripts and migration filenames.

Minimum verification for a code loop:
- Focused characterization or contract test for the touched boundary.
- Relevant focused test suite.
- `npm run typecheck`.
- `git diff --check`.
- Broader `npm test` or `npm run build` when the touched surface is shared
  enough to justify the runtime.

## Risks And Rollback

Risks:
- Moving transport code can silently change HTTP status, envelope shape, auth
  precedence, or handler dispatch timing.
- Moving schema or DTO code can break MCP and JSON HTTP at the same time.
- Moving repository code can affect DB-facing row shape or migration order.
- Adding generic module abstractions too early can create dead interfaces.

Rollback:
- Revert only the latest small refactor commit for the failed loop.
- Keep `CONTRACTS.md` unless the contract baseline itself is proven wrong by
  current code.
- If a contract must change, stop and design a compatibility adapter, versioned
  path, or migration plan before changing behavior.

## Continuation Handoff

Before each resume:
- Read `AGENTS.md`, `goal.md`, `GATES.md`, `CONTEXT.md`, `DESIGN.md`,
  `README.md`, `CONTRIBUTING.md`, `docs/CODEX-NAVIGATION-GUIDE.md`, `docs/architecture.md`,
  `docs/configuration.md`, `docs/api-reference.md`, `docs/README.md`,
  `CONTRACTS.md`, this file, `BACKLOG.md`, `DECISIONS.md`, and recent
  `WORKLOG.md`.
- Check `git status --short --branch` and `git log -1 --oneline`.
- Pick the first red/not-run in-scope gate, write or run the smallest contract check, make the
  internal change, rerun checks, update durable docs, and create a local commit.
- Do not push, merge, deploy, change credentials, run paid work, or make
  destructive migrations without explicit approval.


2026-10-28 추가 세 단위의 구현·검증을 마쳤다. PR #42의 문서 head `9ce429e`도 필수 CI 5개를 통과했다.
병합의 최종 상태는 PR #42, 별도 포트폴리오의 근거는 `/Users/yousang/Desktop/resume/자료수집/2026-10-23/akasha-portfolio`가 소유한다.
목표 밖 신규 구현은 추가하지 않는다. 기존 RED·OPEN·DEFERRED 항목은 유지한다.
