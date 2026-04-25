> [English](CHANGELOG.md) | **한국어**

# 변경 내역

context-forge의 모든 주요 변경 사항이 여기 기록됩니다.

포맷은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 기반이며,
1.0 릴리즈 이후로는 [Semantic Versioning](https://semver.org/lang/ko/spec/v2.0.0.html)
을 따릅니다. 1.0 이전 minor 버전에는 breaking change가 포함될 수 있으며,
CHANGELOG에서 명시적으로 표기합니다.

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
- **Embedding provider 추상화** — `EMBEDDING_PROVIDER=openai` (기본,
  `text-embedding-3-small`) 또는 `local` (결정론적 SHA-256, 오프라인 / air-gapped).
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
