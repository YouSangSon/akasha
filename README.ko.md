<div align="center">

# 🧠 Akasha

**AI 코딩 에이전트를 위한 영구 메모리.**

세션이 바뀌어도 결정 사항, 제약 조건, 요약을 이어 갑니다.<br/>
자체 호스팅 저장소, 로컬 임베딩, MCP로 코딩 작업에 연결하세요.

[![CI](https://github.com/YouSangSon/akasha/actions/workflows/ci.yml/badge.svg)](https://github.com/YouSangSon/akasha/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue.svg)](https://modelcontextprotocol.io/)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org/)

[English](README.md) · **한국어** · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

[개요](#overview) · [빠른 시작](#quick-start) · [주요 기능](#features) · [메모리 UI](#memory-ui) · [아키텍처](#architecture) · [문서](#documentation)

</div>

---

<a id="overview"></a>
## 한눈에 보기

Akasha는 MCP 클라이언트가 오래 보관할 맥락을 저장하고 검색하는 공유 공간입니다.
Postgres가 원본 레코드를 보관하고, Qdrant 또는 pgvector가 재구축 가능한
검색 인덱스를 제공합니다. 기본 `transformers` 제공자는 임베딩 API 키 없이
ONNX로 텍스트를 로컬에서 임베딩합니다. 모델 파일은 처음 사용할 때 다운로드합니다.
클라이언트 구독료, 선택적으로 사용하는 유료 API, 호스팅 비용은 별도입니다.

| 필요한 일 | Akasha가 제공하는 것 |
|-----------|----------------------|
| 새 세션에서 작업 이어 가기 | 검색 가능한 결정 사항과 작업별 컨텍스트 팩 |
| 저장된 메모리 직접 관리하기 | 자체 호스팅 Postgres, 조직별 읽기·쓰기 격리, 감사 기록 |
| 검색 인덱스 복구하기 | Postgres의 원본 청크에서 벡터 재구축 |
| 운영할 서비스 줄이기 | `VECTOR_BACKEND=pgvector`로 Qdrant 대신 Postgres에 벡터 저장 |
| 에이전트가 기억하는 내용 검토하기 | 레코드 조회·수정·태그 지정·보관을 위한 메모리 UI |

이름은 *아카식 레코드(Akashic records)*에서 따왔습니다. 에이전트가 기억할
가치가 있는 것을 적어 두는 공간이라는 뜻입니다.

[DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)
같은 코드 분석 MCP 서버는 Akasha와 함께 사용할 수 있는 보완 도구입니다.
이런 도구는 저장소의 심볼, 라우트, 호출 그래프, ADR을 인덱싱해 코드 구조에
관한 질문에 답합니다. Akasha는 결정 사항, 제약 조건, 요약, 조직별 감사 기록,
컨텍스트 팩처럼 세션과 클라이언트를 넘어 유지할 에이전트 메모리를 저장합니다.

<a id="quick-start"></a>
## 빠른 시작

Docker(Postgres + Qdrant용)와 Node.js ≥ 22가 필요합니다.

```bash
git clone https://github.com/YouSangSon/akasha.git
cd akasha

# 1. 로컬 개발용 템플릿을 복사하고 인증정보를 확인하세요.
#    OPENAI_API_KEY는 EMBEDDING_PROVIDER=openai일 때만 필요합니다.
cp .env.example .env
${EDITOR:-nano} .env

# 2. Postgres + Qdrant 실행 + 마이그레이션 + 빌드.
./install.sh

# 3. 생성된 설정을 MCP 클라이언트에 추가하세요.
cat .akasha/mcp/claude-desktop.json
cat .akasha/mcp/codex.toml

# 세션 훅을 지원하는 환경에서는 수명주기 보조 스크립트도 사용할 수 있습니다.
.akasha/hooks/session-start.sh "continue implementation"
printf '%s\n' "Summary: durable outcome ..." | .akasha/hooks/session-end.sh
```

설치 프로그램은 데이터베이스, 빌드, 클라이언트 설정을 준비합니다. HTTP 서버를
시작하거나 다음 터미널에 `.env`를 환경 변수로 내보내지는 않습니다. HTTP 예제와
메모리 UI를 사용하려면 별도 터미널에서 다음 명령을 실행한 채로 두세요.

```bash
set -a
source .env
set +a
export DATABASE_URL="${DATABASE_URL:-postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT:-5432}/${POSTGRES_DB}}"
npm run start:server
```

설정 방법은 [클라이언트 연동 예제](docs/integrations.ko.md)를 참고하세요.
기본 Compose 인증정보는 로컬 개발용입니다. 다른 머신에서 서비스에 접근할 수
있게 하기 전에 교체하세요.

<a id="features"></a>
## 주요 기능

다음 제어 기능이 구현되어 있습니다. 실제 배포 준비 여부는 설정, 백업,
워크로드 검증에 따라 달라집니다.

- **원본 저장소와 파생 인덱스.** Postgres가 원본을 보관합니다. 원본 레코드와
  청크가 온전하면 벡터 인덱스를 재구축할 수 있습니다. `reindex_memory`는
  제한된 크기의 페이지 단위로 청크를 다시 임베딩하며, 백업을 대신하지 않습니다.
- **복구 가능한 수집 처리.** 벡터 저장소에 쓰기 전에 쓰기 의도를 먼저 기록합니다.
  수집 재처리 작업(ingest sweeper)을 활성화하면 중단된 쓰기의 대기 작업을
  재시도합니다(가시성 제한 시간을 둔 작업 점유, `FOR UPDATE SKIP LOCKED`).
- **저장 전 비밀정보 검사.** 콘텐츠를 저장하기 전에 검사합니다. 제공자 API 키,
  PEM 블록, bearer/JWT 토큰, 인증정보가 포함된 데이터베이스 URL은 저장하지 않고
  거부합니다(`SecretDetectedError`).
- **미리보기가 기본인 메모리 정리.** 완전 일치·의미 기반 중복 제거와 시간 경과에
  따른 보관 처리는 기본적으로 미리보기(`dryRun: true`)로 실행합니다. 실제 적용은
  멱등성을 보장하고 호출 빈도를 제한합니다. 보관한 레코드는 `unarchive_memory`로
  복원할 수 있습니다.
- **감사 기록과 호출 빈도 제한.** 도구를 호출하면 조직별 감사 기록 저장을 시도하며,
  저장 실패는 로그에 남깁니다. 토큰별 HTTP 호출 제한은 설정 가능하며 프로세스별로 적용됩니다.
- **두 가지 MCP 전송 방식과 JSON HTTP.** MCP 클라이언트는 stdio 또는
  `POST /mcp`의 Streamable HTTP를 사용할 수 있습니다. 스크립트와 MCP를 쓰지 않는
  클라이언트는 `/v1/*`의 JSON HTTP를 사용할 수 있습니다.
- **메모리 관리 UI.** 운영자는 정적 `/admin/memory` 화면에서 레코드를
  검토·수정하고 태그를 지정하거나 보관할 수 있습니다. 모든 데이터 요청은
  인증된 `/v1/*` API를 거칩니다.
- **운영 환경용 상태 점검.** `/healthz`(생존 상태)와 의존성 상태를 확인하는
  `/readyz`(준비 상태)를 Kubernetes나 로드 밸런서의 상태 점검에 사용할 수 있습니다.
- **교체 가능한 벡터 백엔드.** 기본값은 Qdrant이며, `VECTOR_BACKEND=pgvector`를
  설정하면 Postgres만으로 실행할 수 있습니다.

<a id="memory-ui"></a>
## 메모리 UI

HTTP 서버를 시작한 뒤 [http://localhost:8787/admin/memory](http://localhost:8787/admin/memory)를
여세요. 설정된 bearer 토큰 1개와 해당 조직 ID를 입력하고 레코드를 불러오면
메모리를 조회·수정하고 태그를 지정하거나 보관할 수 있습니다. 화면은 인증된
API를 사용하며 보관 처리 전에 확인을 요청합니다.
운영 절차는 [메모리 관리](docs/operations.ko.md)를 참고하세요.

## 도구와 API

코딩 에이전트와의 대화는 세션이 끝나면 맥락을 잃습니다. Akasha는
에이전트가 기억할 가치가 있는 내용을 저장하고 다음에 다시 읽는 공간입니다.
동일한 서비스 도구 20개를 MCP stdio, `POST /mcp`의 MCP Streamable HTTP,
`/v1/*`의 JSON HTTP로 제공합니다. 전체 요청·응답 스키마는
[API 레퍼런스](docs/api-reference.ko.md)에 있습니다.
HTTP와 MCP는 같은 서비스 스키마를 공유하므로 입력 검증과 데이터 형식이
일치합니다. MCP는 연결된 클라이언트가 해당 기능을 지원한다고 알리면
작업 공간 루트 조회, 사용자 입력 요청, 샘플링을 위한 맥락 보조 도구도 제공합니다.

| 도구 | 하는 일 | HTTP 라우트 |
|------|---------|-------------|
| `add_memory` | 결정, 사실, 요약 저장(저장 전 비밀정보 검사) | `POST /v1/memory` |
| `search_memory` | 범위 필터를 적용한 벡터·어휘 통합 검색 | `POST /v1/memory/search` |
| `build_context_pack` | 새 세션에 전달할 간결한 컨텍스트 팩 생성 | `POST /v1/memory/context-pack` |
| `compact_memory` | 중복되거나 시간 경과로 중요도가 낮아진 레코드 정리(실제 적용 또는 미리보기) | `POST /v1/memory/compact` |
| `reindex_memory` | 보존된 Postgres 청크에서 벡터 재구축 | `POST /v1/memory/reindex` |
| `list_memory` | 태그·보관 여부 필터로 원본 레코드 검토 | `POST /v1/memory/list` |
| `inspect_memory_graph` | 저장된 개체 언급과 관계 조회 | `POST /v1/memory/graph` |
| `update_memory` | 원본 레코드 1개 수정 후 벡터 상태 갱신 | `POST /v1/memory/update` |
| `delete_memory` | 관리 목적으로 레코드 1개를 보관하고 벡터 정리 | `POST /v1/memory/delete` |
| `tag_memory` | 레코드 1개의 관리 태그 교체 | `POST /v1/memory/tag` |
| `unarchive_memory` | 조사·복구를 위해 보관된 레코드 복원 | `POST /v1/memory/unarchive` |
| `list_audit_log` | 규정 준수·디버깅을 위한 감사 기록 조회 | `POST /v1/audit/list` |
| `start_goal_run` | 종료 조건을 선택적으로 지정해 지속적인 목표 실행 시작 | `POST /v1/goal-run/start` |
| `record_iteration` | 시도·결과 추가 및 관련 메모리 고정(선택 사항) | `POST /v1/goal-run/iteration` |
| `get_goal_run` | 목표 실행 1개와 순서대로 정렬된 반복 기록 조회 | `POST /v1/goal-run/get` |
| `list_goal_runs` | 범위와 상태별 목표 실행 목록 조회 | `POST /v1/goal-run/list` |
| `complete_goal_run` | 진행 중인 목표 실행을 해결 내용과 함께 완료 처리 | `POST /v1/goal-run/complete` |
| `abandon_goal_run` | 진행 중인 목표 실행을 사유와 함께 중단 처리 | `POST /v1/goal-run/abandon` |
| `build_goal_context` | 실행 이력과 메모리로 목표를 이어 갈 맥락 생성 | `POST /v1/goal-run/context` |
| `check_repeat_attempt` | 다음 시도가 이전 실패를 반복하는지 감지 | `POST /v1/goal-run/check-repeat` |

MCP 전용 맥락 도구도 있습니다. `list_workspace_roots`는 클라이언트가 제공한
작업 공간 루트를 읽습니다. `add_memory_interactive`는 MCP의 사용자 입력 요청
기능으로 사용자가 확인한 메모리를 수집·저장합니다. `classify_memory_candidate`는
MCP 샘플링으로 메모리 종류와 요약을 제안합니다.

레코드별 `organization_id`를 통한 멀티테넌트 지원, bearer 토큰 인증,
감사 기록, 호출 빈도 제한을 갖추고 있습니다. 노트북의 단일 사용자 MCP 서버나
여러 팀을 위한 자체 인프라의 백엔드로 실행하도록 설계했습니다. 개인 사용자는
하나의 조직 이름을 정해 일관되게 사용하면 됩니다.
[개인 / 단일 테넌트 사용](docs/configuration.ko.md#개인--단일-테넌트-사용)을 참고하세요.

## 실전 예제

HTTP API로 결정을 저장하고, 다시 검색하고, 새 세션에 전달할 팩을 만듭니다.
MCP 도구도 같은 필드를 사용합니다. 응답은 설명을 위해 축약했습니다.

```bash
# 설정된 토큰 1개를 입력하세요. 선택적인 :org 접미사는 제외합니다.
read -r -s -p "API token: " TOKEN
printf '\n'
ORGANIZATION_ID=default   # 조직에 연결된 토큰이라면 해당 조직을 사용하세요.

# 1. 메모리 저장.
curl -sX POST http://localhost:8787/v1/memory \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "x-organization-id: $ORGANIZATION_ID" \
  -d '{"projectKey":"checkout","kind":"decision",
       "content":"Use idempotency keys on POST /charge to make retries safe."}'
# → {"success":true,"data":{"ok":true,"memoryId":"project:checkout:42",
#                           "summary":"Use idempotency keys on POST /charge…"}}

# 2. 의미 기반 검색 — 키워드가 일치하지 않아도 됩니다.
curl -sX POST http://localhost:8787/v1/memory/search \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "x-organization-id: $ORGANIZATION_ID" \
  -d '{"projectKey":"checkout","query":"how do we avoid double-charging?"}'
# → {"success":true,"data":{"ok":true,"results":[
#      {"id":42,"memoryType":"decision",
#       "content":"Use idempotency keys on POST /charge…"}]}}

# 3. 새 에이전트 세션에 붙여넣을 컨텍스트 팩 생성.
curl -sX POST http://localhost:8787/v1/memory/context-pack \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "x-organization-id: $ORGANIZATION_ID" \
  -d '{"projectKey":"checkout","task":"add refund endpoint"}'
# → data.packMarkdown을 프롬프트에 바로 넣으면 됩니다.
```

<a id="architecture"></a>
## 아키텍처

| 계층 | 책임 |
|------|------|
| MCP 서버 (`src/mcp/`) | 공유 MCP 서버 인터페이스: 도구 설명, 스키마, 레지스트리, 핸들러 |
| HTTP 서버 (`src/app/`) | `/mcp`의 MCP Streamable HTTP와 `/v1/*`의 JSON HTTP 제공 |
| 원본 저장소 (`src/store/memory-repository.ts`) | Postgres — 레코드, 소스, 수집 작업, 개체 그래프, 감사 기록 |
| 벡터 인덱스 (`src/vector/`) | Qdrant(기본값) 또는 pgvector — 청크 임베딩과 유사도 검색. `VECTOR_BACKEND=pgvector`를 설정하면 Postgres만으로 배포 가능. |
| 메모리 정리 (`src/compact/`) | 완전 일치·의미 기반 중복 제거, 시간에 따른 중요도 감소, 보관·복원, 재처리 작업 |
| 임베딩 (`src/embedding/`) | `transformers`(무료 로컬 ONNX, 기본값), `openai`(`text-embedding-3-small`), `local`(CI용 결정론적 스텁) |

쓰기 흐름: `add_memory` 호출 → Postgres에 레코드 저장 → 개체 언급 연결 →
콘텐츠를 청크로 분할·임베딩하고 활성 벡터 백엔드에 삽입·갱신합니다.
검색 흐름: `search_memory` → 질의 임베딩 → 벡터 유사도 검색과 Postgres
전문 검색(FTS)·개체 어휘 검색 → 원본 데이터 조회 → 순위 산정 → 반환합니다.
자세한 설계는 [아키텍처 문서](docs/architecture.ko.md)를 참고하세요.

## 설정

모든 설정은 환경 변수로 지정합니다. 처음 사용할 때 주로 설정하는 세 가지입니다.

| 변수 | 기본값 | 용도 |
|------|--------|------|
| `MEMORY_API_TOKENS` | _(OAuth JWT 검증 미설정 시 필수)_ | HTTP API용 고정 bearer 토큰. `token:org`로 토큰을 조직에 연결 |
| `EMBEDDING_PROVIDER` | `transformers` | `transformers`(무료 로컬 ONNX), `openai`, `local`(CI 스텁) |
| `VECTOR_BACKEND` | `qdrant` | `qdrant` 또는 Postgres 단독 배포용 `pgvector` |

`OPENAI_API_KEY`는 선택 사항이며 `EMBEDDING_PROVIDER=openai`일 때만 필요합니다.
그 외의 설정에는 기본값이 있습니다. 전체 목록은 [.env.example](.env.example),
타입·기본값·예시는 [설정 문서](docs/configuration.ko.md)를 참고하세요.

<a id="documentation"></a>
## 문서

이 README는 영어, 한국어, 일본어, 중국어 간체로 제공하며 절 순서, 예제,
기능 범위를 동일하게 유지합니다. 운영자와 기여자를 위한 상세 문서는
[`docs/`](docs/README.ko.md)에서 영어와 한국어로 관리합니다.
일본어·중국어 README는 영어 참조 문서로 연결합니다.

| 주제 | 설명 |
|------|------|
| [아키텍처](docs/architecture.ko.md) | 컴포넌트 다이어그램, 데이터 흐름, 임베딩 제공자, 마이그레이션 이력 |
| [설정](docs/configuration.ko.md) | 모든 환경 변수의 타입·기본값·예시 |
| [API 레퍼런스](docs/api-reference.ko.md) | HTTP 엔드포인트와 MCP 도구 스키마 |
| [배포](docs/deployment.ko.md) | Docker Compose 설정, 프로덕션 체크리스트 |
| [운영](docs/operations.ko.md) | 일상 작업: 상태 점검, 메모리 정리, 메모리 관리, 감사 기록 |
| [보안](docs/security.ko.md) | 인증 모델, 비밀정보 검사, 조직 격리, 위협 모델 |
| [자체 호스팅 운영](docs/self-hosted-operations.ko.md) | 백업·복원·스모크 테스트 런북 |
| [문제 해결](docs/troubleshooting.ko.md) | 흔한 장애 유형과 해결 절차 |

## 자주 쓰는 명령어

```bash
npm run dev:server    # HTTP API 변경 감지 모드
npm run dev:worker    # 백그라운드 재처리 작업 변경 감지 모드
npm run start:worker  # dist/에서 백그라운드 재처리 작업 실행
npm run dev:mcp       # MCP stdio 서버 변경 감지 모드
npm run dev:cli       # CLI 변경 감지 모드
npm run lifecycle:init -- --project my-project --organization-id default
npm run typecheck     # tsc --noEmit
npm run build         # dist/ 정리 후 TypeScript 컴파일
npm run audit:dependencies
npm test              # vitest run
npm run db:migrate    # 미적용 마이그레이션 실행
npm run backup:create # VECTOR_BACKEND에 맞춰 백업
npm run backup:create:pgvector # Postgres 단독 pgvector 백업 명시적 실행
```

`VECTOR_BACKEND=qdrant`에서는 `backup:create`가 Postgres와 Qdrant 스냅샷을
함께 저장합니다. `VECTOR_BACKEND=pgvector`에서는 논리 벡터 데이터가 Postgres에
있으므로 `backup:create`가 `scripts/snapshot-qdrant.sh`를 건너뛰며
`QDRANT_URL`을 요구하지 않습니다. `BACKUP_ENCRYPTION_KEY_FILE`을 설정하면
외부 호스트로 복사하기 전에 백업 파일을 AES-256-GCM으로 암호화합니다.

## 현재 상태와 한계

- 기본 구성은 로컬에서 실행됩니다. CI 배지가 통과 상태여도 프로덕션 배포를
  입증하지는 않습니다. 현재 검증 결과와 미해결 작업은 [GATES.md](https://github.com/YouSangSon/akasha/blob/main/GATES.md)에 기록합니다.
- 토큰 절감 효과는 클라이언트와 작업 방식에 따라 달라집니다. 통제된 MCP·CLI
  평가 결과는 각각 별도로 기록하며, 일반적인 토큰 절감이나 지연·비용 감소를
  보장하지 않습니다. [평가 근거](https://github.com/YouSangSon/akasha/blob/main/GATES.md)를 참고하세요.
- 비밀정보 검사는 알려진 패턴을 거부하며 모든 비밀정보를 식별할 수는 없습니다.
  메모리 콘텐츠에 인증정보를 넣지 마세요.
- 벡터 인덱스를 재구축해도 삭제된 원본 데이터는 복구되지 않습니다. 검증된
  백업과 [복원 런북](docs/self-hosted-operations.ko.md)을 사용하세요.

## 기여와 보안

- **기여:** [CONTRIBUTING.ko.md](CONTRIBUTING.ko.md)와
  [행동 강령](CODE_OF_CONDUCT.ko.md)을 참고하세요.
- **보안:** 취약점은 [SECURITY.ko.md](SECURITY.ko.md)의 절차로 제보해 주세요.
  공개 이슈로 올리지 말아 주세요.
- **변경 이력:** [CHANGELOG](CHANGELOG.ko.md)에서 릴리스를 추적합니다.

## 라이선스

[MIT](LICENSE) — © 2026 YouSangSon.
