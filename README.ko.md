> [English](README.md) | **한국어**

# context-forge

AI 코딩 에이전트를 위한 영구 메모리 MCP 서버입니다. Claude Code, Codex CLI,
또는 어떤 MCP 클라이언트에든 붙이면 에이전트가 세션이 끝나도 사라지지 않는
검색 가능한 메모리(결정 사항, 제약 조건, 요약)를 갖게 됩니다. Postgres와
Qdrant 기반의 본격적인 벡터 검색을 사용합니다.

## 왜 필요한가

코딩 에이전트와의 대화는 세션이 끝나는 순간 컨텍스트를 잃습니다.
context-forge는 그 에이전트가 *기억할 가치가 있는 것*을 저장하고 다음에 다시
읽어올 수 있는 장소입니다:

- `add_memory` — 결정, 사실, 요약을 저장
- `search_memory` — 벡터 + scope 필터링 검색
- `build_context_pack` — 새 세션에 주입할 컴팩트한 컨텍스트 팩 생성
- `compact_memory` — 중복 제거 및 decay된 레코드 정리 (apply 또는 dry-run)
- `unarchive_memory` — 아카이빙된 레코드를 복원 (포렌식/실수 복구용)
- `list_audit_log` — 감사 로그 (compliance / 디버깅)

레코드마다 `organization_id`를 가지는 멀티-테넌트, bearer 토큰 인증, 감사 로그,
rate limiting을 갖추고 있습니다. 노트북 위 단일 사용자 MCP 서버부터 회사 인프라
위 멀티 팀 백엔드까지 동일한 코드로 실행되도록 설계되었습니다. 개인 사용자는
org 를 전혀 의식할 필요가 없습니다 —
[개인 / 단일 테넌트 사용](docs/configuration.ko.md#개인--단일-테넌트-사용) 참고.

## 빠른 시작

Docker (Postgres + Qdrant 용) 와 Node.js ≥ 20이 필요합니다.

```bash
git clone https://github.com/YouSangSon/context-forge.git
cd context-forge

# 1. env 템플릿 복사 + OPENAI_API_KEY 최소한 채우기
cp .env.example .env
${EDITOR:-nano} .env

# 2. Postgres + Qdrant 실행 + 마이그레이션 + 빌드
./install.sh

# 3. MCP 클라이언트가 이 서버를 가리키도록 설정.
#    Claude Desktop config에 추가:
cat <<EOF
{
  "mcpServers": {
    "context-forge": {
      "command": "node",
      "args": ["$(pwd)/dist/src/cli.js"]
    }
  }
}
EOF
```

MCP가 아닌 일반 HTTP 클라이언트:
```bash
curl -X POST http://localhost:8787/v1/memory/search \
  -H "Authorization: Bearer $MEMORY_API_TOKENS" \
  -H "Content-Type: application/json" \
  -d '{"projectKey": "my-project", "query": "캐싱은 어떻게 결정했더라"}'
```

## 아키텍처

| 레이어 | 책임 |
|-------|------|
| MCP 서버 (`src/mcp/`) | Claude/Codex CLI용 stdio 도구 surface |
| HTTP 서버 (`src/app/`) | 같은 도구를 JSON-over-HTTP로 노출 |
| Canonical store (`src/store/memory-repository.ts`) | Postgres — 레코드, 소스, ingest job, 감사 |
| Vector index (`src/store/canonical-indexing.ts`) | Qdrant — 청크 임베딩 + 유사도 검색 |
| Compaction (`src/compact/`) | 중복 제거 (exact + 시맨틱), decay, archive, unarchive, sweeper |
| Embeddings (`src/embedding/`) | OpenAI `text-embedding-3-small` 또는 결정론적 로컬 |

데이터 흐름: 호출자가 `add_memory` → 레코드는 Postgres에 저장 + 청크 분할 +
임베딩 + Qdrant upsert. `search_memory` → 쿼리 임베딩 → Qdrant 코사인 검색
→ Postgres에서 hydrate → 랭킹 → 반환. 자세한 설계 문서는
[docs/superpowers/plans/](docs/superpowers/plans/) 참고.

## 자주 쓰는 명령어

```bash
npm run dev:server    # HTTP API (watch 모드)
npm run dev:mcp       # MCP stdio 서버 (watch 모드)
npm run dev:cli       # CLI (watch 모드)
npm run typecheck     # tsc --noEmit
npm run test          # vitest run
npm run db:migrate    # 미적용 마이그레이션 실행
npm run backup:create # Postgres + Qdrant를 BACKUP_DIR로 백업
```

## 설정

모든 옵션은 환경 변수입니다. 전체 목록은 [.env.example](.env.example) 참고.
**필수**: `OPENAI_API_KEY`, `MEMORY_API_TOKENS`. 그 외에는 합리적인 기본값
이 설정되어 있습니다.

## 라이선스

[MIT](LICENSE) — © 2026 YouSangSon.
