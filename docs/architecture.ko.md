> [English](architecture.md) | **한국어**

# 아키텍처

이 문서는 Akasha의 구조와 데이터 흐름을 설명합니다. 도구별 API 디테일은
[api-reference.ko.md](api-reference.ko.md), env 변수 셋업은
[configuration.ko.md](configuration.ko.md) 참고.

## 레이어

```
┌────────────────────────────────────────────────────────────────┐
│ 클라이언트                                                       │
│   • Claude Code / Codex CLI  (MCP stdio)                        │
│   • curl / 앱 코드           (HTTP JSON)                         │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│ Transport                                                       │
│   src/mcp/server.ts          → MCP SDK stdio                    │
│   src/app/server.ts          → http.createServer                │
│   src/app/middleware/*       → bearer auth, rate limit, envelope│
│   src/app/routes/memory.ts   → POST /v1/* dispatch              │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│ 도구 레지스트리  (src/mcp/server.ts)                              │
│   add_memory / search_memory / build_context_pack /             │
│   reindex_memory / compact_memory / unarchive_memory /          │
│   list_audit_log                                                │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│ 도메인 오케스트레이터                                             │
│   src/compact/compact-memory.ts        plan builder             │
│   src/compact/apply-compaction.ts      destructive apply 경로    │
│   src/compact/unarchive-compaction.ts  복구 흐름                 │
│   src/compact/outbox-sweeper.ts        Qdrant cleanup retry     │
│   src/compact/sweeper-loop.ts          백그라운드 스케줄러        │
│   src/context-pack/build-context-pack.ts  pack assembler        │
│   src/search/retrieve-memory.ts        Qdrant + PG join         │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│ Repository                                                      │
│   src/store/memory-repository.ts          memory_records, sources│
│   src/store/canonical-indexing.ts         memory_chunks + Qdrant│
│   src/store/memory-archive-repository.ts  compaction_runs +     │
│                                           memory_archive        │
│   src/jobs/ingest-job-repository.ts       ingest_jobs           │
│   src/audit/audit-log-repository.ts       audit_log             │
└────────────────┬────────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│ 영속성                                                           │
│   Postgres 16  (compose 컨테이너 또는 외부)                       │
│   Qdrant       (compose 컨테이너 또는 외부)                       │
│   임베딩       (transformers 로컬 ONNX [기본] / openai /          │
│                 local 결정론적)                                   │
└─────────────────────────────────────────────────────────────────┘
```

## 데이터 흐름: 쓰기

```
클라이언트       도구                오케스트레이터       Repo                Store
──────         ────                ────────────       ─────              ──────
add_memory →  add_memory tool   →  writeCanonical →  memory-repo     →  Postgres (sources, memory_records)
                                   Memory            canonical-      →  Postgres (memory_chunks)
                                                     indexing
                                                     ingestJobs      →  Postgres (ingest_jobs: write-ahead pending)
                                                     embeddings.embed→  transformers / openai / local
                                                     vectorIndex     →  Qdrant 또는 pgvector (chunk vector)
                                                     ingestJobs      →  Postgres (ingest_jobs: mark completed)
```

Write-ahead outbox: chunk이 Postgres에 커밋된 후, `writeCanonicalMemory` 는
Qdrant 에 접근하기 전에 `markQdrantPending` 을 호출해 `qdrant_next_retry_at`
를 예약합니다. 이 시점과 `markQdrantCompleted` 사이에 프로세스가 크래시되면,
job row 는 `qdrant_status='pending'` + 재시도 타임스탬프를 갖고 남아 ingest
sweeper(`src/compact/ingest-sweeper.ts`, `INGEST_SWEEP_ENABLED` opt-in)가
이미 커밋된 chunk를 재인덱스할 수 있습니다. 인-프로세스 오류는 기존처럼
catch 블록(option-A 삭제: CASCADE가 레코드·chunk·job을 제거, 고아 없음)을
통해 처리되므로 `add_memory` 의 성공/실패 의미는 변경되지 않습니다.

쓰기 전: `src/store/secret-scrub.ts` 의 `assertNoSecrets(content)` —
API key / PEM / bearer / JWT 패턴 매칭 시 거부. `writeCanonicalMemory` 의
어떤 store touch보다도 앞에서 실행 → 매칭 시 사이드 이펙트 없이 short-circuit.

## 데이터 흐름: 읽기

```
search_memory →  search tool  →  retrieveMemory  →  embeddings.embed →  transformers / openai / local
                                 (Qdrant + PG)     qdrantClient.query→  Qdrant (코사인, scope-필터)
                                                   repository       →  Postgres (id로 hydrate)
                                                   .getMemoryRecordsByIds
                                                   rankResults      →  in-memory 랭킹
```

Org 필터는 Qdrant 쿼리 레이어 (payload 필터) 와 Postgres hydration 레이어
(defense-in-depth — Qdrant가 cross-org point id 반환해도 PG join에서 필터링)
양쪽 모두에 적용.

