> [English](openai-to-transformers.md) | **한국어**

# 마이그레이션: OpenAI → Transformers default (v1.0.x → next)

기본 `EMBEDDING_PROVIDER` 가 `openai` (유료, 1536-dim) → `transformers`
(무료 로컬 ONNX, 384-dim) 로 전환되었습니다. **v1.0.x 에서 default
OpenAI 로 운영 중이던 설치는 breaking change입니다** — 새 default는
384-dim 벡터를 만드는데, 기존 1536-dim Qdrant collection 에 쓰면 거부됩니다.

본 문서는 두 가지 업그레이드 경로와 각각의 운영 절차를 다룹니다.

---

## 경로 A — OpenAI 유지 (마이그레이션 불필요)

v1.0.x 동작을 그대로 유지하려면:

```bash
# .env
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

이걸로 끝. 서버 재시작, Qdrant/Postgres 변경 없음. 새로 추가된
`@huggingface/transformers` 의존성은 설치되지만(이제 일반 `dependencies`
항목), provider 가 `openai` 로 설정되어 있는 한 런타임에 절대 로드되지
않습니다.

---

## 경로 B — Transformers 로 전환 (개인 사용 권장)

다운타임 약 2분, Qdrant API 도달 가능, Postgres에 기존 canonical 텍스트가
유지된 상태(자동 — chunks는 Qdrant 와 독립적으로 `memory_chunks` 에
저장)면 됩니다.

### 1단계 — 실행 중 서버 정지

```bash
# Docker Compose 사용 시:
docker compose stop app

# npm 직접 실행 시:
# (dev:server 는 Ctrl-C, systemctl 사용 시 stop 등)
```

### 2단계 — Qdrant collection 을 새 차원으로 재생성

Qdrant collection 의 vector size는 생성 시점에 고정됩니다. 새 default
벡터를 쓰기 전에 기존 1536-dim collection 을 삭제하고 384-dim 으로
재생성해야 합니다.

```bash
# .env 의 값으로 설정:
QDRANT_URL=${QDRANT_URL:-http://localhost:6333}
QDRANT_API_KEY=${QDRANT_API_KEY:-local-qdrant-key}
QDRANT_COLLECTION_NAME=${QDRANT_COLLECTION_NAME:-memory_chunks_v1}

# 옛 collection 삭제 (Qdrant point 전부 drop — Postgres 는 무관).
curl -fsS -X DELETE \
  -H "api-key: ${QDRANT_API_KEY}" \
  "${QDRANT_URL}/collections/${QDRANT_COLLECTION_NAME}"

# size=384, cosine distance 로 재생성 (새 default 와 일치).
curl -fsS -X PUT \
  -H "api-key: ${QDRANT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"vectors":{"size":384,"distance":"Cosine"}}' \
  "${QDRANT_URL}/collections/${QDRANT_COLLECTION_NAME}"
```

> **팁:** 롤백을 위해 옛 1536-dim collection 을 보존하려면, 삭제 대신
> `.env` 의 `QDRANT_COLLECTION_NAME` 을 새 값(예: `memory_chunks_v2`)
> 으로 변경. 새 collection 은 첫 reindex 시 생성되며, 옛 collection 은
> 그대로 유지됩니다.

### 3단계 — `.env` 갱신

라인을 삭제(새 default 적용) 하거나 명시적으로 설정:

```bash
EMBEDDING_PROVIDER=transformers
# 옵션 override (default 는 아래):
# TRANSFORMERS_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
```

`OPENAI_API_KEY` 는 다른 용도로 쓰지 않는다면 주석 처리 가능.

### 4단계 — 새 코드 pull + 설치

```bash
git pull
npm install   # @huggingface/transformers 받아옴 (~50MB onnxruntime-node)
npm run build
```

### 5단계 — 서버 재시작

```bash
docker compose up -d app
# 또는:
npm run start:server
```

메모리를 쓰는 첫 호출 (`add_memory` 또는 `reindex_memory` 등) 이 일어나면
`Xenova/all-MiniLM-L6-v2` 모델 (~22MB) 을 한 번 다운로드해서
`~/.cache/huggingface/hub/` 에 저장합니다. 이후 호출은 캐시 사용.

### 6단계 — 기존 메모리 reindex

Postgres 에는 canonical chunk 텍스트가 그대로 남아 있으므로, 새 모델로
재임베딩만 해서 재생성된 Qdrant collection 에 쓰면 됩니다.

```bash
# CLI 를 통해:
node dist/src/cli.js reindex --scope-type=org --scope-id=default

# MCP 도구로, reindex 대상 scope 마다:
#   reindex_memory({ scopes: [{ scope_type: "org", scope_id: "default" }] })

# 또는 HTTP 라우트로:
curl -fsS -X POST \
  -H "Authorization: Bearer ${MEMORY_API_TOKENS}" \
  -H "Content-Type: application/json" \
  -d '{"scopes":[{"scope_type":"org","scope_id":"default"}]}' \
  "http://localhost:${PORT:-8787}/v1/memory/reindex"
```

reindex 는 주어진 scope의 모든 chunk를 enumerate, 현재 설정된 provider
(이제 transformers/384-dim) 로 임베딩, fresh point 를 Qdrant 에 upsert.
Idempotent — 재실행 안전.

### 7단계 — 정상 동작 확인

```bash
# 빈 결과가 아니라 score가 있는 결과가 와야 함:
curl -fsS -X POST \
  -H "Authorization: Bearer ${MEMORY_API_TOKENS}" \
  -H "Content-Type: application/json" \
  -d '{"query":"이미 저장된 메모리에 있는 텍스트","scopes":[...]}' \
  "http://localhost:${PORT:-8787}/v1/memory/search"
```

빈 결과가 오면 확인 사항:

1. Qdrant collection 이 size=384 인지:
   `curl -H "api-key:..." ${QDRANT_URL}/collections/${QDRANT_COLLECTION_NAME}`
   응답의 `vectors.size` 확인.
2. reindex 응답의 `chunkCount` 가
   `SELECT COUNT(*) FROM memory_chunks WHERE organization_id = '...'`
   결과와 일치하는지.
3. 서버 로그에 "dim mismatch" 에러가 없는지 — 있으면 Qdrant 가 여전히
   1536 을 기대 중.

---

## 변경 배경

11개 OSS peer 프로젝트 (Chroma, txtai, mem0, Letta, Zep, LlamaIndex,
LangChain, doobidoo/mcp-memory-service 등) 조사 결과, **MCP 메모리 서버
카테고리** 의 norm 은 *무료/로컬 default*. 가장 큰 벡터 기반 MCP 메모리
서버 (doobidoo, 1.7k★) 가 `$0` cost 와 `100% local` 을 헤드라인 차별화로
내세움. context-forge 도 이 컨벤션을 따라, OSS 사용자가 유료 API key
없이도 `npm install` 만으로 가치를 얻도록. OpenAI 는 hosted provider 품질을
선호하는 운영자를 위한 fully supported 옵션으로 유지됩니다.

선택한 모델 (`Xenova/all-MiniLM-L6-v2`) 은 Chroma (번들 ONNX), txtai
(sentence-transformers 폴백), doobidoo 가 모두 채택한 **수렴 default**.
384 차원, cosine distance, 디스크 ~22MB.

---

## 롤백

문제가 생기면, 경로 B 진입 후에도 경로 A (OpenAI 유지) 를 롤백으로 사용
가능 — `EMBEDDING_PROVIDER=openai`, Qdrant collection 을 `size=1536` 으로
재생성, reindex 만 하면 됨. Postgres 데이터는 처음부터 끝까지 unchanged.
