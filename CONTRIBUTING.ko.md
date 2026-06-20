> [English](CONTRIBUTING.md) | **한국어**

# context-forge에 기여하기

기여해주셔서 감사합니다. 이 문서는 기여물에 대해 기대하는 것, 작동하는 개발
환경 셋업, 그리고 코드베이스가 이미 따르고 있는 컨벤션을 다룹니다.

## 기본 원칙

- **사소하지 않은 변경은 issue 먼저 열어주세요.** 30초 정도의 문제 + 제안
  스케치만 있어도 며칠을 잘못된 방향으로 작업하는 일을 막을 수 있습니다.
- **PR 하나에 하나의 관심사만.** 리팩토링 + 기능 + 의존성 업그레이드를
  한 PR에 섞으면 리뷰도 어렵고 revert도 어렵습니다.
- **새 코드 경로에는 테스트 필수.** 코드베이스에 200+개 단위 테스트가 있고,
  그 기준을 유지하면 회귀를 막는 데 큰 도움이 됩니다.
- **breaking change는 CHANGELOG 노트 없이 머지하지 마세요** (아래 참고).

## 개발 환경

```bash
git clone https://github.com/YouSangSon/context-forge.git
cd context-forge
cp .env.example .env
${EDITOR:-nano} .env       # MEMORY_API_TOKENS 설정 (OPENAI_API_KEY 는 EMBEDDING_PROVIDER=openai 일 때만 필요)
./install.sh
```

자주 쓰는 명령어:

| 목적 | 명령어 |
|------|--------|
| HTTP API watch 모드 | `npm run dev:server` |
| MCP 서버 watch 모드 | `npm run dev:mcp` |
| CLI watch 모드 | `npm run dev:cli` |
| 타입 체크 | `npm run typecheck` |
| 모든 테스트 실행 | `npm run test` |
| 테스트 watch | `npm run test:watch` |
| 마이그레이션 적용 | `npm run db:migrate` |

PG 의존 테스트 3개 (`tests/store/memory-repository.test.ts`,
`tests/jobs/ingest-job-repository.test.ts`, `tests/db/migrate.test.ts`) 는
`127.0.0.1:5432` 에 Postgres가 없으면 skip 됩니다. 로컬에서 돌리려면
`docker compose up -d postgres` 로 실행하세요.

## 코드 컨벤션

### TypeScript

- Strict 모드, `any` 금지, 신뢰할 수 없는 입력에는 `unknown` 후 boundary에서 narrow.
- 함수 ≤ 50줄, 파일 ≤ 800줄 (몇몇 기존 파일은 초과 — 다음 수정 때 분리 우선).
- 불변 업데이트 (`{ ...obj, field: value }`) 사용, 변경(mutation) 피하기.
- `catch (err: unknown)` 항상 사용; bare `catch (e)` 금지.

### 테스트

- Vitest (`tests/**/*.test.ts`).
- Arrange / Act / Assert 구조.
- 설명적인 이름: `it("falls back to substring search when Redis is unavailable", …)`.
- 단위 테스트는 의존성 mock; 통합 테스트는 실제 Postgres + Qdrant
  (환경 가용성 기반 gate, 카테고리 단위로 skip하지 않음).

### Repository 패턴

데이터 액세스는 `src/types.ts` (`MemoryRepository`,
`CanonicalMemoryRepository`) 와 `src/store/memory-archive-repository.ts`
(`MemoryArchiveRepository`) 의 인터페이스 뒤에 있습니다. 새 SQL은 매칭되는
`createXRepository` 팩토리에 넣으세요. 도구 핸들러와 오케스트레이터는 인터페이스를
사용하지 구현체를 직접 쓰지 않습니다.

### 마이그레이션

SQL 파일은 `src/db/migrations/NNN_*.sql` 에 있습니다. 새 마이그레이션은
`007_…sql` 으로 추가하고, `src/db/migrate.ts` 의 `MIGRATION_FILES` 배열과
production fallback용 임베디드 SQL 문자열에도 추가하세요. 모든 마이그레이션
은 idempotent (`CREATE … IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) 이고,
이미 데이터가 있는 DB에서도 안전해야 합니다.

## Pull Request 워크플로

1. `main` 에서 분기 (`feat/something`, `fix/something`, `docs/something`).
2. **커밋**: 큰 squash보다 논리적/원자적 커밋 선호. conventional 접두사 사용:
   - `feat:` 새 사용자 가시 기능
   - `fix:` 버그 수정
   - `refactor:` 행동 변화 없음
   - `docs:` 문서 전용
   - `test:` 테스트 추가/수정
   - `chore:` 의존성, 빌드, 도구
3. push 전에 **테스트 + 타입 체크 로컬 통과**.
4. **CHANGELOG.md**: `## [Unreleased]` 섹션에 사용자 가시 변경사항 한 줄 추가
   (순수 내부 리팩토링은 생략 가능).
5. **PR 설명**: 관련 이슈 링크, 무엇을 / 왜 변경했는지 서술, 작은 테스트 플랜
   체크리스트 포함.

## 버그 리포트 / 기능 요청

`.github/ISSUE_TEMPLATE/` 의 issue 템플릿을 사용해주세요. 보안 이슈는
[SECURITY.md](SECURITY.md) 를 따라주세요 — 공개 이슈로 열지 마세요.

## 라이선스

기여물은 프로젝트와 동일한 [MIT 라이선스](LICENSE) 로 받습니다.