## 데이터 흐름: compact apply (P17)

```
compact_memory dryRun=false
  ↓
applyCompaction (src/compact/apply-compaction.ts)
  ├─ rate-limit 체크         (countRecentApplyRuns, 기본 1/h/org)
  ├─ createCompactionRun     (UUID idempotency_key, ON CONFLICT DO NOTHING)
  ├─ archive 후보별:
  │    ├─ applyCompactionRecord    (단일 CTE: DELETE memory_records
  │    │                            + INSERT memory_archive,
  │    │                            updated_at <= planGeneratedAt TOCTOU 가드)
  │    ├─ qdrantClient.deletePoints
  │    └─ markQdrantStatus('deleted')
  │       (Qdrant 실패 시 'pending' → sweeper가 처리)
  └─ completeCompactionRun
```

Cross-store 일관성: PG-first 는 PG commit 후 Qdrant delete 전 크래시 시
Qdrant에 orphan vector 남김. sweeper (`src/compact/sweeper-loop.ts`, opt-in)
가 reconcile. 역순은 살아있는 `memory_records` 가 삭제된 Qdrant point를
가리키는 사용자 가시 버그.

## 데이터 흐름: unarchive (P19.1)

```
unarchive_memory
  ↓
unarchiveCompaction (src/compact/unarchive-compaction.ts)
  ├─ findArchiveByIds         (org-scoped)
  ├─ archive 행별:
  │    ├─ already_unarchived / org mismatch / pre-P19.1 (no source_id) 시 skip
  │    ├─ restoreToCanonical  (원본 timestamp + source_id 보존하며
  │    │                       memory_records INSERT; 새 BIGSERIAL id)
  │    ├─ chunkText + insertChunks
  │    ├─ embeddings.embed (chunk별)
  │    ├─ qdrantClient.upsert (새 point id)
  │    ├─ chunkRepository.updatePointIds
  │    └─ markUnarchived (unarchived_at = NOW() 설정)
```

Archive 별 실패 격리: 한 archive 복원 실패가 batch 전체를 죽이지 않음;
응답에 archive별 `outcomes[]` 포함 → 호출자가 정확히 무엇이 성공/실패했는지
파악 가능.

## 스키마

```
sources                memory_records          memory_chunks
─────────              ──────────────          ─────────────
id PK                  id PK                   id PK
organization_id        organization_id         organization_id
scope_type             scope_type              memory_record_id FK
scope_id               scope_id                chunk_index
source_type            project_key             content
source_ref             kind                    qdrant_point_id (→ Qdrant)
captured_at            content                 embedding_provider
                       summary                 embedding_dimensions
                       durability              embedding_version
                       importance              created_at
                       source_id FK
                       created_at
                       updated_at

ingest_jobs            relationships           audit_log
───────────            ─────────────           ─────────
id PK                  id PK                   id PK
memory_record_id FK    from_memory_record_id   organization_id
status                 to_memory_record_id     actor / tool
attempts               relation_type           outcome / error_message
last_error             created_at              duration_ms / request_id
qdrant_status (staged — migration 007, applied by the #12 series)
qdrant_attempts (staged — migration 007)       metadata JSONB
qdrant_next_retry_at (staged — migration 007)  created_at
qdrant_last_error (staged — migration 007)

compaction_runs        memory_archive
───────────────        ──────────────
id PK                  id PK
organization_id        compaction_run_id FK
actor                  organization_id
scope_type/id          source_record_id (이전 memory_records.id)
dry_run                source_id (sources에 대한 loose ref)
status                 archive_reason ('duplicate'|'decay')
archived/duplicate/    qdrant_point_ids TEXT[]
  decay/qdrant_failed  qdrant_status ('pending'|'deleted'|'failed')
                       qdrant_attempt_count
plan_generated_at      qdrant_cleaned_at
started_at             original_created_at / original_updated_at
completed_at           archived_at / unarchived_at
idempotency_key UUID   UNIQUE (compaction_run_id, source_record_id)
```

마이그레이션은 `src/db/migrations/` 에 위치. 런너는 부트스트랩 시 001-006 과
008 을 적용 (모두 idempotent, `CREATE … IF NOT EXISTS`).
`007_ingest_jobs_qdrant_outbox.sql` 은 `ingest_jobs` 에 네 개의 `qdrant_*`
outbox 컬럼을 추가하는 **staged** 파일이며, `src/db/migrate.ts` 의
`MIGRATION_FILES` 에 아직 등록되지 않았습니다. 진행 중인 #12 outbox-sweeper
시리즈에서 연결될 예정입니다.

## 멀티-테넌트

레코드 보유 테이블 모두 `organization_id TEXT NOT NULL` 을 가짐. 모든 read /
write 경로의 SQL 쿼리에 `WHERE organization_id = $org` 포함. `MEMORY_API_TOKENS`
의 bearer 토큰은 `:org` 문법으로 org 바인딩 가능 — 존재 시 토큰의 org가 body /
헤더 값을 덮어씀; mismatch 는 403.

