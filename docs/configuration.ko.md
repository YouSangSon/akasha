> [English](configuration.md) | **한국어**

# 설정 레퍼런스

Akasha는 환경 변수만으로 설정됩니다. 설정 파일이나 런타임 플래그가
없습니다. 이 문서는 프로젝트가 읽는 모든 변수의 정식 레퍼런스입니다.

복사해서 쓰는 템플릿은 repo 루트의 [.env.example](../.env.example) 참고.
`install.sh` wrapper가 첫 실행 시 그 템플릿에서 `.env` 를 자동 생성합니다.

## 설정 흐름

```
.env (사용자 파일)
   ├─→ docker compose 치환            (compose.yaml의 ${VAR:-default})
   └─→ Node process.env               (src/config.ts에서 읽음)
```

Postgres / Qdrant 컨테이너 안의 모든 것은 compose 레이어에서 옵니다. Node
앱은 `src/config.ts` 의 `resolveServiceConfig` 를 통해 `process.env` 를 직접
읽습니다. `compose up` 에 전달된 값은 양쪽 모두에 전파됩니다.

## 검증 동작

**필수**로 표시된 변수는 누락 / invalid 시 시작 시 throw 합니다. 의도적입니다 —
정의되지 않은 값으로 silently 실행하는 것보다 fail-closed 가 낫습니다.

`MEMORY_API_TOKENS` 와 OAuth token validation이 모두 없는 상태에서
non-loopback 호스트 (`HOST=0.0.0.0`, `HOST=10.x.x.x` 등) 바인딩도
fail-closed gate가 거부합니다 — 실수로 zero-auth public 노출되는 것을
막습니다.

## 필수

