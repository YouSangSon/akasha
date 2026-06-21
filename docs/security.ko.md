> [English](security.md) | **한국어**

# 보안 모델

이 문서는 Akasha가 다루는 위협 surface, 현재 적용된 컨트롤, 잔여
리스크를 요약합니다. 취약점 리포팅 정책 (어디로 보안 보고를 보낼지) 는
[../SECURITY.md](../SECURITY.md) 참고.

## 위협 surface

| Surface | 위험 |
|---------|------|
| HTTP API (`/v1/*`) | 무단 메모리 read/write; cross-tenant 접근; destructive `compact_memory` apply |
| MCP stdio | 로컬 전용 (parent process가 binary 실행); parent의 identity 상속 |
| Postgres | 직접 DB 접근은 모든 앱 레이어 컨트롤 우회; 백업 + 제한 |
| Qdrant | vector 접근은 scope/auth 필터 우회; 별도 백업, 네트워크 격리 |
| OpenAI 호출 | embedding용 컨텐츠가 네트워크 외부로; `EMBEDDING_PROVIDER=local` 로 on-box 유지 |

## 컨트롤

### 인증

`MEMORY_API_TOKENS` 의 bearer 토큰 (콤마 구분, 옵션 `:org` 바인딩).
`timingSafeEqual` constant-time 비교로 timing leak 방지. 다중 토큰 로테이션
지원 (old + new 배포 → 클라이언트 로테이션 → old 제거).

`/healthz`, `/readyz` 는 의도적으로 인증 없음 — 오케스트레이터가 자격 없이
프로빙 가능해야 함.

### 멀티-테넌트 격리

레코드 보유 테이블 모두 `organization_id` 보유. SQL 쿼리는 read/write 모두에서
`WHERE organization_id = $org` 강제. 토큰-org 바인딩은 라우트 레이어
(`src/app/routes/memory.ts`) 에서 검증 — body / `x-organization-id` 헤더가
바인딩 org와 다르면 핸들러 실행 전 403.

Compaction apply 경로는 `memory_archive` 에 쓸 때 `organization_id` 를
caller 토큰이 아닌 canonical 레코드 자체 (DELETE RETURNING) 에서 읽음 —
defense-in-depth.

### Fail-closed startup gate

`MEMORY_API_TOKENS` 가 비어 있을 때 `startOperatorServer` 는 non-loopback 호스트
(`HOST=0.0.0.0`, `HOST=10.x.x.x` 등) 바인딩 거부. loopback dev + 빈 토큰은
허용; 실수로 zero-auth public 노출 안 됨.

### HTTP body 검증

`/v1/memory/compact` 는 `dryRun: "false"` (문자열), `dryRun: 0`, 그 외
non-strict-boolean 값 거부. `true` / `false` / 생략 (기본 `true`) 만 핸들러로
도달. 우발적 type-coerced destructive 실행 방지.

### Secret 스크럽

메모리가 Postgres 또는 Qdrant 에 도달하기 전 `src/store/secret-scrub.ts` 의
`assertNoSecrets(content)` 가 다음을 스캔하고 거부:

- OpenAI / Anthropic API key 패턴 (`sk-…`, `sk-ant-…`)
- AWS access key 패턴 (`AKIA…`)
- GitHub 토큰 패턴 (`ghp_…`, `ghs_…` 등)
- GCP API key 패턴 (`AIza…`)
- Stripe secret key 패턴 (`sk_live_…`, `sk_test_…`)
- Slack 토큰 패턴 (`xoxb-…`, `xoxp-…` 등)
- 자격증명이 포함된 DB 연결 문자열 (`://user:pass@host`)
- PEM 블록 (private key, certificate)
- bearer-token-shaped 문자열 (`Authorization: Bearer …`)
- JWT-shaped 문자열 (header.body.sig)

매칭 시 `SecretDetectedError` (HTTP 400) 발생 — 카테고리 이름은 포함, 값은
포함하지 않음. 스크럽 도입 이전 레코드는 재스크럽 안 됨 — 오염 의심 시 명시적
정리 패스 필요.

### Rate limit

`RATE_LIMIT_PER_MINUTE` 의 토큰별 글로벌 bucket (token-bucket). Apply 경로는
추가로 org당 1회/시간 제한 (기본, `applyCompaction` deps에서 설정 가능).

### Audit log

모든 도구 호출이 `audit_log` 에 기록 (org, actor, tool, outcome, duration,
request id). Destructive 작업은 구조화된 `metadata` JSONB 첨부 (run id,
archive id 등). 읽기 접근은 org 바인딩으로 scope.

### Cascade-delete 인덱스

`relationships(from_memory_record_id)`, `relationships(to_memory_record_id)`,
`ingest_jobs(memory_record_id)` 인덱스 보유. 없으면 수백 개 `memory_records`
삭제하는 apply가 각 child 테이블 sequential scan — 성능 + contention 문제.

### TOCTOU 가드 (apply)

Compact-apply CTE 는 `updated_at <= planGeneratedAt` 일 때만 DELETE. dry-run
plan 계산 후 레코드가 수정되었으면 DELETE는 0 rows 반환, 오케스트레이터는
`skipped` 로 카운트 — 중간 수정 레코드의 silent 손실 방지.

## 잔여 리스크

다음은 현재 mitigation **없는** 알려진 한계 / 리스크:

- **HTTPS 종단 없음.** HTTP 서버는 plaintext. non-loopback 바인딩에는 TLS
  종단하는 reverse proxy 필수. [deployment.ko.md](deployment.ko.md) 참고.
- **HTTP API에 CSRF 보호 없음.** API는 bearer-only; 쿠키 미사용. 토큰 저장
  브라우저 클라이언트 빌드 시 브라우저 환경이 attack surface (XSS = 토큰 절도).
  short-lived 토큰 + 로테이션 사용.
- **Embedding provider가 컨텐츠를 봄.** `EMBEDDING_PROVIDER=openai` 시 모든
  레코드 컨텐츠가 OpenAI에 전송. 컴플라이언스가 금지하면 `local` 로 전환 (품질
  trade-off 수용).
- **at-rest 토큰 저장** 은 앱 사이드 (env, .env 파일). KMS 통합 없음.
- **Postgres 백업에 plaintext 컨텐츠 포함.** 데이터 분류상 필요하면 디스크 /
  볼륨 레벨에서 at-rest 암호화.
- **Qdrant payload 에 `organization_id` 포함** — 직접 Qdrant 접근자는
  cross-org 읽기 가능. Qdrant 네트워크 접근은 앱 프로세스로 제한.

## 경계

Akasha는 OS 레벨 / 네트워크 레벨 컨트롤의 **대체재가 아닙니다**.
가정:

1. 호스트 신뢰 (악의적 프로세스 없음).
2. Postgres / Qdrant 컨테이너가 앱 프로세스로 네트워크 격리.
3. 백업이 적절한 접근 컨트롤로 저장.
4. non-loopback 서빙 시 upstream proxy의 TLS.

이 가정 안에서 애플리케이션 레이어가 멀티-테넌트 격리, audit, 인증, 컨텐츠
레벨 secret 위생을 enforce.
