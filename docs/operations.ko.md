> [English](operations.md) | **한국어**

# 운영 runbook

Akasha production 운영을 위한 day-2 절차. 초기 배포는
[deployment.ko.md](deployment.ko.md) 참고.

## 백업

```bash
npm run backup:create
```

Postgres (`pg_dump` 를 gzip으로 압축) 와 Qdrant (snapshot API) 를
`BACKUP_DIR` 로 스냅샷하고 checksum manifest를 씁니다. 파일명:
`postgres-YYYYMMDD-HHMM.sql.gz`, `qdrant-YYYYMMDD-HHMM.snapshot`,
`qdrant-memory_chunks_v1-YYYYMMDD-HHMM.json` (metadata sidecar),
`manifest-YYYYMMDD-HHMM.json`.

### 스케줄

cron 예시 (매일 03:00):

```cron
0 3 * * * cd /opt/akasha && /usr/bin/npm run backup:create >>/var/log/akasha-backup.log 2>&1
```

systemd timer 대안 — 동작하는 unit 파일은
[docs/self-hosted-operations.md](self-hosted-operations.md) 참고.

### 오프-호스트 복제

`.env` 에 `BACKUP_TARGET_HOST=user@host` 설정 시 로컬 스냅샷 완료 후 scp
copy. 대상 백업 디렉토리에 scope 된 SSH key (passphrase 없음) 필요.

### Retention

스크립트는 오래된 백업 자동 prune **안 함**. 별도 cron 으로 관리:

```cron
# 30일 보관
0 4 * * * find /var/lib/developer-memory-os/backups -mtime +30 -delete
```

### 검증

`npm run backup:verify` 는 최신 manifest가 24시간 미만인지, 로컬 artifact
checksum이 맞는지, `BACKUP_TARGET_HOST` 의 off-host 복사본도 같은 checksum인지
검증합니다. 매 백업 사이클 끝에 실행:

```cron
5 3 * * * cd /opt/akasha && /usr/bin/npm run backup:verify
```

## 복원

### Smoke 테스트 (주간 권장)

```bash
npm run restore:smoke
```

격리된 compose 스택 (`compose.restore-smoke.yaml`) 을 띄워 최신 백업을
복원하고 데이터 검증 실행. **Production을 건드리지 않음.** 실패는 critical
경고로 처리 — 백업이 신뢰 불가.

### Production 복원

```bash
# 1. 망가진 인스턴스 트래픽 중단.
docker compose stop app

# 2. Postgres 데이터 디렉토리 drop + gzip SQL dump 복원.
docker compose down -v postgres
docker compose up -d postgres
gunzip -c /var/lib/developer-memory-os/backups/postgres-YYYYMMDD-HHMM.sql.gz \
  | docker compose exec -T postgres psql -U memory -d memory_os

# 3. Qdrant 스냅샷 복원.
docker compose exec qdrant curl -X POST \
  http://localhost:6333/collections/memory_chunks_v1/snapshots/upload \
  -F snapshot=@/var/lib/developer-memory-os/backups/qdrant-YYYYMMDD-HHMM.snapshot

# 4. 검증 + 트래픽 재개.
docker compose start app
curl http://localhost:8787/readyz
```

