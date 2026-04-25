> [English](SECURITY.md) | **한국어**

# 보안 정책

이 문서는 context-forge의 보안 취약점 리포팅 방법을 다룹니다. 위협 모델과
적용된 컨트롤은 [docs/security.ko.md](docs/security.ko.md) 참고.

## 지원 버전

| 버전 | 지원 |
|------|------|
| 1.0.x | ✅ |
| < 1.0 | ❌ |

## 취약점 리포팅

**보안 보고를 공개 GitHub issue로 열지 마세요.** 공개 issue는 수정 전에
취약점을 노출시켜서 모든 사용자를 위험에 빠뜨립니다.

대신 메인테이너에게 비공개 리포트:

- **GitHub Security Advisory** (권장 — 암호화, 패치 워크플로 통합):
  비공개 advisory 열기 →
  <https://github.com/YouSangSon/context-forge/security/advisories/new>
- 프로젝트 통신 채널이 있다면 메인테이너에게 DM.

리포트에 포함:

- 취약점에 대한 명확한 설명
- 영향받는 버전 (`main` 사용 중이면 `git rev-parse HEAD`)
- 재현 단계, 가능하면 최소 proof-of-concept
- 영향 평가 (공격자가 무엇을 할 수 있는지)
- 알고 있는 mitigation 제안

## 대응 프로세스

1. **확인**: 리포트 후 72시간 이내.
2. **초기 평가**: 7일 이내 — 재현성 확인, 심각도 분류 (CVSS), 수정 타임라인
   결정.
3. **수정 개발**: 비공개 브랜치 / advisory에서.
4. **조율된 공개**: 수정 준비 완료 시 패치 릴리스 발행, `CHANGELOG.ko.md` 의
   `보안` 섹션에 문서화, 리포터 credit (동의 시).

CRITICAL (RCE, 데이터 탈취, auth 우회) 은 확인 후 7일 이내 패치 릴리스 예상.
HIGH 는 30일 이내. MEDIUM/LOW 는 일반 릴리스에 batch 가능.

## Scope 외

다음은 이 프로젝트의 취약점으로 **간주되지 않음**:

- 사용자가 [docs/security.ko.md](docs/security.ko.md) 따라가면 막을 수 있었던
  미스컨피그 (예: `MEMORY_API_TOKENS` 빈 채로 `HOST=0.0.0.0` — fail-closed
  gate가 시작 거부).
- npm으로 받는 third-party 의존성 이슈 — upstream에 보고.
- 비싼 쿼리로 인한 DoS: 프로젝트는 `RATE_LIMIT_PER_MINUTE` 컨트롤 제공;
  배포에 맞게 조정.
- 호스트에 물리 / 권한 접근 필요한 이론적 공격:
  [docs/security.ko.md](docs/security.ko.md) 의 "경계" 섹션 참고.

## Scope

In scope:

- HTTP API (`src/app/`)
- MCP 서버 (`src/mcp/`)
- 도구 핸들러 / 오케스트레이터 (`src/compact/`, `src/store/`,
  `src/search/`, `src/audit/`)
- 마이그레이션 (`src/db/migrations/`)
- 번들 `compose.yaml` (기본 자격증명, 노출 포트)
- `install.sh` (권한 상승, 사용자 입력 command injection)

Out of scope (upstream에 보고):

- Postgres, Qdrant, OpenAI, Node.js core, npm 패키지

## Credit

유효한 이슈를 보고한 보안 연구자는 릴리스 노트에 credit (동의 시). 이
`SECURITY.ko.md` 의 명예 전당이 contributor 를 나열.
