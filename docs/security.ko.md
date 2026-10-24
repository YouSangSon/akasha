> [English](security.md) | **한국어**

# 보안 모델

이 문서는 Akasha가 다루는 위협 surface, 현재 적용된 컨트롤, 잔여
리스크를 요약합니다. 취약점 리포팅 정책 (어디로 보안 보고를 보낼지) 는
[../SECURITY.ko.md](../SECURITY.ko.md) 참고.

## 위협 surface

| Surface | 위험 |
|---------|------|
| HTTP API (`/mcp`, `/v1/*`) | 무단 메모리 read/write; cross-tenant 접근; destructive `compact_memory` apply 또는 governance archive |
| 정적 admin shell (`/admin/memory`) | 브라우저 쪽 토큰 취급; memory governance 중 운영자 실수 |
| MCP stdio | 로컬 전용 (parent process가 binary 실행); parent의 identity 상속 |
| Postgres | 직접 DB 접근은 모든 앱 레이어 컨트롤 우회; 백업 + 제한 |
| Qdrant | vector 접근은 scope/auth 필터 우회; 별도 백업, 네트워크 격리 |
| OpenAI 호출 | embedding용 컨텐츠가 네트워크 외부로; `EMBEDDING_PROVIDER=transformers` 는 의미 있는 semantic embedding을 on-box 유지 (`local` 은 결정론적 CI/오프라인 스텁) |

## 컨트롤

### 인증

`MEMORY_API_TOKENS` 의 bearer 토큰 (콤마 구분, 옵션 `:org` 바인딩).
`timingSafeEqual` constant-time 비교로 timing leak 방지. 다중 토큰 로테이션
지원 (old + new 배포 → 클라이언트 로테이션 → old 제거).

`/healthz`, `/readyz` 는 의도적으로 인증 없음 — 오케스트레이터가 자격 없이
프로빙 가능해야 함.

`MCP_OAUTH_AUTHORIZATION_SERVERS` 가 설정되면 Akasha는 MCP HTTP discovery용
OAuth 2.0 Protected Resource Metadata도 발행하고, `/mcp`, `/v1/*` 의 401
응답에 `WWW-Authenticate` discovery hint를 포함합니다. 같은
`Authorization: Bearer ...` 헤더는 설정된 static token 또는 설정된
authorization server가 발급한 JWT access token을 받습니다. JWT는 issuer JWKS,
정확한 audience (`MCP_OAUTH_RESOURCE_URL`), issuer, expiry / not-before,
algorithm allowlist, tool별 scope로 검증됩니다. Akasha는 inbound MCP bearer
token을 upstream API로 pass-through 하지 않습니다.

OAuth scope는 tool 경계에서 강제됩니다:

- `akasha:read` — 검색, context-pack, list-memory governance review, entity
  graph inspection, goal-run read/context/repeat check, dry-run compaction.
- `akasha:write` — add-memory write와 goal-run start/iteration/close write.
- `akasha:admin` — reindex, unarchive, audit-log 읽기, governance
  update/delete/tag, compaction apply.
- `akasha:memory` — 모든 tool check를 만족하는 호환성 umbrella scope.

OAuth scope가 부족하면 HTTP 403과 함께 클라이언트가 요청해야 할 scope를 담은
Bearer `insufficient_scope` `WWW-Authenticate` challenge를 반환합니다.

### HTTP attack surface

`/mcp` 는 MCP Streamable HTTP 엔드포인트이며 로컬 MCP stdio가 아니라 `/v1/*`
처럼 취급해야 합니다. Static token 또는 OAuth token validation이 설정되어 있으면
`/mcp` 에 bearer auth가 필요합니다. `/mcp` 는 JSON HTTP 와 같은 rate limiter를
공유합니다. Loopback bind에서는 Host validation이 자동 적용되어 `/mcp` 가 auth,
rate limiting, MCP transport에 도달하기 전에 `localhost`, `127.0.0.1`,
`[::1]` hostname만 허용합니다. `src/app/mcp-http.ts` 의 Origin validation은 계속
신뢰하지 않는 browser-origin 요청을 MCP transport에 도달하기 전에 거부합니다.

`/healthz`, `/readyz` 는 계속 인증이 없습니다. 빈 토큰 목록은 loopback 로컬
개발에서만 허용되며, non-loopback bind는 fail closed 됩니다.
OAuth protected-resource metadata endpoint도 의도적으로 인증이 없으며,
설정된 issuer/resource/scope metadata만 노출하고 secret은 노출하지 않습니다.

`/admin/memory` 는 인증 없는 정적 HTML 셸입니다. memory data나 token을 embed하지
않습니다. 운영자가 페이지에 bearer token을 붙여넣으면, 페이지는 현재 브라우저
런타임에서만 이를 사용해 인증이 필요한 `/v1/*` governance route를 호출합니다.
`localStorage` 또는 `sessionStorage` 는 사용하지 않습니다.

### 멀티-테넌트 격리

레코드 보유 테이블 모두 `organization_id` 보유. SQL 쿼리는 read/write 모두에서
`WHERE organization_id = $org` 강제. 토큰-org 바인딩은 라우트 레이어
(`src/app/routes/memory.ts`) 에서 검증 — body / `x-organization-id` 헤더가
바인딩 org와 다르면 핸들러 실행 전 403.

Compaction apply 경로는 `memory_archive` 에 쓸 때 `organization_id` 를
caller 토큰이 아닌 canonical 레코드 자체 (DELETE RETURNING) 에서 읽음 —
defense-in-depth.

### Fail-closed startup gate

