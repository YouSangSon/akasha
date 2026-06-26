> [English](self-hosted-operations.md) | **한국어**

# 자체 호스팅 운영

이 runbook은 기본 Qdrant 또는 Postgres 단독 배포용 pgvector를 쓰는 활성
Postgres 운영자 스택을 다룹니다. SQLite는 역사적 계획/설계 문서에만 남아
있으며 배포된 런타임 경로의 일부가 아닙니다.

## 배포 운영

데이터 플레인과 운영자 서비스를 시작합니다:

```bash
cp .env.example .env
docker compose build app
docker compose up -d postgres qdrant
npm run build
docker compose run --rm app npm run db:migrate
docker compose up -d app
```

비공개 운영자 surface를 확인합니다:

```bash
curl http://127.0.0.1:8787/healthz
```

예상 응답:

```json
{"success":true,"data":{"ok":true,"host":"0.0.0.0","port":8787}}
```

## 야간 백업

관련 환경 변수를 확인한 후 패키지된 백업 작업을 실행합니다:

```bash
npm run backup:create
```

관련 변수:

- `BACKUP_DIR`
- `DATABASE_URL`
- `VECTOR_BACKEND`
- `QDRANT_URL`
- `QDRANT_COLLECTION_NAME` (선택 사항, 기본값 `memory_chunks_v1`)
- `QDRANT_API_KEY` (인증 없는 로컬 배포에서는 선택 사항)
- `BACKUP_TARGET_HOST` (선택 사항; 비어 있지 않으면 백업 스크립트가 `ssh`/`scp` 로 artifact 복사)
- `BACKUP_TARGET_DIR` (선택 사항, 원격 호스트의 `BACKUP_DIR`가 기본값)

`VECTOR_BACKEND=qdrant` 에서는 `npm run backup:create` 가 Postgres와 Qdrant
snapshot data를 캡처합니다. 백업 스크립트가 생성하고 복사하는 파일:

- `postgres-YYYYMMDD-HHMM.sql.gz`
- `qdrant-YYYYMMDD-HHMM.snapshot`
- `qdrant-memory_chunks_v1-YYYYMMDD-HHMM.json`
- `manifest-YYYYMMDD-HHMM.json`

Qdrant metadata sidecar 파일명에는 collection 이름이 포함됩니다.

`VECTOR_BACKEND=pgvector` 에서는 벡터가 Postgres 안에 있으므로 Qdrant snapshot
data는 logical data path의 일부가 아닙니다. 하지만 오늘 기준 packaged
`npm run backup:create` command는 Postgres dump 후에도
`scripts/snapshot-qdrant.sh` 를 조건 없이 호출합니다. packaged command를 쓰는
pgvector operator도 script split 전까지는 `QDRANT_URL` 과 접근 가능한 Qdrant
endpoint가 필요하며, 없으면 snapshot 단계에서 backup job이 실패합니다.

## 백업 검증

최신 로컬 매니페스트와 `BACKUP_TARGET_HOST`의 복사된 파일에 대해 검증 도우미를 실행합니다:

```bash
npm run backup:verify
```

`backup:verify`는 remote-copy 배포용이며 `BACKUP_TARGET_HOST`가 필요합니다.
최신 매니페스트가 24시간 미만이고, 두 아티팩트가 로컬과 원격 호스트에 모두
존재하며, 매니페스트 체크섬이 두 복사본과 일치하는 경우에만 통과합니다.

## 복원 스모크 테스트

`BACKUP_DIR`의 최신 매니페스트에 대해 일회성 복원 확인을 실행합니다:

기존 restore smoke helper는 아직 Qdrant-oriented 이며 추후 script split 전까지
`RESTORE_QDRANT_URL` 이 필요합니다.

```bash
export RESTORE_POSTGRES_PORT=15432
export RESTORE_QDRANT_PORT=16333
export RESTORE_APP_PORT=18787
export RESTORE_POSTGRES_URL="postgres://memory:memory@127.0.0.1:${RESTORE_POSTGRES_PORT}/memory_os"
export RESTORE_QDRANT_URL="http://127.0.0.1:${RESTORE_QDRANT_PORT}"
export RESTORE_SMOKE_PROJECT_KEY="project-alpha"
export RESTORE_SMOKE_ORGANIZATION_ID="default"
export RESTORE_SMOKE_SEARCH_QUERY="continue work"
export RESTORE_SMOKE_PACK_TASK="continue work"
export RESTORE_SMOKE_POSTGRES_RESTORE_CMD='cat "$RESTORE_SMOKE_POSTGRES_ARTIFACT_PATH" | gunzip | psql "$RESTORE_POSTGRES_URL"'
export RESTORE_SMOKE_QDRANT_RESTORE_CMD='curl -fsS -X POST "$RESTORE_QDRANT_URL/collections/memory_chunks_v1/snapshots/upload" -F "snapshot=@$RESTORE_SMOKE_QDRANT_ARTIFACT_PATH"'
npm run restore:smoke
```

이 도우미는 항상:

- `docker compose -f compose.yaml -f compose.restore-smoke.yaml -p restore-smoke up -d postgres qdrant` 부팅
- `BACKUP_DIR`에서 최신 매니페스트 및 아티팩트 경로 해석
- 최신 Postgres 덤프를 격리된 데이터베이스에 복원
- 최신 Qdrant 스냅샷을 격리된 벡터 스토어에 복원
- 두 복원이 성공하고 `/healthz`를 기다린 후에만 `app` 서비스 시작
- 복원된 서비스에 대해 실제 `search_memory` 쿼리 하나와 `build_context_pack` 호출 하나 실행
  (`RESTORE_SMOKE_ORGANIZATION_ID` 설정 시 이를 사용, 의도적인 legacy org-blind check는 `LEGACY_ANONYMOUS_SEARCH=true`)
- `docker compose -f compose.yaml -f compose.restore-smoke.yaml -p restore-smoke down -v`로 일회성 환경 해체

셸 명령이 중간에 실패해도 수동 해체가 안전합니다:

```bash
docker compose -f compose.yaml -f compose.restore-smoke.yaml -p restore-smoke down -v
```
