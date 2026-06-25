> [English](troubleshooting.md) | **한국어**

# 문제 해결

흔한 에러와 해결 방법. 여기서 못 찾으면
[.github/ISSUE_TEMPLATE/bug_report.yml](../.github/ISSUE_TEMPLATE/bug_report.yml)
의 bug-report 템플릿으로 issue 열어주세요.

## 셋업 에러

### `Docker daemon not running`

`docker info` 실패 시 `install.sh` 가 abort. Docker Desktop 시작
(macOS / Windows) 또는 `sudo systemctl start docker` (Linux) 후 `./install.sh`
재실행.

### `OPENAI_API_KEY in .env is still the placeholder` (`EMBEDDING_PROVIDER=openai` 일 때만)

`install.sh` 는 **`EMBEDDING_PROVIDER=openai`** 로 설정되어 있고 **동시에**
`OPENAI_API_KEY=sk-replace-me` (플레이스홀더) 인 경우에만 진행을 거부합니다.
기본값인 `transformers` 프로바이더는 API 키가 불필요하며 영향을 받지 않습니다.

`EMBEDDING_PROVIDER=openai` 를 선택한 경우 `.env` 를 편집해 실제 키를
붙여넣고 재실행하세요.

키가 필요 없는 프로바이더를 사용하려면:
```bash
EMBEDDING_PROVIDER=transformers   # 기본값 — 무료 로컬 ONNX (권장)
EMBEDDING_PROVIDER=local          # CI / 오프라인 결정론적 stub
```

### `Node.js ≥ 20 required`

Node 업그레이드. 대부분 Unix에서: `nvm install 20 && nvm use 20`.

### Migration 실패 with `ECONNREFUSED 127.0.0.1:5432`

Postgres가 아직 준비 안 됨. `install.sh` 가 마이그레이션 전
`docker compose up -d postgres qdrant` 실행하지만, 느린 하드웨어에서는
healthcheck 가 마이그레이션 시작 시점에 green 안 되어 있을 수 있음.
`./install.sh` 재실행 — `up -d` 는 idempotent, 두 번째에 health gate 통과.

반복 실패 시 `docker compose logs postgres` 로 컨테이너 레벨 에러 확인.

## 런타임 에러

### `MEMORY_API_TOKENS must be set when binding to a non-loopback host`

Fail-closed startup gate. 둘 중 하나:
- `HOST=127.0.0.1` 설정 (loopback 바인드, dev 시 인증 불필요), 또는
- `MEMORY_API_TOKENS=...` 설정 + 원하는 곳 바인드.

### `Missing required environment variable: OPENAI_API_KEY` (`EMBEDDING_PROVIDER=openai` 일 때만)

이 에러는 `EMBEDDING_PROVIDER=openai` 일 때만 발생합니다. 키를 설정하거나
키가 필요 없는 프로바이더로 전환하세요:
```bash
EMBEDDING_PROVIDER=transformers   # 기본값 — 무료 로컬 ONNX
# 또는
EMBEDDING_PROVIDER=local          # CI / 오프라인 stub
```

### `Unsupported EMBEDDING_PROVIDER: <value>`

유효한 값은 `transformers` (기본값), `openai`, `local` 입니다. 오타 확인.

### `SecretDetectedError: <category>` (HTTP 400)

`add_memory` 컨텐츠가 secret 패턴 매칭. 카테고리:
`aws-access-key`, `github-token`, `anthropic-key`, `openai-key`,
`private-key-block`, `bearer-token`, `jwt`, `gcp-api-key`, `stripe-key`,
`slack-token`, `db-connection-string`.

의도적 — secret이 vector 인덱스나 백업에 들어가면 안 됨. 컨텐츠에서 secret을
redact (`<REDACTED>` 로 대체) 후 재시도.

### `compaction is already running for this scope`

같은 `(org, scope)` 에 동시 apply 호출 두 개. 잠시 후 재시도.

### `compaction apply is rate-limited; retry in <N>s`

기본 1 apply / hour / org. 대기 또는 커스텀 rate limit deps로 호출 (커스텀
통합 한정).

### 모든 요청에 HTTP 401

`MEMORY_API_TOKENS` 의 어떤 entry와도 매칭 안 됨. 대소문자, 공백 (콤마 split
은 외부 공백 제거하지만 내부 공백은 유의), env 편집 후 서버 reload (컨테이너
재시작) 했는지 확인.

