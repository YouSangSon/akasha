> [English](README.md) | **한국어**

# Akasha

[![CI](https://github.com/YouSangSon/akasha/actions/workflows/ci.yml/badge.svg)](https://github.com/YouSangSon/akasha/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue.svg)](https://modelcontextprotocol.io/)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org/)

**AI 코딩 에이전트를 위한 영구 메모리 — 무료, 로컬, 셀프-호스팅.**

Claude Code, Codex CLI, 또는 어떤 MCP 클라이언트에든 붙이면 에이전트가
세션이 끝나도 사라지지 않는 검색 가능한 메모리(결정 사항, 제약 조건,
요약)를 갖게 됩니다. canonical 상태는 Postgres, 벡터 검색은 Qdrant 기본
또는 pgvector, 임베딩은 ONNX로 로컬 실행 — **API 키 불필요**, 비용 `$0`,
데이터는 본인 머신에서만.

> 이름은 *아카식 레코드(Akashic records)* — 만물의 지식이 기록된 신화 속
> 저장소 — 에서 따왔습니다. Akasha는 에이전트가 기억할 가치가 있는 것을
> 적어 두는 곳입니다.

## 다른 도구들과의 비교

| | **Akasha** | doobidoo/mcp-memory-service | coleam00/mcp-mem0 | mem0ai/mem0 | letta-ai/letta | getzep/zep |
|---|---|---|---|---|---|---|
| **즉시 무료 사용** | ✅ | ✅ | ❌ (OpenAI) | ❌ (OpenAI default) | ❌ (hosted) | ❌ (Cloud SaaS) |
| **데이터 본인 머신 저장** | ✅ | ✅ | 부분 (OpenAI 호출) | 부분 (OpenAI 호출) | ❌ (Letta Cloud) | ❌ (Zep Cloud) |
| **MCP-native 프로토콜** | ✅ | ✅ | ✅ (Mem0 wrap) | wrapper 전용 | wrapper 전용 | ❌ |
| **즉시 멀티테넌트** | ✅ (`organization_id`, token-org 바인딩, SQL + vector 양 계층 필터) | ❌ | Mem0 의존 | ✅ | ✅ | ✅ |
| **Postgres + vector 백엔드** | ✅ (Qdrant 기본; Postgres 단독 배포 옵션 pgvector) | SQLite-vec | Supabase + pgvector | varies | varies | proprietary |
| **OSS 경로 active 유지** | ✅ | ✅ | ✅ (template repo) | ✅ | ✅ | ❌ (CE 2025 deprecated) |

MCP 메모리 생태계 norm 은 *무료/로컬 default* — doobidoo (1.7k★) 가 `$0`
cost 를 헤드라인으로 사용, 수렴 무료 임베딩 모델 (`all-MiniLM-L6-v2`)도
Akasha 가 같이 채택. Akasha 가 distinctively 더 나아간 점:
**vector index 와 분리된 Postgres canonical store** (Qdrant collection 재구축
시 데이터 손실 0, reindex 는 도구 1번 호출), **SQL + vector 양 계층의
org-scoped 멀티테넌시** (peers 는 skip 하거나 upstream 프레임워크에 의존),
**wrapper 가 아닌 MCP-native** (프로토콜과 메모리 엔진 사이 shim 없음).
두 번째 서비스가 번거로운 환경에서는 `VECTOR_BACKEND=pgvector` 로 벡터를
Postgres 에 저장할 수 있습니다 — Qdrant 불필요.

세련된 UI 가 있는 hosted 메모리 제품이 필요하면 Mem0 또는 Letta. **API
키 불필요한 self-hosted 메모리 MCP 서버**가 필요하면 이것.

## 주요 기능 (Features)

위의 무료/로컬/멀티테넌트 기본기 외에도, Akasha는 프로덕션 운영을
염두에 두고 만들어졌습니다:

- **canonical store, 파생 인덱스.** 진실은 Postgres가 보관하고, 활성 벡터
  백엔드 인덱스는 언제든 재구축 가능. Qdrant collection 또는 pgvector 인덱스를
  재구축해도 데이터 손실 0 — `reindex_memory` 가 Postgres 청크에서 한 번의
  호출로 재임베딩합니다.
- **crash-safe 인제스트.** 쓰기는 벡터 저장소를 건드리기 전에 write-ahead
  intent 를 먼저 기록하고, 중간에 실패한 upsert 는 백그라운드 sweeper 가
  재시도합니다 (visibility-timeout claim, `FOR UPDATE SKIP LOCKED`). 인덱스가
  조용히 어긋나는 일이 없습니다.
- **쓰기 시점 시크릿 스크러빙.** 콘텐츠는 저장되기 전에 스캔됩니다 — API 키,
  PEM 블록, bearer 토큰, JWT 는 저장 대신 거부됩니다 (`SecretDetectedError`).
- **dry-run 이 기본인 컴팩션.** exact + 시맨틱 중복 제거와 time-decay 아카이빙은
  기본적으로 미리보기 (`dryRun: true`)로 동작하며, apply 는 idempotent + rate-limited.
  아카이빙된 레코드는 `unarchive_memory` 로 복원 가능합니다.
- **감사 + rate limit.** 모든 도구 호출은 org-scoped 감사 로그에 남고, 토큰별
  rate limit 이 HTTP API 를 보호합니다.
- **두 MCP transport + JSON HTTP.** MCP 클라이언트는 stdio 또는
  `POST /mcp` 의 Streamable HTTP 를 사용할 수 있고, 스크립트와 비-MCP
  클라이언트는 계속 `/v1/*` 아래 JSON HTTP 를 사용할 수 있습니다.
- **Memory governance UI.** 운영자는 정적 `/admin/memory` 셸에서 레코드를
  검토, 수정, 태그, 아카이브할 수 있습니다. 실제 데이터 호출은 계속 인증된
  `/v1/*` API 를 통과합니다.
- **프로덕션 health probe.** `/healthz` (liveness) 와 의존성 인지형 `/readyz`
  (readiness) 가 Kubernetes / 로드밸런서 헬스체크를 구동합니다.
- **교체 가능한 벡터 백엔드.** 기본 Qdrant, 또는 `VECTOR_BACKEND=pgvector` 로
  Postgres 단독 실행.

## 왜 필요한가

코딩 에이전트와의 대화는 세션이 끝나는 순간 컨텍스트를 잃습니다.
Akasha는 그 에이전트가 *기억할 가치가 있는 것*을 저장하고 다음에 다시
읽어올 수 있는 장소입니다. 동일한 20 service tools가 MCP stdio, `POST /mcp` 의
MCP Streamable HTTP, 그리고 `/v1/*` 아래 JSON-HTTP 로 노출됩니다 —
전체 요청/응답 스키마는
[docs/api-reference.ko.md](docs/api-reference.ko.md) 참고.
세 가지 접근 경로는 동일한 service tool schema surface를 공유하므로 검증과
payload shape가 어긋나지 않습니다. MCP에는 연결된 클라이언트가 capability를
광고할 때 workspace roots, user elicitation, sampling을 쓰는 context helper도
추가로 노출됩니다.

| 도구 | 하는 일 | HTTP 라우트 |
|------|---------|------------|
| `add_memory` | 결정, 사실, 요약을 저장 (쓰기 시점 시크릿 스크러빙) | `POST /v1/memory` |
| `search_memory` | 벡터 + lexical 하이브리드 scope 필터링 검색 | `POST /v1/memory/search` |
| `build_context_pack` | 새 세션에 주입할 컴팩트한 컨텍스트 팩 생성 | `POST /v1/memory/context-pack` |
| `compact_memory` | 중복 및 decay된 레코드 정리 (apply 또는 dry-run) | `POST /v1/memory/compact` |
| `reindex_memory` | Postgres 로부터 벡터 인덱스 재구축 (데이터 손실 0) | `POST /v1/memory/reindex` |
| `list_memory` | tag / archived 필터로 canonical 레코드 검토 | `POST /v1/memory/list` |
| `inspect_memory_graph` | 저장된 entity mention 및 relationship 조회 | `POST /v1/memory/graph` |
| `update_memory` | 레코드 1개 수정 후 vector 상태 갱신 | `POST /v1/memory/update` |
| `delete_memory` | 레코드 1개 governance archive + vector cleanup | `POST /v1/memory/delete` |
| `tag_memory` | 레코드 1개의 governance tag 교체 | `POST /v1/memory/tag` |
| `unarchive_memory` | 아카이빙된 레코드 복원 (포렌식/실수 복구용) | `POST /v1/memory/unarchive` |
| `list_audit_log` | 감사 로그 조회 (compliance / 디버깅) | `POST /v1/audit/list` |
| `start_goal_run` | termination criteria가 있는 persistent objective 시작 | `POST /v1/goal-run/start` |
| `record_iteration` | attempt/outcome 추가 및 관련 memory pinning | `POST /v1/goal-run/iteration` |
| `get_goal_run` | goal run 1개와 ordered iteration 조회 | `POST /v1/goal-run/get` |
| `list_goal_runs` | scope와 status 기준 goal run 목록 조회 | `POST /v1/goal-run/list` |
| `complete_goal_run` | active goal run을 resolution note와 함께 완료 처리 | `POST /v1/goal-run/complete` |
| `abandon_goal_run` | active goal run을 reason note와 함께 포기 처리 | `POST /v1/goal-run/abandon` |
| `build_goal_context` | run history와 memory에서 goal-focused continuation context 생성 | `POST /v1/goal-run/context` |
| `check_repeat_attempt` | candidate attempt가 이전 failed iteration 반복인지 감지 | `POST /v1/goal-run/check-repeat` |

MCP 전용 context tool: `list_workspace_roots` 는 클라이언트가 광고한 roots를
읽고, `add_memory_interactive` 는 MCP elicitation으로 사용자 확인 memory를
수집해 저장하며, `classify_memory_candidate` 는 MCP sampling으로 memory kind와
summary를 제안합니다.

레코드마다 `organization_id`를 가지는 멀티-테넌트, bearer 토큰 인증, 감사 로그,
rate limiting을 갖추고 있습니다. 노트북 위 단일 사용자 MCP 서버부터 회사 인프라
위 멀티 팀 백엔드까지 동일한 코드로 실행되도록 설계되었습니다. 개인 사용자는
org 를 전혀 의식할 필요가 없습니다 —
[개인 / 단일 테넌트 사용](docs/configuration.ko.md#개인--단일-테넌트-사용) 참고.

## 빠른 시작

기본 Compose 스택은 Postgres + Qdrant를 시작합니다. pgvector 배포는 Postgres
만으로 실행할 수 있습니다. Node.js ≥ 22가 필요합니다.

```bash
git clone https://github.com/YouSangSon/akasha.git
cd akasha

# 1. env 템플릿 복사 (default 그대로 동작 — OPENAI_API_KEY 는
#    EMBEDDING_PROVIDER=openai 로 바꿀 때만 필요)
cp .env.example .env
${EDITOR:-nano} .env

# 2. 기본 Compose 스택의 Postgres + Qdrant 실행 + 마이그레이션 + 빌드
./install.sh

# 3. 생성된 config snippet을 MCP 클라이언트에 연결:
cat .akasha/mcp/claude-desktop.json
cat .akasha/mcp/codex.toml

# session hook을 지원하는 host라면 lifecycle helper도 사용 가능:
.akasha/hooks/session-start.sh "continue implementation"
printf '%s\n' "Summary: durable outcome ..." | .akasha/hooks/session-end.sh
```

## 실전 예제 (Worked example)

결정을 저장하고, 다시 검색하고, 새 세션을 위한 팩을 만드는 흐름을 HTTP
API 로 보여줍니다 (MCP 도구도 동일한 필드를 받습니다). 응답은 설명을 위해
축약했습니다.

```bash
TOKEN=$MEMORY_API_TOKENS   # .env 에서 가져옴

# 1. 메모리 저장.
curl -sX POST http://localhost:8787/v1/memory \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"projectKey":"checkout","kind":"decision",
       "content":"재시도를 안전하게 만들려고 POST /charge 에 idempotency key 사용."}'
# → {"success":true,"data":{"ok":true,"memoryId":"project:checkout:42",
#                           "summary":"재시도를 안전하게 만들려고…"}}

# 2. 시맨틱 검색 — 키워드가 일치하지 않아도 됨.
curl -sX POST http://localhost:8787/v1/memory/search \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"projectKey":"checkout","query":"이중 청구는 어떻게 막지?"}'
# → {"success":true,"data":{"ok":true,"results":[
#      {"id":42,"memoryType":"decision",
#       "content":"재시도를 안전하게 만들려고…"}]}}

# 3. 새 에이전트 세션에 붙여넣을 컨텍스트 팩 생성.
curl -sX POST http://localhost:8787/v1/memory/context-pack \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"projectKey":"checkout","task":"환불 엔드포인트 추가"}'
# → data.packMarkdown 을 그대로 프롬프트에 넣으면 됩니다.
```

## 아키텍처

| 레이어 | 책임 |
|-------|------|
| MCP 서버 (`src/mcp/`) | 공유 MCP 서버 surface: tool descriptor, schema, registry, handler |
| HTTP 서버 (`src/app/`) | `/mcp` 의 MCP Streamable HTTP 와 `/v1/*` 아래 JSON HTTP 를 제공합니다 |
| Canonical store (`src/store/memory-repository.ts`) | Postgres — 레코드, 소스, ingest job, entity graph, 감사 |
| Vector index (`src/vector/`) | Qdrant (기본) 또는 pgvector — 청크 임베딩 + 유사도 검색. `VECTOR_BACKEND=pgvector` 로 Postgres 단독 배포 가능. |
| Compaction (`src/compact/`) | 중복 제거 (exact + 시맨틱), decay, archive, unarchive, sweeper |
| Embeddings (`src/embedding/`) | `transformers` (무료 로컬 ONNX, 기본), `openai` (`text-embedding-3-small`), 또는 `local` (CI용 결정론적 stub) |

데이터 흐름: 호출자가 `add_memory` → 레코드는 Postgres에 저장, entity mention
연결, 청크 분할 + 임베딩 + 활성 벡터 백엔드 upsert. `search_memory` → 쿼리
임베딩 → 활성 벡터 유사도 + Postgres FTS/entity lexical 검색 → hydrate → 랭킹
→ 반환. 자세한 설계 내용은 [docs/architecture.ko.md](docs/architecture.ko.md)
참고.

## 설정

모든 옵션은 환경 변수입니다. 처음 시작할 때 보통 건드리는 세 가지:

| 변수 | 기본값 | 용도 |
|------|--------|------|
| `MEMORY_API_TOKENS` | _(OAuth JWT 검증 미설정 시 필수)_ | HTTP API 용 static bearer 토큰; `token:org` 로 토큰을 org 에 바인딩 |
| `EMBEDDING_PROVIDER` | `transformers` | `transformers` (무료 로컬 ONNX), `openai`, 또는 `local` (CI stub) |
| `VECTOR_BACKEND` | `qdrant` | `qdrant`, 또는 Postgres 단독 배포용 `pgvector` |

`OPENAI_API_KEY` 는 선택 사항 — `EMBEDDING_PROVIDER=openai` 일 때만 필요합니다.
그 외에는 합리적인 기본값이 설정되어 있습니다. 전체 목록은
[.env.example](.env.example), 타입·기본값·예시는
[docs/configuration.ko.md](docs/configuration.ko.md) 참고.

## 문서 (Documentation)

운영자/기여자용 전체 문서는 [`docs/`](docs/README.md) 에 있습니다. 모든
페이지에는 한국어 (`*.ko.md`) 미러가 있습니다.

| 주제 | 설명 |
|------|------|
| [아키텍처](docs/architecture.ko.md) | 컴포넌트 다이어그램, 데이터 흐름, 임베딩 provider, 마이그레이션 이력 |
| [설정](docs/configuration.ko.md) | 모든 환경 변수의 타입·기본값·예시 |
| [API 레퍼런스](docs/api-reference.ko.md) | HTTP 엔드포인트와 MCP 도구 스키마 |
| [배포](docs/deployment.ko.md) | Docker Compose 셋업, 프로덕션 체크리스트 |
| [운영](docs/operations.ko.md) | 일상 작업: 헬스체크, 컴팩션, memory governance, 감사 로그 |
| [보안](docs/security.ko.md) | 인증 모델, 시크릿 스크러버, org 격리, 위협 모델 |
| [셀프-호스팅 운영](docs/self-hosted-operations.ko.md) | 백업·복원·스모크 테스트 런북 |
| [트러블슈팅](docs/troubleshooting.ko.md) | 흔한 장애 유형과 해결 절차 |

## 자주 쓰는 명령어

```bash
npm run dev:server    # HTTP API (watch 모드)
npm run dev:worker    # 백그라운드 sweeper (watch 모드)
npm run start:worker  # dist/에서 백그라운드 sweeper 실행
npm run dev:mcp       # MCP stdio 서버 (watch 모드)
npm run dev:cli       # CLI (watch 모드)
npm run lifecycle:init -- --project my-project --organization-id default
npm run typecheck     # tsc --noEmit
npm run test          # vitest run
npm run db:migrate    # 미적용 마이그레이션 실행
npm run backup:create # VECTOR_BACKEND 기준 backend-aware backup
npm run backup:create:pgvector # 명시적 Postgres-only pgvector backup
```

`VECTOR_BACKEND=qdrant` 에서는 `backup:create` 가 Postgres와 Qdrant snapshot을
함께 캡처합니다. `VECTOR_BACKEND=pgvector` 에서는 logical vector data lives in
Postgres 이므로 `backup:create` 는 `scripts/snapshot-qdrant.sh` 를 건너뛰며
`QDRANT_URL` 을 요구하지 않습니다. `BACKUP_ENCRYPTION_KEY_FILE` 을 설정하면
off-host copy 전에 backup artifact를 AES-256-GCM으로 암호화합니다.

## 기여 & 보안

- **기여:** [CONTRIBUTING.ko.md](CONTRIBUTING.ko.md) 와
  [행동 강령](CODE_OF_CONDUCT.ko.md) 참고.
- **보안:** 취약점은 [SECURITY.ko.md](SECURITY.ko.md) 절차로 제보해 주세요 —
  공개 이슈로 올리지 말아 주세요.
- **변경 이력:** 릴리스는 [CHANGELOG](CHANGELOG.ko.md) 에서 추적합니다.

## 라이선스

[MIT](LICENSE) — © 2026 YouSangSon.