**모든 읽기 경로에 org 강제 적용.** `retrieveMemory` (검색), `listMemory`
(`compact_memory` 에서 사용), `getMemoryRecordsByIds` (벡터 하이드레이션
단계) 는 모두 `organizationId` 가 undefined 이고 운영자가
`LEGACY_ANONYMOUS_SEARCH=true` 를 설정하지 않은 경우 에러를 던집니다. 즉,
언바운드 토큰 (`:org` 없음, `x-organization-id` 헤더 없음, body org 없음) 은
테넌트 경계를 넘어 자동으로 데이터를 읽을 수 없으며, 세 가지 해결 방법을
안내하는 명확한 운영 에러를 받습니다. 공유 헬퍼 `assertOrganizationId`
(`src/store/assert-organization-id.ts`) 가 세 진입점 모두에서 일관되게 이를
강제합니다.

apply 시 `memory_archive` 에 쓰이는 `organization_id` 는 caller 토큰이 아닌
canonical 레코드 자체에서 (DELETE의 RETURNING) 읽음 — 토큰의 바인딩 org와
레코드의 org가 다른 (드물지만 가능한) 케이스에 대한 defense-in-depth.

## Audit trail

모든 도구 호출은 `src/mcp/server.ts` 의 `instrument()` wrapper를 통해
`audit_log` 행 생성. 행에는 org, actor, 도구 이름, project key, outcome
(`ok`/`error`), 에러 메시지, duration ms, request id 포함; destructive
operation 의 경우 `metadata` JSONB 에 구조화된 디테일 (archive id, run id 등).

`list_audit_log` 읽기는 org-scoped — 다른 org의 entry는 누출되지 않음.
쓰기는 best-effort (실패해도 사용자 요청은 차단 안 함) 이지만 error 레벨
로그로 ops가 audit-stream 이슈 감지 가능.

## 벡터 백엔드 플러거빌리티

`src/mcp/canonical-services.ts` 가 `VECTOR_BACKEND` 를 통해 벡터 백엔드
선택 (기본값: `qdrant`):

- `qdrant` **(기본)** → `src/vector/qdrant-index.ts`,
  `@qdrant/js-client-rest` 래핑. `QDRANT_URL` + `QDRANT_API_KEY` 필요.
- `pgvector` → `src/vector/pgvector-index.ts`, `vector` 확장을 사용해
  Postgres 에 임베딩 저장. 기존 PG pool 재사용 — **두 번째 서비스 불필요**.
  Qdrant 자격증명 불필요. `ensureCollection(dims)` 가 부트스트랩 시
  확장, 테이블, HNSW 인덱스 생성 — 재시작 시 no-op (`CREATE … IF NOT EXISTS`).

두 어댑터 모두 `VectorIndex` 인터페이스 (`src/vector/vector-index.ts`) 구현:
`ensureCollection`, `upsert`, `query`, `delete`. 필터 변환 (`VectorFilter` →
Qdrant `must` / SQL `WHERE`) 은 각 어댑터 내부에 캡슐화 — Qdrant 또는
pgvector SQL 방언이 오케스트레이션 코드에 누출되지 않음.

### Postgres 단독 배포

`VECTOR_BACKEND=pgvector` 설정으로 Qdrant 서비스 없이 단일 Postgres 인스턴스
만으로 Akasha 실행 가능. 로컬 compose 오버라이드 `compose.pgvector.yaml`
이 `pgvector/pgvector:pg16` 로 전환:

```bash
docker compose -f compose.yaml -f compose.pgvector.yaml up -d
```

**백엔드 전환 시 reindex 필수** (`reindex_memory` 도구) — 백엔드 간 벡터
차원과 컨텐츠 토폴로지가 다름.

## Embedding pluggability

`src/embedding/embedding-factory.ts` 가 `EMBEDDING_PROVIDER` 를 통해
provider 선택 (기본값: `transformers`):

- `transformers` **(기본)** → `src/embedding/transformers-embedding.ts`,
  `@huggingface/transformers` (optional dep) 기반 무료 로컬 ONNX 추론.
  기본 모델 `Xenova/all-MiniLM-L6-v2`, 384-dim. 첫 호출 시 HF 캐시에
  ~22 MB 다운로드; 이후 완전 오프라인 동작. API 키 불필요.
- `openai` → `src/embedding/openai-embeddings.ts`,
  `text-embedding-3-small`, 1536-dim. `OPENAI_API_KEY` 필요.
- `local` → `src/embedding/local-embeddings.ts`, 결정론적 SHA-256 해싱
  → 384-dim 벡터. 외부 호출 없음; 시맨틱 검색이 불필요한 CI /
  air-gapped / 오프라인 환경용.

provider는 부트스트랩 시 선택되어 프로세스 lifetime 동안 `services.embeddings`
에 보관. provider 변경 시 reindex (`reindex_memory` 도구) 필요 —
dimension 과 컨텐츠 의미 다름.
