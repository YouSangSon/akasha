> [English](README.md) | **한국어**

# context-forge

[![CI](https://github.com/YouSangSon/context-forge/actions/workflows/ci.yml/badge.svg)](https://github.com/YouSangSon/context-forge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue.svg)](https://modelcontextprotocol.io/)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)

**AI 코딩 에이전트를 위한 영구 메모리 — 무료, 로컬, 셀프-호스팅.**

Claude Code, Codex CLI, 또는 어떤 MCP 클라이언트에든 붙이면 에이전트가
세션이 끝나도 사라지지 않는 검색 가능한 메모리(결정 사항, 제약 조건,
요약)를 갖게 됩니다. canonical 상태는 Postgres, 벡터 검색은 Qdrant, 임베딩은
ONNX로 로컬 실행 — **API 키 불필요**, 비용 `$0`, 데이터는 본인 머신에서만.

## 다른 도구들과의 비교

| | **context-forge** | doobidoo/mcp-memory-service | coleam00/mcp-mem0 | mem0ai/mem0 | letta-ai/letta | getzep/zep |
|---|---|---|---|---|---|---|
| **즉시 무료 사용** | ✅ | ✅ | ❌ (OpenAI) | ❌ (OpenAI default) | ❌ (hosted) | ❌ (Cloud SaaS) |
| **데이터 본인 머신 저장** | ✅ | ✅ | 부분 (OpenAI 호출) | 부분 (OpenAI 호출) | ❌ (Letta Cloud) | ❌ (Zep Cloud) |
| **MCP-native 프로토콜** | ✅ | ✅ | ✅ (Mem0 wrap) | wrapper 전용 | wrapper 전용 | ❌ |
| **즉시 멀티테넌트** | ✅ (`organization_id`, token-org 바인딩, SQL + vector 양 계층 필터) | ❌ | Mem0 의존 | ✅ | ✅ | ✅ |
| **Postgres + vector 백엔드** | ✅ (Qdrant 기본; Postgres 단독 배포 옵션 pgvector) | SQLite-vec | Supabase + pgvector | varies | varies | proprietary |
| **OSS 경로 active 유지** | ✅ | ✅ | ✅ (template repo) | ✅ | ✅ | ❌ (CE 2025 deprecated) |

MCP 메모리 생태계 norm 은 *무료/로컬 default* — doobidoo (1.7k★) 가 `$0`
cost 를 헤드라인으로 사용, 수렴 무료 임베딩 모델 (`all-MiniLM-L6-v2`)도
context-forge 가 같이 채택. context-forge 가 distinctively 더 나아간 점:
**vector index 와 분리된 Postgres canonical store** (Qdrant collection 재구축
시 데이터 손실 0, reindex 는 도구 1번 호출), **SQL + vector 양 계층의
org-scoped 멀티테넌시** (peers 는 skip 하거나 upstream 프레임워크에 의존),
**wrapper 가 아닌 MCP-native** (프로토콜과 메모리 엔진 사이 shim 없음).
두 번째 서비스가 번거로운 환경에서는 `VECTOR_BACKEND=pgvector` 로 벡터를
Postgres 에 저장할 수 있습니다 — Qdrant 불필요.

세련된 UI 가 있는 hosted 메모리 제품이 필요하면 Mem0 또는 Letta. **API
키 불필요한 self-hosted 메모리 MCP 서버**가 필요하면 이것.

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

# 1. env 템플릿 복사 (default 그대로 동작 — OPENAI_API_KEY 는
#    EMBEDDING_PROVIDER=openai 로 바꿀 때만 필요)
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
| Vector index (`src/vector/`) | Qdrant (기본) 또는 pgvector — 청크 임베딩 + 유사도 검색. `VECTOR_BACKEND=pgvector` 로 Postgres 단독 배포 가능. |
| Compaction (`src/compact/`) | 중복 제거 (exact + 시맨틱), decay, archive, unarchive, sweeper |
| Embeddings (`src/embedding/`) | `transformers` (무료 로컬 ONNX, 기본), `openai` (`text-embedding-3-small`), 또는 `local` (CI용 결정론적 stub) |

데이터 흐름: 호출자가 `add_memory` → 레코드는 Postgres에 저장 + 청크 분할 +
임베딩 + Qdrant upsert. `search_memory` → 쿼리 임베딩 → Qdrant 코사인 검색
→ Postgres에서 hydrate → 랭킹 → 반환. 자세한 설계 내용은
[docs/architecture.ko.md](docs/architecture.ko.md) 참고.

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
**필수**: `MEMORY_API_TOKENS`. `OPENAI_API_KEY` 는 선택 사항 — `EMBEDDING_PROVIDER=openai`
일 때만 필요합니다. 그 외에는 합리적인 기본값이 설정되어 있습니다.

## 라이선스

[MIT](LICENSE) — © 2026 YouSangSon.
