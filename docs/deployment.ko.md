> [English](deployment.md) | **한국어**

# 배포

이 문서는 context-forge의 production 배포를 다룹니다. 로컬 개발 셋업은
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
      `MEMORY_API_TOKENS` 기본값에서 변경. 패스워드 매니저 사용.
- [ ] **바인드 / TLS** — `HOST=0.0.0.0` 은 TLS 종단하는 reverse proxy 뒤에서만.
      proxy 없이 `0.0.0.0` 으로 인터넷 직접 노출은 지원하지 않음.
- [ ] **토큰-org 바인딩** — production `MEMORY_API_TOKENS` 는 토큰을 org에
      바인딩 (`token:org` 문법) 해서 멀티-테넌트 격리 강제.
- [ ] **Rate limit** — `RATE_LIMIT_PER_MINUTE` 을 production 적합한 값
      (예: 300) 으로 설정. unset = 무제한, 권장 안 함.
- [ ] **Compaction sweeper** — 지속 실행 replica 정확히 1개에서 활성:
      `COMPACTION_SWEEP_ENABLED=true`.
- [ ] **백업** — `npm run backup:create` 를 cron / systemd timer로 스케줄,
      `npm run restore:smoke` 로 정기 검증.
- [ ] **모니터링** — `/readyz` 를 오케스트레이터 readiness probe에 연결,
      pino 로그 (stderr) 를 로그 aggregator에 연결.

## 단일 호스트 compose 배포

번들된 `compose.yaml` 은 단일 호스트 배포 production-grade:

```bash
# 1. Clone
git clone https://github.com/YouSangSon/context-forge.git
cd context-forge

# 2. production .env (dev 값 재사용 금지!)
cp .env.example .env
${EDITOR:-vim} .env
#   - HOST=0.0.0.0  (또는 같은 호스트 reverse proxy 뒤면 127.0.0.1)
#   - MEMORY_API_TOKENS 에 token:org 바인딩
#   - 강한 POSTGRES_PASSWORD, QDRANT_API_KEY
#   - RATE_LIMIT_PER_MINUTE=300
#   - COMPACTION_SWEEP_ENABLED=true
#   - NODE_ENV=production

# 3. 빌드 + 실행
docker compose up -d
docker compose exec app npm run db:migrate
docker compose logs -f app

# 4. 검증
curl http://localhost:8787/readyz | jq
```

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

기존 메모리 store를 context-forge로 이전하는 경우:

1. **레코드를 `add_memory` 호출로 포맷** (CSV → 스크립트 → API).
2. **Bulk insert** — HTTP API 또는 직접 Postgres COPY (이후 `reindex_memory`
   로 Qdrant 채움).
3. **dry-run 먼저 적용** — 무엇이 archive 될지 확인 후 만족하면
   `dryRun=false`.

DB 레벨 마이그레이션 (스키마 변경) 은 모두 idempotent 이고 데이터가 있는
DB에서 안전. 새 버전 배포하면 부트스트랩이 pending 마이그레이션 적용.

## 스케일링 노트

앱 프로세스는 토큰별 in-memory rate limiter 외에는 stateless. round-robin
load balancer 뒤의 다중 replica 가능; 각 replica가 자체 bucket 가지므로
클라이언트가 약간 느슨한 rate limit을 볼 수 있음.

**Sweeper 조정**: 현재는 `COMPACTION_SWEEP_ENABLED=true` 를 **단 하나의**
replica 에서만 활성. sweeper는 SQL 레벨에서 `FOR UPDATE SKIP LOCKED` 사용
멀티-replica 안전이지만, 각 replica가 자체 setInterval 발동 → 다중 sweeper
실행은 cycle당 Qdrant 호출이 불필요하게 많아짐. 향후 leader election 추가
가능성 있음; 그 전까지는 한 replica 선택.

**Postgres 스케일링**: read replica 미지원 (`searchMemory`, `listMemory` 는
항상 primary 읽음). 높은 read 볼륨은 vertical scale.

**Qdrant 스케일링**: Qdrant cluster 지원. 현재 단일 인스턴스 클라이언트는
cluster fan-out 안 하지만, `QDRANT_URL` 은 Qdrant-호환 endpoint 모두 수용.

## 오프-호스트 백업

`BACKUP_TARGET_HOST` 는 로컬 스냅샷 완료 후 원격 호스트로 rsync push 활성화.
원격 호스트의 `/var/lib/developer-memory-os/backups` 디렉토리 scope의 SSH 키
(passphrase 없음) 셋업:

```bash
BACKUP_DIR=/var/lib/developer-memory-os/backups
BACKUP_TARGET_HOST=backup@backup.example.com
```

`npm run backup:create` 스크립트가 rsync 호출 처리. 스케줄 + retention 정책은
[docs/operations.ko.md](operations.ko.md) 참고.

## 재해 복구

앱 풀은 Postgres / Qdrant / OpenAI outage에서 fail-closed — `/readyz` 가 503
반환 → load balancer가 인스턴스 drain. 의존성 복구되면 다음 요청이
canonical-services singleton을 다시 부트스트랩 (transient 실패는 앱 재시작
불필요).

호스트가 완전히 사라지면 최신 백업에서 복원:

1. 같은 compose stack의 새 호스트 띄움.
2. `pg_dump` 스냅샷에서 Postgres 복원.
3. 스냅샷에서 Qdrant 복원.
4. `npm run restore:smoke` 로 검증.
5. 새 호스트로 트래픽 cut.

복구 runbook은 [docs/operations.ko.md](operations.ko.md) 참고.
