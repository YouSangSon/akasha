> [English](deployment.md) | **한국어**

# 배포

이 문서는 Akasha의 production 배포를 다룹니다. 로컬 개발 셋업은
[README.ko.md](../README.ko.md), 운영 절차 (백업, 복원, compaction) 는
[operations.ko.md](operations.ko.md) 참고.

## 토폴로지

가장 작은 production 배포는 한 호스트에서 컨테이너 3개 (Postgres, Qdrant,
앱) 를 실행하는 형태입니다. 번들된 `compose.yaml` 이 정확히 이 구성입니다.

```
┌─────────── host ────────────┐
│  reverse-proxy (nginx/caddy)│ ← TLS, optional
│            │                │
│   port 8787│                │
│            ▼                │
│         ┌─app─┐             │
│         │     │             │
│  ┌──────┼─────┼──────┐      │
│  │      │     │      │      │
│  ▼      ▼     ▼      ▼      │
│ pg    qdrant ⌷⌷⌷ disk       │
└─────────────────────────────┘
```

멀티-replica 배포는 외부 Postgres + Qdrant (managed 또는 self-hosted) 와
load balancer 뒤의 다중 `app` 인스턴스 사용.

## 배포 전 체크리스트

- [ ] **강한 secret** — `POSTGRES_PASSWORD`, `QDRANT_API_KEY`,
      `MEMORY_API_TOKENS` 는 개발용 기본값 대신 생성한 secret으로 교체.
      패스워드 매니저 사용.
- [ ] **바인드 / TLS** — `HOST=0.0.0.0` 은 TLS 종단하는 reverse proxy 뒤에서만.
      proxy 없이 `0.0.0.0` 으로 인터넷 직접 노출은 지원하지 않음.
- [ ] **토큰-org 바인딩** — production `MEMORY_API_TOKENS` 는 토큰을 org에
      바인딩 (`token:org` 문법) 해서 멀티-테넌트 격리 강제.
- [ ] **Rate limit** — `RATE_LIMIT_PER_MINUTE` 을 production 적합한 값
      (예: 300) 으로 설정. unset = 무제한, 권장 안 함.
- [ ] **Background sweeper** — 지속 실행 HTTP replica 하나에서 compaction/ingest
      sweeper를 켜거나, sweeper env flag를 설정한 전용
      `npm run start:worker` 프로세스 하나를 실행.
- [ ] **백업** — `npm run backup:create` 를 cron / systemd timer로 스케줄,
      `npm run restore:smoke` 로 정기 검증.
- [ ] **모니터링** — `/readyz` 를 오케스트레이터 readiness probe에 연결,
      pino 로그 (stderr) 를 로그 aggregator에 연결. `/readyz` 는 Postgres를 항상
      프로브하고, `VECTOR_BACKEND=qdrant` 일 때만 Qdrant, `EMBEDDING_PROVIDER=openai`
      일 때만 OpenAI를 프로브합니다. 활성 의존성 하나라도 연결 불가면 503을
      반환해 오케스트레이터가 트래픽을 자동으로 drain합니다.

## 단일 호스트 compose 배포

번들된 `compose.yaml` 은 단일 호스트 배포 production-grade:

```bash
# 1. Clone
git clone https://github.com/YouSangSon/akasha.git
cd akasha

# 2. production .env (dev 값 재사용 금지!)
cp .env.example .env
${EDITOR:-vim} .env
#   - HOST=0.0.0.0  (또는 같은 호스트 reverse proxy 뒤면 127.0.0.1)
#   - MEMORY_API_TOKENS 에 token:org 바인딩
#   - 강한 POSTGRES_PASSWORD, QDRANT_API_KEY
#   - RATE_LIMIT_PER_MINUTE=300
#   - COMPACTION_SWEEP_ENABLED=true (또는 전용 worker에만 설정)
#   - NODE_ENV=production

# 3. 빌드 + 실행
docker compose up -d
docker compose exec app npm run db:migrate
docker compose logs -f app

# 4. 검증
curl http://localhost:8787/readyz | jq
```

Postgres 단독 배포에서는 `VECTOR_BACKEND=pgvector` 를 설정하고, DB admin으로
`vector` 확장을 한 번 활성화한 뒤 Qdrant 자격증명을 생략할 수 있습니다.
이 모드에서 `/readyz` 는 Qdrant를 프로브하지 않습니다.