`MEMORY_API_TOKENS` 와 OAuth token validation이 모두 없을 때
`startOperatorServer` 는 non-loopback 호스트 (`HOST=0.0.0.0`, `HOST=10.x.x.x`
등) 바인딩 거부. loopback dev + 빈 토큰은 허용; 실수로 zero-auth public 노출
안 됨.

### HTTP body 검증

`/v1/memory/compact` 는 `dryRun: "false"` (문자열), `dryRun: 0`, 그 외
non-strict-boolean 값 거부. `true` / `false` / 생략 (기본 `true`) 만 핸들러로
도달. 우발적 type-coerced destructive 실행 방지.

### 의존성 보안과 SDK 검증

2026-10-25 CI의 필수 audit가 `body-parser`와 Zod의 high 취약점을 보고했습니다.
이는 해당 공격이 Akasha에서 재현됐다는 뜻은 아니며, 설치 그래프의 보안 문제와
실제 도달 가능성은 구분합니다. audit 예외나 강제 peer 무시로 통과시키지 않습니다.

[body-parser 권고](https://github.com/advisories/GHSA-27r3-jxmh-p828)의 수정 버전
2.4.0은 기존 Express 의존 범위 안에 있어 lock만 갱신합니다.
[Zod 권고](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)는 4.6.6 이상을 요구해
4.6.7을 선택했습니다. 소스의 기존 `zod/v4` import는 유지합니다.
[상위 수정 a0ebf97](https://github.com/colinhacks/zod/commit/a0ebf970f2d752e5f58527cd2942ff48be4f46bd)은
컬렉션 상한을 원소 처리 전에 확인합니다. 이 수정이 HTTP body 크기 제한이나
애플리케이션의 입력 검증을 대체하지는 않습니다.

OpenAI SDK 4.104.0과 직전 5.23.2는 Zod 3 peer만 선언하므로 Zod만 올리는 안은
선택하지 않았습니다. [6.0.0](https://github.com/openai/openai-node/blob/v6.0.0/CHANGELOG.md)은
Zod 4 호환을 추가합니다. 별도 HTTP 어댑터를 만들어 재시도·오류 처리를 재구현하는
대신 이 SDK를 유지하며, `src/embedding/openai-embeddings.ts`의 단건·배치 인터페이스는
변경하지 않습니다. 라이선스는 기존과 같은 Apache-2.0이며 Zod는 MIT입니다.

SDK 교체에서는 `createClient` 가짜 객체의 통과만으로 충분하지 않습니다. 예를 들어
가짜 응답이 숫자 배열이면 실제 SDK의 base64 디코딩 실패를 놓칠 수 있습니다.
`tests/embedding/openai-embeddings.test.ts`는 실제 기본 SDK 생성 경로에 가짜 fetch를
설치해 요청 본문·인증 헤더, 단건·배치 순서와 숫자 변환, 401 오류 전파를 확인합니다.
시험용 loopback base URL을 사용하고 전역 mock을 복원하며, 유료 API는 호출하지 않습니다.
이는 실제 공급자 서비스 검증이 아닙니다. 최종 의존 트리·audit와 Node 22/24의
스키마·MCP·HTTP 계약 검사 결과는 `GATES.md`가 소유합니다.

### 컨테이너 런타임 하드닝

production app 컨테이너는 non-root 사용자로 실행됩니다. 이 기본값을 유지하고,
배포 전에는 모든 개발용 자격증명을 교체하며, 명시적 필요가 없다면 writeable
secret 마운트나 Docker socket 마운트는 피하세요.

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

`RATE_LIMIT_PER_MINUTE` 의 토큰별 bucket (token-bucket). 이 bucket은
in-memory이고 프로세스-local입니다. 다중 replica 배포에서는 app replica마다
bucket이 하나씩 생기므로, 배포 전체의 엄격한 quota가 필요하면 공유
reverse-proxy 또는 edge limiter를 사용하세요. Apply 경로는 추가로 org당
1회/시간 제한 (기본, `applyCompaction` deps에서 설정 가능).

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
  `MCP_OAUTH_RESOURCE_URL` 은 클라이언트가 token을 요청할 public HTTPS URL로
  설정하세요.
- **HTTP API에 CSRF 보호 없음.** API는 bearer-only; 쿠키 미사용. 토큰 저장
  브라우저 클라이언트 빌드 시 브라우저 환경이 attack surface (XSS = 토큰 절도).
  short-lived 토큰 + 로테이션 사용.
- **Embedding provider가 컨텐츠를 봄.** `EMBEDDING_PROVIDER=openai` 시 모든
  레코드 컨텐츠가 OpenAI에 전송. 컴플라이언스가 금지하면 의미 있는 로컬 semantic
  embedding에는 `transformers` 를 사용. `local` 은 retrieval 품질이 중요하지
  않은 결정론적 CI/오프라인 스텁 용도.
- **at-rest 토큰 저장** 은 앱 사이드 (env, .env 파일). KMS 연동은 Akasha 외부에서
  수행합니다.
- **백업에는 memory content 포함.** `BACKUP_ENCRYPTION_KEY_FILE` 을 설정하면
  off-host copy 전에 Postgres dump와 Qdrant snapshot을 AES-256-GCM으로
  암호화합니다. 데이터 분류상 필요하면 디스크 / 볼륨 레벨 암호화도 적용하세요.
  KMS 배포에서는 backup data key를 이 파일로 제공하세요.
- **검색된 memory는 untrusted context.** Context pack은 명시적인 trust-boundary
  notice를 포함하고, "ignore previous instructions" 같은 prompt-injection 유사
  memory text에 경고 라벨을 붙여 에이전트가 저장된 memory를 실행할 지시문이
  아닌 note로 취급하게 합니다.
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