### HTTP 403 with `organizationId mismatch: token is bound to a different organization`

토큰에 `:org` 바인딩 (예: `dev-token:dev-team`) 인데 요청 body / 헤더가 다른
org 요청. 둘 중 하나:
- 그 org 에 바인딩된 토큰 사용, 또는
- 충돌하는 `organizationId` 를 body / 헤더에서 제거 (바인딩 org가 자동 주입).

### HTTP 429 with `rate limit exceeded`

이 토큰의 `RATE_LIMIT_PER_MINUTE` 소진. `Retry-After` 응답 헤더가 재시도
시점 알림. 다른 토큰 (load balance) 사용 또는 limit 상향.

### `/readyz` 가 503

의존성 도달 불가. 응답 body가 어느 것인지 표시:
```json
{ "success": false, "data": { "checks": [{"name":"qdrant","status":"fail",...}] } }
```

실패한 의존성 수정. 앱 프로세스 재시작 불필요 — 복구 후 다음 요청이 singleton
재구축.

## 데이터 이슈

### `add_memory` 후 검색 결과 없음

흔한 원인:
1. **잘못된 project key** — `searchMemory` 는 project-scoped; `add_memory`
   에서 사용한 정확한 key로 검색.
2. **Embedding provider 불일치** — reindex 없이 `EMBEDDING_PROVIDER` 변경 시
   기존 chunk가 호환 안 되는 vector. `reindex_memory` 실행.
3. **Vector indexing 중단** — `add_memory` 는 정상적으로 chunking, embedding,
   vector upsert 완료를 기다린 뒤 반환. 프로세스 크래시나 vector store 오류가
   write 중간에 발생했다면 ingest outbox 확인:
   `SELECT status, qdrant_status, qdrant_next_retry_at, qdrant_last_error FROM ingest_jobs WHERE memory_record_id = <id>`.
   `qdrant_status='pending'` row 재시도는 연속 실행 replica 하나에서
   `INGEST_SWEEP_ENABLED=true` 활성화.

### 중복 레코드가 계속 나타남

기본 dry-run 만 실행. plan 검토 후 `dryRun: false` 로 실행.
[operations.ko.md §Compaction](operations.ko.md#compaction) 참고.

### Unarchive 복원 후 검색에 안 보임

Unarchive는 새 `memory_records` 행 생성 (원본과 다른 id). 컨텐츠 / scope
검색은 작동; *원본* id 검색은 못 찾음. unarchive 응답의 `sourceRecordId` 로
old → new 매핑.

### `memory_archive` 가 무한 증가

기본 retention 없음. sweep 추가:

```sql
DELETE FROM memory_archive
WHERE archived_at < NOW() - INTERVAL '180 days'
  AND qdrant_status = 'deleted';
```

(`qdrant_status != 'deleted'` 인 행은 삭제 금지 — sweeper가 아직 정리 안 한
orphan vector의 source-of-truth 보유.)

## 빌드 / 테스트 이슈

### Pull 후 `npm run typecheck` 실패

dep bump 후 stale `node_modules`. `rm -rf node_modules && npm install`.

### Tests fail with `Hook timed out in 10000ms`

PG 의존 테스트 3개가 5432의 Postgres에 도달 시도하다 timeout. PG 없으면
skip 되지만 hook timeout 자체가 보임. Postgres 띄우거나
(`docker compose up -d postgres`) 그 3개 파일을 expected-skip 으로 수용.

### `vitest run` hang

대개: 절대 resolve 안 되는 promise에 `await` (mock이 resolve 설정 안 됨).
`--reporter=verbose` 로 실행해서 어느 테스트가 hang 인지 확인.

## 버그 리포트

여기 없는 이슈:

1. `docker compose logs app` 으로 실제 에러 확인 (HTTP 500 응답은 sanitize 됨).
2. 최소 입력으로 재현 (가장 작은 레코드, 가장 작은 scope).
3. 다음 정보로 issue 열기: 에러 메시지, 버전 (`git rev-parse HEAD`), 재현
   단계, `EMBEDDING_PROVIDER`.

보안 이슈는 **공개 이슈로 열지 마세요** — [../SECURITY.md](../SECURITY.md)
참고.