## 공유 my-cloud VM의 임시 비공개 검증

이 구성은 개인 VM에서 실제 저장·검색 경로를 확인하기 위한 것입니다. 고객 운영,
성능 보장이나 공개 데모를 의미하지 않습니다. 로컬에는 전체 통합 환경을 띄우지 않습니다.

### 문제와 선택

공유 VM에서는 앱 하나의 제한만으로 전체 자원 사용을 제어할 수 없습니다. 기존
Postgres·Qdrant·앱을 유지하고 [전용 overlay](../compose.my-cloud.yaml)에서 합계
1 vCPU·2 GiB를 나눠 할당합니다. 앱은 0.5 vCPU·1 GiB, 저장소 두 개는 각각
0.25 vCPU·512 MiB입니다. `memswap_limit`을 메모리 상한과 같게 하고,
자동 재시작을 끄며, 컨테이너별 로그를 10 MB·3개로 제한합니다. DB 포트는
게시하지 않고 앱은 기본 Compose의 loopback 바인딩을 유지합니다. 앱의 기본
`build` 설정도 제거해 이 overlay로 제한 없는 암묵적 빌드가 시작되지 않게 합니다.

pgvector로 바꾸면 서비스 수를 줄일 수 있지만 이번 검증의 기본 backend가 달라집니다.
이미 검증한 `transformers + Qdrant`를 유지하는 대신 이 예산에서 실제로 실행되는지
확인합니다. 예산은 시작 상한이며 처리량이나 모델 로딩 성공을 보장하지 않습니다.

### 실행 전 조건과 빌드

- 기존 `my-cloud`와 다른 프로젝트의 실행 상태를 확인합니다. 전체 작업 동안
  `/home/ubuntu/.cache/personal-project-vm.lock`의 프로세스 잠금을 유지합니다.
  점유 중이면 강제로 해제하지 않습니다.
- 제공사에서 이번 청구 기간 트래픽을 조회합니다. 확인 불가 또는 2.4 TB 이상이면
  새 이미지·대용량 의존성 전송을 보류합니다. 조회나 사용량 기준은 과금 차단 장치가 아닙니다.
- 새 예산을 고려하고도 `MemAvailable` 1 GiB·디스크 10 GiB를 남깁니다.
  엔진이 없다면 공식 패키지의 설치 계획부터 확인하고 기존 패키지 제거·업그레이드,
  기존 서비스 재시작이나 Docker 전역 설정 변경이 필요한 설치는 진행하지 않습니다.
- 고정 커밋의 `git archive`로만 빌드 입력을 만듭니다. 작업 디렉터리 전체를 전송하면
  미추적 파일·비밀이 섞일 수 있습니다. 기존 `docker/app.Dockerfile`을 사용하고
  linux/amd64 이미지에 `org.opencontainers.image.revision` 라벨을 기록합니다.
- Compose의 실행 제한은 빌드 제한이 아닙니다. VM 빌드가 필요하면 전용 BuildKit
  컨테이너에 CPU 1개·메모리 2 GiB 이하·추가 swap 금지·로그 회전과
  BuildKit `max-parallelism = 1`을 적용하고 실제 cgroup 값을 확인합니다.
  Buildx `remote` driver의 `docker-container://` 경로로 연결하면 builder 포트를
  게시하지 않고 컨테이너의 로그 제한도 지정할 수 있습니다. 앱 실행 전에 builder를
  종료해 두 예산을 겹치지 않습니다.

### 실행과 검증

Docker Compose 2.24.4 이상이 필요합니다(`!reset`으로 DB 포트 게시를 제거합니다).
새 전용 프로젝트명, 합성 데이터, 조직에 묶인 임시 토큰과 전용 비밀 파일을 사용합니다.
기존 비밀이나 사용자 데이터는 변경하지 않습니다. 준비한 이미지와 환경 파일을
지정한 뒤 아래 구성의 합산 상한·게시 포트부터 확인합니다.