호스트 완전 손실 시 복구는 [deployment.ko.md §재해 복구](deployment.ko.md#재해-복구)
참고.

## Compaction

2단계 모델: **dry-run 먼저, apply 나중.**

### 일상 compaction (수동 검토)

```bash
# Dry-run 으로 archive 될 것 확인.
curl -X POST http://localhost:8787/v1/memory/compact \
  -H "Authorization: Bearer $MEMORY_API_TOKENS" \
  -H "Content-Type: application/json" \
  -d '{"projectKey": "my-project"}' | jq

# duplicateGroups + decayCandidates 검토...

# 만족 시 apply.
curl -X POST http://localhost:8787/v1/memory/compact \
  -H "Authorization: Bearer $MEMORY_API_TOKENS" \
  -H "Content-Type: application/json" \
  -d '{"projectKey": "my-project", "dryRun": false}' | jq
```

기본 rate limit: 1 apply / hour / org. 필요 시 커스텀 오케스트레이터 deps로
조정.

### Sweeper 백로그

Apply 후 Qdrant 실패 시 `applyStats.qdrantPointsPending` 가 백로그 카운트.
Sweeper 활성화로 drain:

```bash
COMPACTION_SWEEP_ENABLED=true
COMPACTION_SWEEP_INTERVAL_MS=30000
```

각 tick은 pending archive row를 atomic 하게 claim하고
`qdrant_next_retry_at` 을 짧은 visibility window 로 밀어둡니다. claim 이후
worker 가 크래시되면 window 만료 후 해당 row가 다시 due 상태가 됩니다.

audit log에서 sweep 활동 확인:

```bash
curl -X POST http://localhost:8787/v1/audit/list \
  -H "Authorization: Bearer $MEMORY_API_TOKENS" \
  -d '{"limit": 50}' | jq '.data.entries[] | select(.tool=="compact_memory")'
```

### Stuck rows

`qdrant_status='failed'` (5+ 시도) 인 행은 수동 검토 필요:

```sql
SELECT id, organization_id, qdrant_attempt_count, qdrant_last_error
FROM memory_archive
WHERE qdrant_status = 'failed'
ORDER BY archived_at DESC;
```

흔한 원인: `QDRANT_COLLECTION_NAME` 변경 후 collection 이름 불일치, Qdrant
영구 outage, 스키마 drift. 근본 원인 수정 후 수동
`UPDATE memory_archive SET qdrant_status='pending'` 으로 re-enqueue.
`failed` row는 백그라운드가 무한 재시도하는 상태가 아니라 운영자가 검토해야
하는 큐로 취급하세요.

## Ingest sweeper

`add_memory` 는 vector upsert 전에 write-ahead ingest job을 기록합니다. Postgres
commit 이후 vector indexing 완료 전에 프로세스가 crash되면 ingest sweeper가 이미
commit된 chunk를 다시 임베딩해 활성 벡터 백엔드에 기록합니다.

지속 실행 replica 정확히 1개에서 활성화:

```bash
INGEST_SWEEP_ENABLED=true
INGEST_SWEEP_INTERVAL_MS=30000
```

실패한 ingest row 확인:

```sql
SELECT id, organization_id, memory_record_id, qdrant_attempts, qdrant_last_error
FROM ingest_jobs
WHERE qdrant_status = 'failed'
ORDER BY updated_at DESC;
```

근본 원인을 고친 뒤 `qdrant_status='pending'`,
`qdrant_next_retry_at=NOW()` 로 바꾸면 re-enqueue 됩니다. 기존 메시지가 더 이상
유용하지 않으면 `qdrant_last_error` 도 비웁니다.

## Unarchive

Apply 가 실수였을 때 archive 된 레코드 복원:

```bash
# 최근 archive 찾기:
psql -c "SELECT id, source_record_id, archive_reason, archived_at
         FROM memory_archive
         WHERE organization_id='dev-team'
           AND archived_at > NOW() - INTERVAL '1 hour'
         ORDER BY archived_at DESC;"

# 복원:
curl -X POST http://localhost:8787/v1/memory/unarchive \
  -H "Authorization: Bearer $MEMORY_API_TOKENS" \
  -d '{"archiveIds": [42, 43, 44]}' | jq
```

복원된 레코드는 새 BIGSERIAL id; 응답이 각각의 원래 `sourceRecordId` 와
매핑 — 호출자가 레퍼런스 업데이트.

## 모니터링

### 프로세스 로그

Akasha 는 pino JSON 을 **stderr** 로 출력. aggregator가 앱 컨테이너의
stderr 수집:

```bash
docker compose logs --since 1h app | jq 'select(.level >= 40)'  # warn+
```

모니터링할 주요 이벤트:

| 이벤트 | 심각도 | 액션 |
|---|---|---|
| `auth.disabled` | warn | dev에서만 정상. prod = 미스컨피그. |
| `compact.qdrant_delete_failed` | warn | sweeper 가 재시도. |
| `compact.sweep_giveup` | warn | 수동 조사 ("Stuck rows" 참고). |
| `compact.unarchive_failed` | error | archive별 실패; 응답 outcome 확인. |
| `http.unhandled` | error | HTTP 핸들러 예상 외 예외. |
| `compact.sweep_tick_failed` | error | sweeper throw; 루프 계속. |

### Health probe

- `GET /healthz` — 프로세스 살아 있음 (up 후 항상 200).
- `GET /readyz` — readiness gate. Postgres는 항상 프로브합니다. 또한
  `VECTOR_BACKEND=qdrant` 일 때 Qdrant, `EMBEDDING_PROVIDER=openai` 일 때
  OpenAI를 프로브합니다. `VECTOR_BACKEND=pgvector` 배포는 readiness에 Qdrant가
  필요하지 않습니다. 활성 프로브가 모두 통과하면 200, 하나라도 실패하면 503.

### 메트릭

네이티브 metrics export 없음. audit log + 구조화 로그가 주 observability
surface. Prometheus 필요 시 log-to-metrics 파이프라인 (Loki/Promtail,
Vector 등) 으로 구조화 로그에서 scrape.

## 스키마 마이그레이션

모든 마이그레이션은 idempotent 이고 부트스트랩 시 적용. 새 마이그레이션 추가:

1. `src/db/migrations/NNN_description.sql` 생성 (다음 일련 번호).
2. `src/db/migrate.ts` 의 `MIGRATION_FILES` 에 파일명 추가.
3. 같은 파일의 `embeddedPostgresMigrationSql` 에 SQL 추가
   (production fallback — SQL 파일이 디스크에 없을 때).
4. `CREATE … IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` 사용.

dev DB에 영향 없이 로컬 검증:

```bash
docker compose exec postgres psql -U memory -d memory_os -c "\d memory_archive"
```

## 흔한 runbook

### "Apply 했는데 Qdrant가 stale"

응답에서 `qdrantPointsPending` 확인. > 0 이면 sweeper가 drain (활성화 안
했으면 활성화). 확인:

```sql
SELECT qdrant_status, COUNT(*) FROM memory_archive GROUP BY 1;
```

### "마이그레이션 후 검색이 비어 있음"

`EMBEDDING_PROVIDER` 또는 `OPENAI_EMBEDDING_MODEL` 변경 후 reindex 안 한
경우. 실행:

```bash
curl -X POST http://localhost:8787/v1/memory/reindex \
  -H "Authorization: Bearer $MEMORY_API_TOKENS" \
  -d '{"projectKey": "my-project"}' | jq
```

### "서버가 'fail-closed' 에러로 시작 거부"

`MEMORY_API_TOKENS` 설정 (production) 또는 loopback 바인드
(`HOST=127.0.0.1`, dev). `src/app/server.ts` 의 `assertSafeAuthConfig`
참고.

### "MEMORY_API_TOKENS 분실 — 복구 방법?"

토큰은 `.env` 에. .env 분실 시 새로 생성 (`uuidgen` × N) 하고 `.env` + 모든
클라이언트에 업데이트. 새 `.env` 로드 (서버 재시작) 순간 옛 토큰 무효화.
