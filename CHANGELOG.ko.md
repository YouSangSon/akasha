> [English](CHANGELOG.md) | **한국어**

# 변경 내역

Akasha의 모든 주요 변경 사항이 여기 기록됩니다.

포맷은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 기반이며,
1.0 릴리즈 이후로는 [Semantic Versioning](https://semver.org/lang/ko/spec/v2.0.0.html)
을 따릅니다. 1.0 이전 minor 버전에는 breaking change가 포함될 수 있으며,
CHANGELOG에서 명시적으로 표기합니다.

## [Unreleased]

- First-class goal run: MCP와 JSON HTTP가 `/v1/goal-run/*` 아래
  `start_goal_run`, `record_iteration`, `get_goal_run`, `list_goal_runs`,
  `complete_goal_run`, `abandon_goal_run`, `build_goal_context`,
  `check_repeat_attempt` 를 노출합니다. Active-run memory는 compaction에서
  pin 될 수 있고, close resolution/reason은 `goal_runs.close_note` 로 저장되며
  현재 마이그레이션 범위는 `001-015` 입니다.
- Background sweeper observability: `/metrics` 가 이제 compaction/ingest
  sweeper tick counter, tick duration summary, row outcome counter를
  low-cardinality series로 노출하고, pending/due/failed ingest/compaction queue
  row에 대한 live Postgres-backed backlog gauge도 제공해 실패하거나 멈춘 cleanup
  loop를 alert할 수 있습니다.
- 전용 sweeper worker: `npm run start:worker` / `npm run dev:worker` 로
  compaction/ingest sweeper를 request-serving replica 밖에서 실행할 수 있으며,
  기존 HTTP 서버 내부 opt-in 경로도 유지됩니다.
- PR #19: `/mcp` 의 MCP Streamable HTTP, MCP resources, MCP prompts, typed
  result를 쓰는 클라이언트용 structured MCP tool output 추가.
- 문서: 공개 문서가 descriptor 공유 검증, non-root 컨테이너 런타임 기본값,
  production 자격증명 교체, atomic archive-cleanup claim semantics를 반영하도록
  정렬되었고, 현재 동작과 맞지 않던 pgvector reindex follow-up 주석을 제거함.

릴리스 후 audit 사이클. v1.0.0이 OSS 사용자 0명 상태로 출시되어 — 멀티
테넌시 boundary 의 default-strict 강화 + secret-scrubber surface 보강을
이 시점에 묶어 처리. 다음 release에서 함께 배포 예정. SemVer 엄격 적용 시
`2.0.0` (org guard default 동작 변경 = breaking)이 옳지만, 실제 영향 범위가
작아 prominent breaking 경고와 함께 `1.1.0`도 합리적 선택.

### Added

- **Context-pack selection rationale** — `build_context_pack` 가 이제 포함된
  각 memory가 어떤 이유로 section에 배치되었는지 설명하는
  `selectionRationale` 를 반환합니다. `selectedMemoryIds` 는 context-pack
  section cap 이후 실제 포함된 memory만 나타내며, service-backed context-pack
  run persistence도 동일한 selected-only ID 목록을 사용합니다.
- **Entity graph inspection surface** — MCP와 JSON HTTP가 graph-backed lexical
  rescue/boost 뒤의 scoped entity mention 및 relationship을 조회하는
  `inspect_memory_graph` (`POST /v1/memory/graph`) 를 노출합니다.
- **Lifecycle capture via content files** — `remember` 가 이제 `--content-file`
  을 받고, 생성된 `session-end.sh` hook은 multiline session summary를 argv에
  직접 올리지 않고 임시 파일로 전달합니다.
- **Memory governance CRUD 및 admin shell** — MCP와 JSON HTTP가 운영자
  review/edit/tag/archive workflow용 `list_memory`, `update_memory`,
  `delete_memory`, `tag_memory` 를 노출합니다. `delete_memory` 는 복구 가능한
  `memory_archive` 경로로 archive하고 vector cleanup은 retry 가능하게 유지합니다.
  정적 `/admin/memory` 페이지는 compact한 브라우저 셸을 제공하되, 모든 데이터
  호출은 기존 인증된 `/v1/*` route 뒤에 둡니다. 현재 마이그레이션 범위는
  org-scoped tag filter용 `memory_tags` 를 포함해 `001-015` 입니다.
- **pgvector 백엔드 — Postgres 단독 배포 옵션** — `VectorIndex` 포트
  (`src/vector/vector-index.ts`) 가 벡터 백엔드를 추상화하여 시작 시
  `VECTOR_BACKEND` 로 Qdrant 또는 pgvector 를 선택할 수 있게 됨. 새
  `pgvector` 어댑터 (`src/vector/pgvector-index.ts`) 는 Postgres `vector`
  확장 (HNSW 인덱스, cosine ops) 을 사용해 `memory_vectors` 테이블에 임베딩을
  저장하며, org/scope 필터 동등성을 유지하는 동일한 `upsert`/`query`/`delete`
  인터페이스를 제공. `VECTOR_BACKEND=pgvector` 설정 시 Qdrant 서비스 의존성이
  완전히 제거됨. `compose.pgvector.yaml` 오버라이드
  (`docker compose -f compose.yaml -f compose.pgvector.yaml up -d`) 로
  로컬 개발 시 `pgvector/pgvector:pg16` 으로 전환 가능. 백엔드 전환 시
  `reindex_memory` 필수.
- **Persistent entity 및 temporal graph foundation** — `add_memory` 가 이제
  code symbol, path, URL, date, named concept 같은 deterministic mention을
  `entities`, `memory_entity_mentions` 에 추출하고, 같은 row의 co-mention 및
  date context를 `entity_relationships` 에 기록합니다. `search_memory` 는 이
  graph를 Postgres FTS, substring fallback, vector retrieval 옆의 exact
  rescue/boost 경로로 사용합니다. 현재 마이그레이션 범위는 `001-015` 입니다.
- **MCP roots, elicitation, sampling helper** — MCP transport가 이제 클라이언트가
  광고한 `roots/list` 용 `list_workspace_roots` 와, form elicitation 후 수락된
  memory를 일반 `add_memory` 경로로 저장하는 `add_memory_interactive` 를
  등록합니다. `classify_memory_candidate` 는 client sampling으로 저장 없이 memory
  kind와 짧은 summary를 제안합니다. 미지원 클라이언트에는 실패 대신 명시적인
  structured result를 반환합니다. TypeScript MCP SDK 최소 버전은 이
  server-to-client API들을 검증한 locked version 기준 `^1.28.0` 으로 올렸습니다.
- **암호화된 백업 artifact** — `backup:create` 가 이제
  `BACKUP_ENCRYPTION_KEY_FILE` 을 인식하고 off-host copy 전에 Postgres dump와
  Qdrant snapshot을 AES-256-GCM으로 암호화합니다. Manifest는 `.enc` artifact와
  ciphertext checksum을 가리키도록 갱신되고, plaintext artifact는 기본 제거되며,
  `backup:decrypt` 로 operator restore command 전에 artifact 하나를 복호화할 수
  있습니다. KMS는 외부 연동입니다. scheduler/secret manager가 32-byte data key를
  key file로 제공해야 합니다.
- **Context-pack prompt-injection hardening** — 생성된 context pack이 이제
  검색된 memory는 instruction이 아니라 untrusted note라는 trust-boundary notice로
  시작합니다. "ignore previous instructions" 같은 prompt-injection 유사 문구가
  포함된 excerpt에는 warning label을 붙입니다.
- **Lifecycle init 자동화** — CLI에 `init` 을 추가해 `.akasha/` MCP client
  snippet, `.env` 를 source하는 MCP stdio wrapper, session-start/session-end
  hook script를 생성합니다. 새 `remember` 명령은 HTTP 서버 없이도 hook이 기존
  `add_memory` 경로로 짧은 durable summary를 저장하게 합니다. `install.sh` 는
  build와 migration 후 init을 실행합니다.

### Security

- **HTTP transport용 OAuth/OIDC JWT 검증** — `/mcp`, `/v1/*` 는 이제 정적
  `MEMORY_API_TOKENS` 외에도 OAuth/OIDC JWT access token을 허용합니다.
  토큰은 설정된 authorization server, JWKS, `MCP_OAUTH_RESOURCE_URL`
  audience, expiry / not-before, algorithm allowlist, tool별 scope
  (`akasha:read`, `akasha:write`, `akasha:admin`, 호환용 `akasha:memory`) 로
  검증됩니다. JWT org claim은 기본 `organization_id` 를 사용하며, 존재 시
  token-org 바인딩처럼 동작합니다. OAuth scope가 부족하면 403과 Bearer
  `insufficient_scope` challenge를 반환합니다.
- **Secret scrubber가 이제 `title`, `summary` 까지 검사** —
  `writeCanonicalMemory` 가 이전엔 `content` 만 credential 패턴 (AWS key,
  GitHub PAT, OpenAI key, PEM, JWT 등)을 스캔. 호출자가 `title` 또는
  `summary` 에 secret 을 실어 가드를 우회 가능. README 와 `docs/security.md`
  헤드라인의 *"blocks API keys / PEM / bearer / JWT before any record hits
  Postgres or Qdrant"* 약속과 비대칭. 이제 사용자 입력 3개 필드 모두 스캔
  + 발견된 카테고리 union 으로 단일 `SecretDetectedError` 발생. (PR #5,
  [`f033903`](https://github.com/YouSangSon/akasha/commit/f033903))
- **`retrieveMemory` 가 default 로 org-blind 읽기 거부** — `organizationId`
  미지정 (token-org 바인딩 없음 + `x-organization-id` 헤더 없음 + body
  필드 없음) 요청은 이전엔 org-blind Qdrant 쿼리 + org-blind PG hydration
  으로 fall through. legacy single-tenant 동작은 문서화되어 있었지만
  실수로 진입하기 쉬웠고, 운영자가 두 번째 테넌트 추가 후 cross-org leak
  silent 발생. default 가 이제 strict — 명확한 에러로 거부, 운영 가이드
  포함. `LEGACY_ANONYMOUS_SEARCH=true` 로 historical 동작 opt-in 가능.
  implicit fallback 에 의존하던 배포는 **BREAKING**, `.env` 한 줄 마이그레이션.
  (PR #6, [`809eb87`](https://github.com/YouSangSon/akasha/commit/809eb87))

### Fixed

- **환경 템플릿의 Docker Compose 로딩 설명을 실제 동작에 맞춤** —
  `.env.example` 이 이제 `env_file` 이 아니라 Compose 변수 치환을 언급해
  `compose.yaml` 및 설정 가이드와 일치합니다.
- **Docker, CI, local install이 npm unknown-config flag 없이 ONNX Runtime
  CUDA provider 다운로드를 건너뜀** — Dockerfile의 `npm ci` 단계, GitHub
  Actions, `install.sh` 가 이제 `ONNXRUNTIME_NODE_INSTALL_CUDA=skip` 을 설정해,
  onnxruntime-node가 지원하는 환경변수 경로로 GPU binary 다운로드 변동성을
  피합니다.
- **백엔드-aware readiness 및 tenant attribution 수정** — `/readyz` 는 이제
  `VECTOR_BACKEND=qdrant` 일 때만 Qdrant를 프로브하므로
  `VECTOR_BACKEND=pgvector` 배포가 Qdrant 부재 때문에 readiness 실패하지 않음.
  Qdrant bootstrap도 비파괴 `ensureCollection(dimensions)` 경로를 호출.
  `ingest_jobs`, `context_pack_runs` 는 DB 기본값에 의존하지 않고
  `organization_id` 를 명시적으로 기록.
- **대량 scope용 paged reindex** — `reindex_memory` 는 이제 전체
  project/user scope를 메모리에 올리지 않고 chunk 읽기, 임베딩, upsert, point id
  갱신을 bounded page 단위로 처리. stale-vector delete는 모든 upsert page보다
  먼저 완료되어 shrink-reindex semantics를 보존.
- **`writeCanonicalMemory` 의 downstream 실패 시 PG state 롤백** —
  embedding 5xx, OpenAI rate-limit, Qdrant upsert 에러 발생 시 이전엔
  Qdrant point 가 없는 orphan `memory_records` + `memory_chunks` 행을
  남겼음. search 결과에 안 잡히고, compaction 도 정리 안 함 (compaction
  은 중복/decay 만 대상), `reindex_memory` 는 운영자가 인지 시에만 복구.
  catch 블록이 이제 새 `deleteMemoryRecord` 리포지토리 메서드를 호출 —
  schema 레벨 `ON DELETE CASCADE` 가 같은 Postgres 트랜잭션에서
  `memory_chunks`, `ingest_jobs`, `relationships` 를 atomic 정리.
  cleanup 자체가 실패해도 원본 에러를 caller 에게 surface 하는 best-effort
  방식. audit 권장 outbox sweeper (option B, schema migration + retry
  loop)는 follow-up 으로 deferred — 이 PR 은 schema 무변경 option A.
  (PR #7, [`5764323`](https://github.com/YouSangSon/akasha/commit/5764323))

### Added

- **Ingest outbox sweeper — crash-resilient Qdrant 인덱싱 (#12, parts 3-5)** —
  `writeCanonicalMemory` 가 이제 chunk 가 Postgres 에 커밋된 직후, Qdrant 에
  접근하기 전에 `markQdrantPending` 을 호출해 write-ahead `qdrant_status='pending'`
  row를 기록합니다. 성공 시 `markQdrantCompleted` 로 클리어. 인-프로세스 오류는
  기존 option-A catch 블록(CASCADE 삭제, 고아 없음)을 거치므로 `add_memory` 의
  성공/실패 의미 변경 없음. 오직 write-ahead 와 완료 사이 프로세스 크래시만이
  pending row 를 남기며, 백그라운드 ingest sweeper(`src/compact/ingest-sweeper.ts`)가
  이를 감지해 이미 커밋된 chunk 를 재임베딩 + Qdrant upsert 합니다. sweeper 는
  compaction sweeper 와 동일한 지수 백오프(1 s 기준, 최대 5 min, 5회 포기) 사용.
  `INGEST_SWEEP_ENABLED=true`(기본 false)로 지속 실행 단일 replica 에서 opt-in.
  tick 주기는 `INGEST_SWEEP_INTERVAL_MS`(기본 30 000 ms)로 설정.

### Performance

- **Postgres full-text lexical retrieval** — `search_memory` 의 lexical 후보는
  이제 generated `memory_records.search_vector` 컬럼, GIN 인덱스,
  `ts_rank_cd` scoring을 사용한 뒤 vector 후보와 merge됩니다. 기존 substring
  matching은 정확한 file path, env var, 짧은 code identifier를 위한 fallback으로
  유지됩니다.
- **`embedBatch` API 로 N HTTP RTTs → 1로 압축** —
  `writeCanonicalMemory` + `reindexCanonicalMemory` 가 `Promise.all(map(embed))`
  로 chunk 별 개별 embed. OpenAI 의 경우 ingest/reindex 마다 N round-trips —
  100 chunks × 200ms RTT = 순수 round-trip 만 ~20s, 거기에 rate-limit
  pressure N배, per-token cost 동일 (= 순수 낭비). 새 `embedBatch(inputs:
  string[])` 메서드가 `EmbeddingProvider` 인터페이스에 추가됨 — OpenAI 는
  네이티브 (단일 `embeddings.create` 호출에 array input), Transformers /
  Local 은 sequential loop (per-call overhead 0). 두 호출부 모두 batch
  후 `embeddings.length === chunks.length` 검증 — provider misbehavior 시
  silent misalignment 방지. (PR #8,
  [`7b5afac`](https://github.com/YouSangSon/akasha/commit/7b5afac))

### Security (audit cycle 2)

- **`reindex_memory` 가 이제 org 범위로 strict 동작** — `search_memory` 의 기존 가드와 동일하게
  `organizationId` 필수 (없으면 throw). CLI `reindex` 명령에 `--organization-id` 플래그 추가
  (기본값 `"default"`). 이전엔 reindex 경로가 org-blind 로 모든 테넌트의 chunk 를 건드렸음.
- **`deleteMemoryRecord` 에 org 가드 추가** — PR #7 에서 도입된 cleanup 헬퍼가 이전엔
  `memoryRecordId` 가 호출 org 소속인지 검증 없이 수락. cross-tenant 삭제 경로를 닫는 org 가드
  추가 (SEC-5).
- **HTTP 에러 처리 강화** — generic 500 응답이 이제 정적 `"internal server error"` body 반환
  (내부 정보 노출 없음). `compact_memory` rate-limit 이 이제 500 대신 `Retry-After` 헤더와 함께
  HTTP **429** 반환. 타입 레벨 exhaustiveness check 를 억제하던 `as never` cast 제거.
- **`RATE_LIMIT_PER_MINUTE` 기본값을 `compose.yaml` 에 추가** — Compose 배포에서 이제 기본으로
  rate limiting 활성화 (값: 60 req/min). 이전엔 Compose 파일에 해당 env var 가 없어 운영자가
  수동 설정하지 않으면 rate cap 없이 운영됨.
- **Secret scrubber 확장** — 기존 AWS, GitHub PAT, OpenAI, Anthropic, PEM, Bearer, JWT 패턴에
  더해 GCP API key, Stripe secret/publishable key, Slack 토큰 (`xoxb-`, `xoxp-`, `xoxa-`),
  DB 연결 문자열 (`postgres://`, `mysql://`, `mongodb+srv://`) 도 차단.
- **보안 단위 테스트 추가** — rate-limit 강제, bearer-auth 경로, `resolveOrganizationId` 로직을
  커버하는 새 테스트 스위트 추가. AND/OR SQL 우선순위 버그를 탐지하도록 SEC-1 isolation
  assertion 강화.
- **나머지 읽기 경로에 strict org 가드 확장** — PR #6 에서 `retrieveMemory` (search) 를
  strict 로 전환했으나, `listMemory` 와 `getMemoryRecordsByIds` 는 `organization_id` 가 정의된
  경우에만 필터링하는 상태로 남아 있었음. 결과적으로 언바운드 토큰이 `compact_memory`
  (dry-run) 실행 시 테넌트 구분 없이 메모리를 읽을 수 있었음. 두 읽기 메서드 모두 공유
  `assertOrganizationId` 헬퍼를 통해 동일한 strict 가드를 적용하며, 핸들러가
  `LEGACY_ANONYMOUS_SEARCH` 에서 소싱하는 `allowLegacyAnonymous` 플래그를 받음.
  org-blind 읽기에 의존하던 언바운드 토큰 배포는 **BREAKING** — PR #6 와 동일한 한 줄
  `LEGACY_ANONYMOUS_SEARCH=true` 마이그레이션 적용.

### Fixed (audit cycle 2)

- **MCP stdio transport 에 당시 기준 7개 도구 모두 등록** — `reindex_memory` 와 `unarchive_memory` 가
  stdio transport 에서 누락되어 MCP 클라이언트 (Claude Code, Codex CLI) 가 HTTP 의 당시 기준 7개 중
  5개만 사용 가능했음. 이 변경 당시 HTTP 및 CLI 와 동등해짐.
- **Silent failure 제거** — 파싱 에러, DB 에러 메시지의 스택 trace 제거, `audit_log.error_message`
  크기 제한 추가. 이전엔 조용히 실패하거나 내부 스택 정보를 노출했음.

### Added (audit cycle 2)

- **`/readyz` 에 실제 의존성 프로브 연결** — `startOperatorServer` 가 `DependencyProbes`
  세트를 자동으로 생성해 전달: Postgres (`SELECT 1`) 와 Qdrant (`GET /healthz`) 는 항상
  활성; OpenAI 프로브 (`GET /v1/models`) 는 `EMBEDDING_PROVIDER=openai` 일 때만 포함
  되어, API 키 없는 `transformers`/`local` 배포에 영향 없음. 의존성 하나라도 연결 불가
  시 503 반환 — 오케스트레이터를 위한 진정한 readiness gate로 동작. Postgres 프로브용
  전용 단일-커넥션 풀을 생성하며 서버 종료 시 정리. 조건부 선택 로직은 테스트 가능성을
  위해 내보내진 `selectDependencyProbes(config, pool)` 헬퍼에 위치.

### Performance (audit cycle 2)

- **Migration 007: `ingest_jobs` outbox 컬럼** (기반 작업, 진행 중) — option-B outbox sweeper를
  위해 `ingest_jobs` 에 `status`, `retry_count`, `last_error`, `process_after`, `processed_at`
  컬럼 추가. 스키마 파일은 `main` 에 존재 (#12, 5개 중 1번째); sweeper 등록과 retry 루프는
  #12 브랜치에서 진행 중.
- **Migration 008: `memory_chunks` FK 인덱스** — `008_chunks_fk_index.sql` 이
  `memory_chunks(memory_record_id)` 에 `idx_memory_chunks_record` 인덱스 추가, FK join 경로의
  sequential scan 제거.
- **`listMemory` 에 상한 추가** — browse 쿼리에 `LIMIT` 강제 (기본값 1000, 최대 5000). 이전엔
  무제한 쿼리로 대형 테넌트의 전체 테이블을 반환할 수 있었음.
- **N+1 DB 쓰기 배치 처리** — chunk insert 와 upsert 가 이제 항목별이 아닌 단일 round-trip 으로
  일괄 처리. 기존 `embedBatch` 변경 (PR #8) 을 보완.

### Documentation (audit cycle 2)

- **문서 정확성 교정** — `docs/architecture.md`, `docs/configuration.md`, `docs/api-reference.md`,
  `CONTRIBUTING.md`, `README.md` 의 pre-existing 오류 수정: `OPENAI_API_KEY` 를 선택 사항으로
  표시 (`EMBEDDING_PROVIDER=openai` 시만 필요); embedding 기본값을 `transformers` 로 수정;
  마이그레이션 문서를 당시 기준 outbox 범위로 갱신; 스키마 다이어그램에 `ingest_jobs` outbox
  컬럼 추가; 실제 `check-dependencies.ts` 동작에 맞게 `/readyz` probe 목록 수정; MCP 도구
  목록을 당시 기준 7개로 업데이트.
- **`AGENTS.md` 끊어진 참조 제거** — 존재하지 않는 `.vibe/context-index.md` 및
  `.pi/skills/vibe-workflow/SKILL.md` 참조를 `README.md`, `CONTRIBUTING.md`, `docs/` 를
  가리키는 정확한 contributor 안내로 교체.
- **`docs/README.md` 문서 인덱스 추가** — 영어 및 한국어 mirror 를 모두 포함하여 모든 문서에
  한 줄 설명과 링크를 제공하는 새 인덱스.
- **`docs/self-hosted-operations.ko.md` 추가** — `self-hosted-operations.md` 의 한국어 mirror
  (`.ko.md` 대응 파일이 없던 유일한 문서).

### Documentation
  `docs/migrations/openai-to-transformers.{md,ko.md}` 제목을 *"Migration:
  OpenAI → Transformers default (v1.0.x → next)"* → *"Switching between
  OpenAI and Transformers embedding providers"*. transformers + default-flip
  작업이 v1.0.0 에 통합된 후 v1.0.x 프레이밍은 anachronistic. 이제 양방향
  전환 reference, 1회성 마이그레이션 아님.
  ([`a3b456a`](https://github.com/YouSangSon/akasha/commit/a3b456a))
- **README landing 30초 가치 파악용으로 정리** — CI / License /
  MCP-compatible / Node ≥20 badges 추가, 강조형 1줄 tagline *"Persistent
  memory for AI coding agents — free, local, self-hosted"* + elevator
  paragraph 로 차별화 포인트 surface (API key 불필요, $0 cost, 데이터는
  본인 머신에서만). Quick-start fix: *"fill in OPENAI_API_KEY at minimum"*
  → *"defaults work — OPENAI_API_KEY only needed if you set
  EMBEDDING_PROVIDER=openai later"*. (동일 `a3b456a`)
- **`package.json` keywords 9 → 19 확장** — `mcp-server`, `agent-memory`,
  `embeddings`, `rag`, `onnx`, `transformers`, `huggingface`, `claude-code`,
  `self-hosted`, `local-first` 추가 — npm + GitHub topic 검색 가시성 향상.
  (동일 `a3b456a`)

## [1.0.0] — 2026-04-26

초기 공개 릴리스. Akasha가 내부 hardening 작업에서 publishable
오픈소스 프로젝트로 졸업.

### 추가됨 — OSS 패키징

- **`LICENSE`** (MIT), 종합 **`.env.example`**, 확장된 **`README.md`** (quick
  start + 아키텍처 개요), **`install.sh`** 1-command 설치, **`CONTRIBUTING.md`**,
  **`CHANGELOG.md`**, GitHub Actions CI (matrix Node 20+22 + Postgres service
  container).
- **문서 세트** — `docs/configuration.md`, `docs/api-reference.md`,
  `docs/deployment.md`, `docs/architecture.md`, `docs/security.md`,
  `docs/operations.md`, `docs/troubleshooting.md`.
- **GitHub 거버넌스** — issue 템플릿 (bug/feature + config), PR 템플릿,
  `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md` 정책.
- **이중 언어** — 모든 사용자 가시 문서를 영어 + 한국어 둘 다 제공 (cross-link
  토글 포함).

### 추가됨 — 핵심

- **MCP + HTTP 도구 surface** — `add_memory`, `search_memory`,
  `build_context_pack`, `reindex_memory`, `compact_memory`,
  `unarchive_memory`, `list_audit_log`. stdio (Claude/Codex CLI) 와
  JSON-over-HTTP에서 동일한 의미.
- **멀티-테넌트** — 모든 레코드에 `organization_id`. bearer 토큰을 org에
  바인딩 가능 (`token:org` 문법). cross-org 읽기/쓰기는 403 거부, SQL과
  Qdrant 필터에 org 필터 적용.
- **감사 로그** — 모든 도구 호출이 `audit_log` 행 생성 (org, actor, tool,
  outcome, duration, request id).
- **Compaction v2** — exact 컨텐츠 + 시맨틱 (코사인) 중복 탐지, 지수 decay
  스코어링, dry-run 계획 출력. apply 경로는 레코드를 `memory_archive` 에
  보관 (원본 timestamp + `qdrant_point_ids` 포함), canonical 행 hard delete,
  Qdrant 포인트 삭제. `updated_at <= planGeneratedAt` TOCTOU 가드. UUID
  `idempotency_key` 로 idempotent. org당 rate limit (기본 1회/시간).
- **백그라운드 sweeper** — `COMPACTION_SWEEP_ENABLED=true` 가 setInterval
  루프 활성화, pending Qdrant 정리를 exponential backoff로 재시도 (최대 5회 후
  `qdrant_status='failed'` 표시 — ops 검토용).
- **Unarchive 복구** — 아카이브된 레코드를 canonical 상태로 복원, 원본
  timestamp + 소스 링크 보존. 컨텐츠 재청크, 재임베드, Qdrant 재upsert.
  Idempotent (`unarchived_at` 컬럼). 아카이브 별 실패 격리.
- **Embedding provider 추상화** — `EMBEDDING_PROVIDER` 로 전환 가능한 3개
  provider: `transformers` (default, `@huggingface/transformers` 통한 무료
  로컬 ONNX, `Xenova/all-MiniLM-L6-v2`, 384-dim — Chroma·txtai 가 default 로
  채택한 동일 모델, MCP 메모리 생태계의 무료/로컬 default norm 에 정렬),
  `openai` (유료, `text-embedding-3-small`, 1536-dim — `OPENAI_API_KEY` 로
  opt-in), `local` (결정론적 SHA-256 stub, CI / plumbing 테스트 전용; 의미
  없음). provider 변경 시 새 vector dimension 으로 Qdrant collection 을
  재생성한 후 `reindex_memory` 실행 — 운영 절차는
  [docs/migrations/openai-to-transformers.ko.md](docs/migrations/openai-to-transformers.ko.md)
  참고.
- **인증 + rate limit** — `MEMORY_API_TOKENS` bearer 토큰 (다중 토큰 로테이션,
  선택적 org 바인딩); 토큰 버킷 rate limiter (`RATE_LIMIT_PER_MINUTE`);
  fail-closed 시작 가드는 토큰 없이 non-loopback 호스트 바인딩 거부.
- **Health probe** — `/healthz` (liveness, 인증 없음) 와 `/readyz` (기본
  서버에서는 무조건 200 반환; PG·Qdrant·OpenAI 의존성 probe 빌더는
  `src/health/check-dependencies.ts` 에 구현되어 있으나 `startOperatorServer`
  에 연결되어 있지 않음 — probe는 `createOperatorServer` 의 `dependencyProbes`
  옵션을 통해 opt-in 방식으로 사용).
- **백업 + 복원** — `npm run backup:create` 가 Postgres (pg_dump) + Qdrant
  (snapshot API) 를 `BACKUP_DIR` 로 스냅샷. `npm run restore:smoke` 가
  최신 백업을 격리된 compose 스택에서 검증.
- **테스트 스위트** — 219개 단위 테스트, 9개 skip (eval 하니스, `RUN_EVAL=1`
  로 gate). PG 의존 통합 테스트 3개는 로컬 5432에 Postgres가 없으면 skip.

### 보안

- HTTP body 검증이 `dryRun: "false"` (문자열), `dryRun: 0` 등을 거부 — destructive
  compaction 트리거에는 strict boolean만 허용.
- `getMemoryRecordsByIds` 가 `organizationId` 받음 — Qdrant 후처리 hydration
  단계의 defense-in-depth.
- `MEMORY_API_TOKENS` 비어 있고 + non-loopback 바인딩 = 시작 시 throw.
- `relationships` 와 `ingest_jobs` FK 컬럼의 cascade-delete 인덱스가 P17 apply
  시 populated DB의 sequential scan을 막음.
- Secret scrubber가 API key / PEM 블록 / bearer 토큰 / JWT 를
  `writeCanonicalMemory` 에서 차단 — 어떤 레코드도 Postgres 또는 Qdrant에
  들어가지 않음.