```bash
docker compose --env-file "$AKASHA_VM_ENV" -p "$AKASHA_VM_PROJECT" \
  -f compose.yaml -f compose.my-cloud.yaml config
# 저장소 이미지도 미리 준비한 후, 암묵적인 빌드·pull 없이 시작합니다.
docker compose --env-file "$AKASHA_VM_ENV" -p "$AKASHA_VM_PROJECT" \
  -f compose.yaml -f compose.my-cloud.yaml up -d --no-build --pull never
```

환경 파일의 `AKASHA_VM_IMAGE`는 준비한 커밋 태그의 로컬 이미지를 가리킵니다.
`docker inspect`와 cgroup에서 CPU·메모리·swap·로그 제한 및 이미지 ID를 확인합니다.
소스 SHA → 이미지 revision 라벨·이미지 ID → 컨테이너 `.Image`를 연결합니다.
registry digest가 없는 로컬 빌드도 이 대응 관계로 검증할 수 있습니다.

`/readyz`는 의존성 도달 확인입니다. 기본 `transformers`로 합성 메모리 저장 → 검색 →
context pack의 ID·본문 일치, 인증 누락과 다른 조직 접근 거절, 관리 화면의 대표
성공·실패 흐름을 따로 확인합니다. 예를 들어 readiness가 성공해도 첫 저장의 모델
다운로드·로딩이나 메모리 제한 때문에 실패할 수 있습니다. 이때 `local` stub으로 바꾼
결과를 기본 provider 성공으로 보고하지 않습니다. 개인 VM 스모크는 부하·복구·운영 검증을
대체하지 않습니다.

실행 wrapper의 EXIT/HUP/INT/TERM 종료 처리에 정리를 연결합니다. 생성한 컨테이너·
볼륨·네트워크·이미지·임시 경로의 정확한 소유 영수증과 참조 상태를 확인하고 필요한
증거를 보존한 뒤 정리합니다. SSH 종료만으로 컨테이너가 종료되지는 않습니다.
소유권이 불명확한 항목은 남기고, 잔여 리소스와 기존 서비스 상태를 확인한 뒤 잠금을
해제합니다. 과거 삭제 사건의 미확인 영향은 이번 정리 결과와 별도로 유지합니다.

SSH가 끊기거나 Docker 조회가 실패하면 종료 처리의 완료도 미확인입니다. 정리를
하나의 예외 처리로 묶어 첫 실패가 builder 종료까지 건너뛰지 않게 하고, 이번 실행에서
생성한 정확한 ID로 독립적으로 종료를 시도해야 합니다. 사전 검사에서 발견한 이전
실행 리소스를 새 실행의 종료 처리로 삭제하지 않습니다. 재접속 후 원래 실행의
영수증·PID·잠금·컨테이너 상태와 실제 RUN 자식의 cgroup 조상 제한부터 확인합니다.
builder init PID의 제한이나 클라이언트의 종료만으로 전체 빌드 제한·정리를 입증하지 않습니다.

참고 범위는 Docker가 제공하는 자원·merge·builder 기능입니다. 별도 자원 제어기를
발명한 것이 아니라, 이 프로젝트의 기본 backend를 유지하면서 빌드와 실행을 나누고
실제 cgroup·소스 대응·정리 영수증으로 확인하도록 적용했습니다.

