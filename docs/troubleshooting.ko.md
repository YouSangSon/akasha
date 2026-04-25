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

### `OPENAI_API_KEY in .env is still the placeholder`

`.env` 가 `OPENAI_API_KEY=sk-replace-me` (템플릿 기본값) 일 때 `install.sh`
가 진행 거부. `.env` 편집해서 실제 키 붙여넣고 재실행.

OpenAI 사용 안 하려면:
```bash
EMBEDDING_PROVIDER=local
OPENAI_API_KEY=ignored
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

### `Missing required environment variable: OPENAI_API_KEY`

키 설정 또는 local embedding 으로 전환:
```bash
EMBEDDING_PROVIDER=local
```

### `Unsupported EMBEDDING_PROVIDER: <value>`

`openai` 또는 `local` 만 유효. 오타 확인.

### `SecretDetectedError: <category>` (HTTP 400)

`add_memory` 컨텐츠가 secret 패턴 매칭. 카테고리: `openai_key`,
`anthropic_key`, `aws_access_key`, `aws_secret`, `pem_block`,
`bearer_token`, `jwt`, `generic_high_entropy`.

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

### Fresh `add_memory` 후 검색 결과 없음

흔한 원인:
1. **잘못된 project key** — `searchMemory` 는 project-scoped; `add_memory`
   에서 사용한 정확한 key로 검색.
2. **Embedding provider 불일치** — reindex 없이 `EMBEDDING_PROVIDER` 변경 시
   기존 chunk가 호환 안 되는 vector. `reindex_memory` 실행.
3. **Ingest job pending** — `add_memory` 는 chunking / embedding 진행 중에도
   즉시 반환. `SELECT status FROM ingest_jobs WHERE memory_record_id = <id>`
   로 완료 확인.

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