| 변수 | 기본값 | 메모 |
|---|---|---|
| `MEMORY_API_TOKENS` | — | 콤마 구분 static bearer 토큰. non-loopback 바인딩에서는 OAuth token validation을 설정하지 않았다면 필수. 아래 [Auth](#auth) 참고. |

`OPENAI_API_KEY` 는 기본 동작에 **필수가 아닙니다**. 기본 임베딩 provider 는
`transformers` (무료 로컬 ONNX) 입니다. `EMBEDDING_PROVIDER=openai` 로 설정한
경우에만 `OPENAI_API_KEY` 를 지정하세요. [Embedding](#embedding) 섹션 참고.

## Postgres

compose 번들 Postgres가 기본. 외부 인스턴스를 가리키려면 `DATABASE_URL` 오버라이드.

| 변수 | 기본값 | 메모 |
|---|---|---|
| `DATABASE_URL` | (계산됨) | 전체 URL. `POSTGRES_*` 보다 우선. |
| `POSTGRES_USER` | `memory` | |
| `POSTGRES_PASSWORD` | `memory` | production 에서는 변경. |
| `POSTGRES_DB` | `memory_os` | |
| `POSTGRES_HOST` | `127.0.0.1` (호스트 프로세스) / `postgres` (compose) | |
| `POSTGRES_PORT` | `5432` | |

compose 관리 Postgres 사용 시 `DATABASE_URL` 은 `POSTGRES_*` 부분에서
자동 빌드됩니다 (네트워크 내부 host=`postgres`). 호스트에서 마이그레이션
스크립트 실행 시 `install.sh` 가 host를 `127.0.0.1:5432` 로 다시 씁니다.

## 벡터 백엔드

| 변수 | 기본값 | 메모 |
|---|---|---|
| `VECTOR_BACKEND` | `qdrant` | `qdrant` (기본) 또는 `pgvector`. `pgvector` 선택 시 벡터를 Postgres 에 저장 — Qdrant 서비스 불필요, Qdrant 자격증명도 불필요. 백엔드 전환 시 `reindex_memory` 필수. |

### pgvector — 관리자 사전 요건

`VECTOR_BACKEND=pgvector` 사용 시 앱 시작 전에 Postgres `vector` 확장이 설치되어 있어야 합니다. 앱은 부팅 시 확장 존재 여부를 확인하고 없으면 명확한 에러를 던집니다 — 앱 자체적으로 `CREATE EXTENSION` 을 실행하지 **않습니다** (슈퍼유저 권한 필요, 앱 role에는 보통 없음).

**Docker / 로컬** (`pgvector/pgvector:pg16` 이미지에 확장 포함; `postgres` 슈퍼유저로 실행):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**RDS / Cloud SQL / Supabase**: 관리형 확장 패널 또는 일회성 슈퍼유저 마이그레이션 스크립트로 활성화. Supabase 신규 프로젝트는 기본 활성화됨. RDS 는 `rds_superuser` 권한으로 마이그레이션 실행.

확장이 존재하면 이후 테이블·인덱스 생성은 앱 role (테이블 소유자 권한으로 충분) 이 처리합니다.

## Qdrant

Qdrant 변수는 `VECTOR_BACKEND=qdrant` (기본값) 일 때만 필요합니다.

| 변수 | 기본값 | 메모 |
|---|---|---|
| `QDRANT_URL` | `http://localhost:6333` | compose 내부: `http://qdrant:6333`. |
| `QDRANT_API_KEY` | `local-qdrant-key` | 개발 전용 기본값. production 에서는 강한 값으로 생성해서 교체. |
| `QDRANT_COLLECTION_NAME` | `memory_chunks_v1` | 버전 bump 시 reindex 필요. |

compose 기본 자격증명은 로컬 개발 전용입니다. production 운영자는 첫 배포 전에
`POSTGRES_PASSWORD`, `QDRANT_API_KEY`, `MEMORY_API_TOKENS` 의 모든 값을
생성한 secret으로 교체해야 합니다.

## 서버 바인드 (HTTP API)

| 변수 | 기본값 | 메모 |
|---|---|---|
| `HOST` | `127.0.0.1` | 바인드 인터페이스. `0.0.0.0` 은 외부 노출 — `MEMORY_API_TOKENS` 또는 OAuth token validation과 함께 사용. |
| `PORT` | `8787` | |
| `NODE_ENV` | unset | `production` 시 connection pooling 기본값 활성. |

## Embedding

| 변수 | 기본값 | 메모 |
|---|---|---|
| `EMBEDDING_PROVIDER` | `transformers` | `transformers` (무료 로컬 ONNX, default), `openai` (유료 API), 또는 `local` (CI용 결정론적 stub). |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | 1536-dim. 변경 시 reindex 필요. |
| `TRANSFORMERS_EMBEDDING_MODEL` | `Xenova/all-MiniLM-L6-v2` | Hugging Face ONNX 모델 id. 384-dim. `EMBEDDING_PROVIDER=transformers` 일 때만 의미. |
| `EMBEDDING_DIMENSIONS` | `384` | `transformers` / `local` provider의 벡터 크기. |
| `EMBEDDING_MODEL` | `local-deterministic-v1` | `EMBEDDING_PROVIDER=local` 일 때만 의미. |

### Provider 선택 — 비용 vs. 품질 vs. 셋업

| Provider | 비용 | 의미 검색 품질 | 셋업 |
|---|---|---|---|
| `openai` | 유료 (개인 사용 시 월 몇 센트 수준; [openai.com/api/pricing](https://openai.com/api/pricing)에서 확인) | 최고 | `OPENAI_API_KEY` 만 설정 |
| `transformers` | **무료** | 좋음 (대부분 워크로드에서 OpenAI에 근접) | `npm install @huggingface/transformers` (optional dep, ~50MB onnxruntime + 첫 호출 시 ~22MB 모델 다운) |
| `local` | 무료 | **없음 — 의미 없음**, 정확 일치만 | 셋업 불필요, 단 실제 검색에는 부적합 |

`transformers` provider는 `Xenova/all-MiniLM-L6-v2` 를 ONNX로 로컬 실행 —
Chroma와 txtai가 default로 채택한 동일 모델. CPU 추론으로 충분
(노트북에서 초당 수백 임베딩). 모델과 토크나이저는 첫 호출 시
`~/.cache/huggingface/hub/` 에 다운로드되고 캐시됩니다. 에어갭 배포 시
해당 캐시 디렉토리를 미리 채워둘 것.

**provider 변경은 reindex 필수** — 다른 vector dimension / 컨텐츠 의미는
호환되지 않는 Qdrant point를 만듭니다. 변경 후 `reindex_memory` MCP 도구
또는 `POST /v1/memory/reindex` 실행. 특히 v1.0.x → transformers-default
업그레이드는 [docs/migrations/openai-to-transformers.ko.md](migrations/openai-to-transformers.ko.md)
의 단계별 절차 참고 (Qdrant collection 을 새 차원으로 재생성하는 `curl`
명령 포함).

## Auth

`MEMORY_API_TOKENS` 는 콤마 구분 bearer 토큰 리스트. 각 토큰은 `:` 문법으로
organization에 옵션 바인딩 가능:

```bash
# 단일 토큰, 어느 org든:
MEMORY_API_TOKENS=dev-token

# 다중 토큰 로테이션 (둘 다로 배포 → 클라이언트 로테이션 → 옛날 거 제거):
MEMORY_API_TOKENS=old-token,new-token

# Org 바인딩 (멀티-테넌트): 각 토큰은 바인딩된 org만 read/write.
MEMORY_API_TOKENS=alpha-token:dev-team,beta-token:finance-team

# 혼합:
MEMORY_API_TOKENS=alpha-token:dev-team,legacy-token
```

토큰에 org 바인딩이 있을 때:
- 요청은 자동으로 `organizationId = <bound org>` 상속.
- 요청 body 또는 `x-organization-id` 헤더가 다르면 → **403**.

토큰에 바인딩이 없을 때 (legacy):
- `x-organization-id` 헤더 또는 body의 `organizationId` 사용.
- 둘 다 없으면 default-strict 가드가 명확한 에러로 차단 — 운영자가 (토큰
  org 바인딩 / 헤더 / body) 세 가지 수정 경로 중 하나를 선택하도록 안내.
  production 에서는 반드시 토큰을 org에 바인딩.
- 의도적인 단일 테넌트 설치 (org 추가 계획 없음) 의 경우 `.env` 에
  `LEGACY_ANONYMOUS_SEARCH=true` 명시 — 매 요청마다 플래그 읽어서 재시작
  없이 토글 가능. 이 플래그는 이제 **모든** 읽기 경로를 제어합니다:
  `retrieve_memory` (검색), `compact_memory` dry-run (`listMemory`),
  벡터 하이드레이션 단계 (`getMemoryRecordsByIds`). 플래그 없이 org 를
  생략하면 해당 읽기 호출이 운영 안내 에러를 던집니다.

### OAuth/OIDC protected-resource discovery 및 JWT 검증

Akasha는 MCP Streamable HTTP 클라이언트용 OAuth 2.0 Protected Resource
Metadata를 광고하고, 설정된 authorization server가 발급한 JWT access token을
검증할 수 있습니다. 정적 `MEMORY_API_TOKENS` 는 계속 동작합니다. HTTP
클라이언트는 설정된 static token 또는 issuer/audience/signature/expiry/scope
검증을 통과한 JWT 중 하나로 인증할 수 있습니다. Origin check와 rate limit도
계속 적용됩니다.

비활성화하려면 `MCP_OAUTH_AUTHORIZATION_SERVERS` 를 설정하지 마세요. 이 값이
설정되면 `MCP_OAUTH_RESOURCE_URL` 이 필수이며, 앱은 다음 metadata endpoint를
인증 없이 제공합니다:

- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-protected-resource/mcp`

인증되지 않은 `/mcp`, `/v1/*` 요청의 401 응답에는 `resource_metadata` 와
`scope` 파라미터가 들어간 `WWW-Authenticate` challenge도 포함됩니다.

OAuth access token은 다음 조건을 모두 만족할 때만 허용됩니다:
- `iss` 가 `MCP_OAUTH_AUTHORIZATION_SERVERS` 중 하나와 일치.
- `aud` 가 `MCP_OAUTH_RESOURCE_URL` 을 포함.
- Signature가 issuer의 JWKS로 검증됨.
- `MCP_OAUTH_JWT_CLOCK_TOLERANCE_SECONDS` 허용치 안에서 만료/nbf 검증 통과.
- 요청한 tool에 필요한 scope 보유.

Scope:
- `akasha:read` — `search_memory`, `build_context_pack`,
  `list_memory`, `list_workspace_roots`, `classify_memory_candidate`, dry-run
  `compact_memory`.
- `akasha:write` — `add_memory`, `add_memory_interactive`.
- `akasha:admin` — `reindex_memory`, `unarchive_memory`, `list_audit_log`,
  `update_memory`, `delete_memory`, `tag_memory`, `dryRun: false` 인
  `compact_memory`.
- `akasha:memory` — 위 scope를 모두 만족하는 호환성 umbrella scope.

JWT에 `MCP_OAUTH_ORGANIZATION_CLAIM` (기본 `organization_id`) 이 비어 있지
않은 문자열로 있으면 Akasha는 이를 토큰-org 바인딩처럼 취급합니다. 요청은 해당
`organizationId` 를 자동 상속하고, body/header org가 충돌하면 403을 반환합니다.

| 변수 | 기본값 | 메모 |
|---|---|---|
| `MCP_OAUTH_AUTHORIZATION_SERVERS` | unset → 비활성 | Authorization server issuer HTTPS URL 콤마 구분 목록. |
| `MCP_OAUTH_RESOURCE_URL` | 활성화 시 필수 | 외부에서 접근 가능한 public protected resource HTTPS URL. 보통 `https://.../mcp`. |
| `MCP_OAUTH_SCOPES` | `akasha:memory` | Metadata에는 배열로, challenge header에는 공백 구분으로 들어가는 콤마 구분 scope. |
| `MCP_OAUTH_JWKS_URLS` | issuer metadata에서 discovery | 선택적 HTTPS JWKS URL 콤마 구분 목록. 설정 시 authorization server마다 하나씩 제공. |
| `MCP_OAUTH_JWT_ALGORITHMS` | `RS256,RS384,RS512,PS256,PS384,PS512,ES256,ES384,ES512,EdDSA` | 허용할 JWS `alg` 값. |
| `MCP_OAUTH_JWT_CLOCK_TOLERANCE_SECONDS` | `60` | `exp` / `nbf` 검증 시 clock skew 허용치. |
| `MCP_OAUTH_JWT_TYPE` | unset | 선택적 JWT `typ` header 강제값. 예: `at+jwt`. Provider 호환성을 위해 기본은 미강제. |
| `MCP_OAUTH_ORGANIZATION_CLAIM` | `organization_id` | 존재할 때 org 바인딩으로 쓰는 JWT claim. |
| `MCP_OAUTH_JWKS_TIMEOUT_MS` | `5000` | 원격 JWKS fetch timeout. |
| `MCP_OAUTH_RESOURCE_NAME` | unset | 선택적 human-readable `resource_name`. |
| `MCP_OAUTH_RESOURCE_DOCUMENTATION_URL` | unset | 선택적 HTTPS URL. Metadata의 `resource_documentation` 으로 노출. |

## 개인 / 단일 테넌트 사용

`organization_id` 는 단순한 문자열 라벨이며 "회사" 나 "계정" 개념이 아닙니다 —
별도 가입이나 사용자 시스템은 존재하지 않습니다. 레코드 보유 테이블은 org 를
생략한 쓰기를 `'default'` 로 저장하지만, 읽기 경로는 기본적으로 strict 입니다:
search/context-pack/compact 읽기에는 `organizationId` 를 전달하거나 토큰을 org에
바인딩하세요. 명시적으로 `LEGACY_ANONYMOUS_SEARCH=true` 를 설정한 경우에만
과거의 org-blind 읽기를 허용합니다. 1인 사용에서도 하나의 org 라벨을 정하고
일관되게 사용하세요.

격리 강도가 점점 높아지는 3가지 개인 사용 셋업:

| 사용 사례 | `MEMORY_API_TOKENS` | `HOST` | 결과 |
|---|---|---|---|
| 로컬 솔로, 인증 없음 | (빈 값) | `127.0.0.1` | 쓰기는 `'default'` org 를 사용할 수 있음. 읽기에는 `organizationId: "default"` 를 전달하거나 `LEGACY_ANONYMOUS_SEARCH=true` 를 명시. |
| 로컬 솔로, 토큰 보호 | `mytoken` (콜론 없음) | `127.0.0.1` 또는 LAN | 토큰 검증. strict 읽기 경로에는 `x-organization-id: default` 또는 body `organizationId` 전달. |
| 향후 확장 대비 단일 테넌트 | `mytoken:yousang-personal` | 자유 | 토큰 바인딩으로 명명된 단일 테넌트에 격리 — 추후 인원 추가는 콤마 구분 항목 1줄 추가뿐, 스키마 변경 불필요. |

멀티 테넌시는 같은 코드 경로의 **N=1 특수 케이스**이므로 "personal mode" 플래그나
별도 쿼리 경로가 존재하지 않습니다. 향후 진짜 사용자별 격리 (예: 여러 개인에게
SaaS 형으로 서빙) 가 필요하면 각 사용자에게 `token:org` 쌍을 하나씩 발급하면
됩니다 — SQL/Qdrant 양 계층의 org 필터가 나머지를 처리합니다.

## Rate limit

| 변수 | 기본값 | 메모 |
|---|---|---|
| `RATE_LIMIT_PER_MINUTE` | unset → 제한 없음 (compose 배포 기본값 **60**) | 토큰별 token-bucket 캡. production 권장. |

Compaction-apply 경로에는 별도 더 엄격한 limit (org당 1회/시간 기본) 이
`applyCompaction` deps에 하드코딩되어 있습니다. 커스텀 통합에서는 다르게
구성 가능.

## Compaction sweeper

archive 된 레코드의 인라인 Qdrant delete가 실패한 경우 sweeper가 재시도.
기본 off — 지속 실행 단일 replica에서만 opt-in.

| 변수 | 기본값 | 메모 |
|---|---|---|
| `COMPACTION_SWEEP_ENABLED` | `false` | truthy 값: `true`, `1`, `yes` (대소문자 무관). 그 외 = false. |
| `COMPACTION_SWEEP_INTERVAL_MS` | `30000` | tick 간격. ≥ 1000 필수. |

활성 시 각 tick 에서 pending row 최대 100개 처리, 5회 시도 후 포기
(`qdrant_status='failed'` 로 표시 — ops 검토용).

## Ingest sweeper

ingest sweeper 는 write-ahead `markQdrantPending` 과 `markQdrantCompleted`
사이에 프로세스 크래시로 Qdrant upsert 가 중단된 메모리 레코드를 재인덱스합니다.
활성화하지 않으면 크래시 고아 레코드는 Qdrant 대기열에 무기한 남아 검색에 노출되지
않습니다. 기본 off — 지속 실행 단일 replica 에서만 opt-in.

| 변수 | 기본값 | 메모 |
|---|---|---|
| `INGEST_SWEEP_ENABLED` | `false` | truthy 값: `true`, `1`, `yes` (대소문자 무관). 그 외 = false. |
| `INGEST_SWEEP_INTERVAL_MS` | `30000` | tick 간격(ms). ≥ 1000 필수. |

활성 시 각 tick 에서 만료된 row 최대 100개 claim, 5회 시도 후 포기
(`qdrant_status='failed'` 로 표시 — ops 검토용). 백오프는 지수 증가:
1 s, 2 s, 4 s, 8 s, 최대 5분.

## 백업

| 변수 | 기본값 | 메모 |
|---|---|---|
| `BACKUP_DIR` | `./.developer-memory-os/backups` | `npm run backup:create` 의 출력 디렉토리. |
| `BACKUP_TARGET_HOST` | unset | 옵션. 오프-호스트 복제용 SSH/scp 대상. 비워두면 `backup:create` 는 로컬에만 저장; `backup:verify` 는 비어 있지 않은 원격 대상 필요. |
| `BACKUP_TARGET_DIR` | `BACKUP_DIR` | 옵션. 백업 복사와 검증 스크립트가 사용하는 원격 디렉토리. |

백업/복원 워크플로는 [docs/operations.md](operations.md) 참고.

## 로깅과 MCP identity

| 변수 | 기본값 | 메모 |
|---|---|---|
| `LOG_LEVEL` | production은 `info`, 그 외는 `debug` | pino 로그 레벨. MCP stdio JSON-RPC를 깨지 않도록 로그는 stderr로 출력. |
| `DEVELOPER_MEMORY_USER_ID` | `git config user.email` 기반 해시, 없으면 OS username | 도구가 user memory를 필요로 하고 `userScopeId`가 명시되지 않았을 때 쓰는 안정적인 user-scope id. |
| `DMO_CWD` | `process.cwd()` | MCP stdio 시작 작업 디렉토리 override. 빌드된 CLI를 다른 디렉토리에서 실행할 때 유용. |

## Restore smoke

`npm run restore:smoke` 는 일반 request serving 경로가 아닌 운영 검증 helper입니다.
`BACKUP_DIR` 의 최신 manifest를 격리된 compose 프로젝트에 복원하고 search /
context-pack 동작을 검증합니다.

| 변수 | 기본값 | 메모 |
|---|---|---|
| `RESTORE_POSTGRES_URL` | 필수 | 격리 restore Postgres 연결 문자열. |
| `RESTORE_QDRANT_URL` | Qdrant manifest에서 필수 | 격리 restore Qdrant URL. pgvector manifest는 Qdrant restore를 건너뜁니다. |
| `RESTORE_SMOKE_POSTGRES_RESTORE_CMD` | 필수 | `RESTORE_SMOKE_POSTGRES_ARTIFACT_PATH` 를 복원하는 shell command. |
| `RESTORE_SMOKE_QDRANT_RESTORE_CMD` | Qdrant manifest에서 필수 | `RESTORE_SMOKE_QDRANT_ARTIFACT_PATH` 를 복원하는 shell command. pgvector manifest는 이 command를 건너뜁니다. |
| `RESTORE_SMOKE_PROJECT` | `restore-smoke` | 격리 stack의 Docker Compose project 이름. |
| `RESTORE_SMOKE_PROJECT_KEY` | `project-alpha` | smoke search와 context-pack check에 쓰는 project key. |
| `RESTORE_SMOKE_ORGANIZATION_ID` | unset | strict search/context-pack check에 전달할 선택적 organization id. 기본 strict restore에서는 설정하고, 의도적으로 `LEGACY_ANONYMOUS_SEARCH=true`를 쓸 때만 생략. |
| `RESTORE_SMOKE_USER_SCOPE_ID` | unset | restore check에 포함할 선택적 user scope. |
| `RESTORE_SMOKE_SEARCH_QUERY` | `continue work` | 복원된 search check에 쓰는 query. |
| `RESTORE_SMOKE_PACK_TASK` | `continue work` | 복원된 context-pack check에 쓰는 task text. |
| `RESTORE_APP_PORT` | `18787` | 격리 app 서비스에 기대하는 host port. |

## 흔한 설정

### 로컬 솔로 dev (loopback, 인증 불필요)

```bash
EMBEDDING_PROVIDER=local
MEMORY_API_TOKENS=
HOST=127.0.0.1
```

Loopback 바인드 + 빈 토큰 = fail-closed gate가 dev에서는 허용. 임베딩
오프라인. 외부 API key 불필요.

### OpenAI 사용 단일 사용자

```bash
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...
MEMORY_API_TOKENS=local-dev-token
HOST=127.0.0.1
PORT=8787
```

### 멀티-테넌트 production

```bash
HOST=0.0.0.0
PORT=8787
DATABASE_URL=postgres://memory:STRONG_PW@db.internal:5432/memory_os
QDRANT_URL=https://qdrant.internal:6333
QDRANT_API_KEY=STRONG_QDRANT_KEY
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-prod-...
MEMORY_API_TOKENS=team-a-token:team-a,team-b-token:team-b,ops-token:ops
RATE_LIMIT_PER_MINUTE=300
COMPACTION_SWEEP_ENABLED=true
NODE_ENV=production
```

reverse proxy 레이어에서 TLS와 같이 사용. [docs/deployment.md](deployment.md)
참고.