설정 근거: [Compose merge](https://docs.docker.com/reference/compose-file/merge/),
[컨테이너 자원 제한](https://docs.docker.com/engine/containers/resource_constraints/),
[Buildx remote driver](https://docs.docker.com/build/builders/drivers/remote/),
[BuildKit 병렬도](https://docs.docker.com/build/buildkit/configure/).

## Reverse proxy 뒤에서

### nginx

```nginx
server {
  listen 443 ssl http2;
  server_name memory.example.com;

  ssl_certificate     /etc/letsencrypt/live/memory.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/memory.example.com/privkey.pem;

  location / {
    proxy_pass         http://127.0.0.1:8787;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;

    # health probe는 proxy 레이어 rate limit 불필요.
    # MCP/HTTP API는 자체 토큰별 bucket 보유.
  }
}
```

`.env` 에 `HOST=127.0.0.1` 설정해서 앱이 loopback에서만 listen하도록; proxy가
외부 트래픽 forward.

### Caddy

```caddy
memory.example.com {
  reverse_proxy 127.0.0.1:8787
}
```

Caddy가 TLS 자동 처리.

## 기존 데이터 마이그레이션

기존 메모리 store를 Akasha로 이전하는 경우:

1. **레코드를 `add_memory` 호출로 포맷** (CSV → 스크립트 → API).
2. **Bulk insert** — HTTP API 또는 직접 Postgres COPY (이후 `reindex_memory`
   로 Qdrant 채움).
3. **dry-run 먼저 적용** — 무엇이 archive 될지 확인 후 만족하면
   `dryRun=false`.

DB 레벨 마이그레이션 (스키마 변경) 은 모두 idempotent 이고 데이터가 있는
DB에서 안전. 새 버전 배포하면 부트스트랩이 pending 마이그레이션 적용.

## 스케일링 노트

앱 프로세스는 토큰별 프로세스-local in-memory rate limiter 외에는
stateless. round-robin load balancer 뒤의 다중 replica 가능. 단, 각 replica가
자체 bucket을 가지므로 application rate limit의 유효 한도는 replica 수만큼
커질 수 있습니다. 배포 전체의 엄격한 quota가 필요하면 공유 reverse proxy
또는 edge 계층에서 제한하세요.

**Sweeper 조정**: 기본값으로는 `COMPACTION_SWEEP_ENABLED=true` 및/또는
`INGEST_SWEEP_ENABLED=true` 를 지속 실행 HTTP replica **하나**에서만 켜거나,
HTTP replica에서는 끄고 해당 env flag를 설정한 전용 `npm run start:worker`
프로세스 하나를 실행합니다. 각 sweep tick은 atomic 한
`UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING`
문 하나로 pending row를 claim하고 `qdrant_next_retry_at` 을 짧은
visibility window 로 밀어 worker 크래시 후에도 자동 재처리되게 합니다.
더 높은 cleanup throughput 이 필요하면 worker를 늘릴 수 있지만, 불필요한 중복
Qdrant 트래픽을 피하려면 기본 권장값은 여전히 단일 worker 입니다.

**Postgres 스케일링**: read replica 미지원 (`searchMemory`, `listMemory` 는
항상 primary 읽음). 높은 read 볼륨은 vertical scale.

**Qdrant 스케일링**: Qdrant cluster 지원. 현재 단일 인스턴스 클라이언트는
cluster fan-out 안 하지만, `QDRANT_URL` 은 Qdrant-호환 endpoint 모두 수용.

## 오프-호스트 백업

`BACKUP_TARGET_HOST` 는 로컬 스냅샷 완료 후 원격 호스트로 scp copy 활성화.
원격 호스트의 `/var/lib/developer-memory-os/backups` 디렉토리 scope의 SSH 키
(passphrase 없음) 셋업:

```bash
BACKUP_DIR=/var/lib/developer-memory-os/backups
BACKUP_TARGET_HOST=backup@backup.example.com
```

`npm run backup:create` 스크립트가 scp 호출 처리. 스케줄 + retention 정책은
[docs/operations.ko.md](operations.ko.md) 참고. `BACKUP_ENCRYPTION_KEY_FILE` 을
설정하면 manifest가 encrypted `.enc` artifact를 가리키도록 갱신되고, 원격
호스트에는 plaintext artifact를 복사하지 않습니다.

## 재해 복구

**주의:** `/readyz` 는 Postgres, 활성 벡터 백엔드 (`VECTOR_BACKEND=qdrant` 일 때만
Qdrant; pgvector는 Postgres 사용), `EMBEDDING_PROVIDER=openai` 일 때 OpenAI를
능동적으로 프로브합니다. 활성 의존성 하나라도 연결 불가면 503을 반환합니다.
Transient 실패 복구 시 다음 요청이 canonical-services singleton을 다시
부트스트랩합니다 (앱 재시작 불필요).

호스트가 완전히 사라지면 최신 백업에서 복원:

1. 같은 compose stack의 새 호스트 띄움.
2. `pg_dump` 스냅샷에서 Postgres 복원.
3. `VECTOR_BACKEND=qdrant` 인 경우 스냅샷에서 Qdrant 복원. pgvector는 벡터가 Postgres dump 안에 있으므로 생략.
4. `npm run restore:smoke` 로 검증.
5. 새 호스트로 트래픽 cut.

복구 runbook은 [docs/operations.ko.md](operations.ko.md) 참고.
