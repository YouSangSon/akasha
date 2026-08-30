> [English](CODEX-NAVIGATION-GUIDE.md) | **한국어**

# Codex 탐색 가이드

공개 계약을 보존하면서 변경의 가장 작은 owner를 찾기 위한 가이드입니다.
`AGENTS.md`를 보완하며 제품·아키텍처 문서를 대체하지 않습니다.

## 읽기 순서

1. 현재 목표와 증거는 `goal.md`, `GATES.md`, `PLAN.md`에서 확인합니다.
2. 제품 용어와 평가 설계는 `CONTEXT.md`, `DESIGN.md`에서 확인합니다.
3. 고정된 공개 surface는 `CONTRACTS.md`에서 확인합니다.
4. runtime과 기여 규칙은 `README.md`, `CONTRIBUTING.md`,
   `docs/architecture.md`, `docs/configuration.md`에서 확인합니다.
5. 변경할 source owner와 가장 가까운 테스트를 읽습니다.

## Owner 지도

| Surface | Primary owner |
| --- | --- |
| MCP 조립, schema, prompt, resource | `src/mcp/` |
| Streamable MCP와 JSON HTTP transport | `src/app/` |
| 메모리 영속화와 canonical indexing | `src/store/` |
| Qdrant와 pgvector adapter | `src/vector/` |
| Embedding provider | `src/embedding/` |
| Hybrid 검색과 ranking | `src/search/` |
| Context-pack rendering | `src/context-pack/` |
| Archive, compaction, retry worker | `src/compact/` |
| Goal-run 상태 | `src/goal-run/` |
| Schema 이력 | `src/db/migrations/001_initial.sql`부터 `015_*` |

Owner를 옮기기 전에 호출자를 추적합니다. `src/mcp/tool-schemas.ts`의 공개
descriptor, `src/mcp/types.ts`의 SDK type, 실제 handler는 함께 정합해야 합니다.

## 빠른 탐색

```bash
rg -n "tool_name|route_path|field_name" src tests docs
rg -n "function_name|TypeName" src tests
rg --files src tests docs | sort
git status --short --branch
git diff -- path/to/owner path/to/test
```

가장 가까운 기존 helper와 테스트를 재사용합니다. 실제 두 번째 호출자가 생기기
전에는 새 abstraction을 만들지 않습니다.

## 공개 계약 변경 packet

Tool, route, envelope, auth 규칙, CLI flag, migration을 바꾸기 전에 다음을 함께
검토합니다.

- `CONTRACTS.md`와 `docs/api-reference.md`
- `src/mcp/tool-schemas.ts`, `src/mcp/types.ts`, 담당 handler
- 해당 surface의 MCP, JSON HTTP, SDK-facing 테스트
- 영문/한글 문서 mirror와 `docs/README*.md`
- 호환성, migration, rollback, organization isolation 영향

호환성을 보존할 수 없다면 batch를 닫고, 공개 surface를 편집하기 전에 versioned
adapter 또는 migration을 설계합니다.

## 검증 범위

| 변경 | 최소 검증 |
| --- | --- |
| 문서만 | 관련 docs drift 테스트와 `git diff --check` |
| private owner 하나 | 가장 가까운 focused test, typecheck, diff check |
| shared schema/handler/vector/store | focused contract·integration, typecheck, build |
| Batch closeout | 전체 `npm test`, typecheck, build, audit, diff review |

Integration skip은 pass가 아닙니다. 정확한 backend와 버전, 실행·skip 수, 증거가
local/client/production 중 무엇인지 기록합니다.

## Worktree와 데이터 안전

- 편집 전 branch, HEAD, dirty path, linked worktree를 확인합니다.
- 관련 없는 tracked/untracked 파일은 보존하고 bounded owner만 stage합니다.
- Migration `001-015`는 rewrite/delete하지 않습니다. 새 schema 작업은 data와
  rollback 검토 후 다음 번호 migration으로 추가합니다.
- 모든 memory 테스트와 operation에 명시적인 `organizationId`를 사용합니다.
- 현재 작업이 만든 process, container, volume, fixture만 정리합니다. 명시적 승인
  없이 push, deploy, publish, 비용 지출, credential 변경을 하지 않습니다.
