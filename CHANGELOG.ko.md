> [English](CHANGELOG.md) | **한국어**

# 변경 내역

context-forge의 모든 주요 변경 사항이 여기 기록됩니다.

포맷은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 기반이며,
1.0 릴리즈 이후로는 [Semantic Versioning](https://semver.org/lang/ko/spec/v2.0.0.html)
을 따릅니다. 1.0 이전 minor 버전에는 breaking change가 포함될 수 있으며,
CHANGELOG에서 명시적으로 표기합니다.

## [Unreleased]

릴리스 후 audit 사이클. v1.0.0이 OSS 사용자 0명 상태로 출시되어 — 멀티
테넌시 boundary 의 default-strict 강화 + secret-scrubber surface 보강을
이 시점에 묶어 처리. 다음 release에서 함께 배포 예정. SemVer 엄격 적용 시
`2.0.0` (org guard default 동작 변경 = breaking)이 옳지만, 실제 영향 범위가
작아 prominent breaking 경고와 함께 `1.1.0`도 합리적 선택.

### Security

- **Secret scrubber가 이제 `title`, `summary` 까지 검사** —
  `writeCanonicalMemory` 가 이전엔 `content` 만 credential 패턴 (AWS key,
  GitHub PAT, OpenAI key, PEM, JWT 등)을 스캔. 호출자가 `title` 또는
  `summary` 에 secret 을 실어 가드를 우회 가능. README 와 `docs/security.md`
  헤드라인의 *"blocks API keys / PEM / bearer / JWT before any record hits
  Postgres or Qdrant"* 약속과 비대칭. 이제 사용자 입력 3개 필드 모두 스캔
  + 발견된 카테고리 union 으로 단일 `SecretDetectedError` 발생. (PR #5,
  [`f033903`](https://github.com/YouSangSon/context-forge/commit/f033903))
- **`retrieveMemory` 가 default 로 org-blind 읽기 거부** — `organizationId`
  미지정 (token-org 바인딩 없음 + `x-organization-id` 헤더 없음 + body
  필드 없음) 요청은 이전엔 org-blind Qdrant 쿼리 + org-blind PG hydration
  으로 fall through. legacy single-tenant 동작은 문서화되어 있었지만
  실수로 진입하기 쉬웠고, 운영자가 두 번째 테넌트 추가 후 cross-org leak
  silent 발생. default 가 이제 strict — 명확한 에러로 거부, 운영 가이드
  포함. `LEGACY_ANONYMOUS_SEARCH=true` 로 historical 동작 opt-in 가능.
  implicit fallback 에 의존하던 배포는 **BREAKING**, `.env` 한 줄 마이그레이션.
  (PR #6, [`809eb87`](https://github.com/YouSangSon/context-forge/commit/809eb87))

### Fixed

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
  (PR #7, [`5764323`](https://github.com/YouSangSon/context-forge/commit/5764323))

### Performance

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
  [`7b5afac`](https://github.com/YouSangSon/context-forge/commit/7b5afac))

### Documentation

- **마이그레이션 가이드 양방향 reframe** —
  `docs/migrations/openai-to-transformers.{md,ko.md}` 제목을 *"Migration:
  OpenAI → Transformers default (v1.0.x → next)"* → *"Switching between
  OpenAI and Transformers embedding providers"*. transformers + default-flip
  작업이 v1.0.0 에 통합된 후 v1.0.x 프레이밍은 anachronistic. 이제 양방향
  전환 reference, 1회성 마이그레이션 아님.
  ([`a3b456a`](https://github.com/YouSangSon/context-forge/commit/a3b456a))
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

초기 공개 릴리스. context-forge가 내부 hardening 작업에서 publishable
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
- **Health probe** — `/healthz` (liveness, 인증 없음) 와 `/readyz`
  (PG + Qdrant + OpenAI 도달 가능성, 실패 시 503으로 오케스트레이터 drain).
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
