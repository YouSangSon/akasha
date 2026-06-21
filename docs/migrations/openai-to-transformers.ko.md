> [English](openai-to-transformers.md) | **한국어**

# OpenAI ↔ Transformers 임베딩 프로바이더 전환

기본 `EMBEDDING_PROVIDER` 는 `transformers` (무료 로컬 ONNX,
`Xenova/all-MiniLM-L6-v2`, 384-dim). `openai` 프로바이더
(`text-embedding-3-small`, 1536-dim, 유료) 는 fully-supported opt-in
입니다.

본 가이드는 두 프로바이더 간 전환을 다룹니다. Qdrant collection 의 vector
size 는 생성 시점에 고정되므로, 차원이 바뀌는 전환(transformers ↔ openai)
은 다음 3 단계가 필요합니다:

1. Qdrant collection 을 새 차원으로 재생성.
2. `.env` 를 새 프로바이더로 갱신.
3. 기존 canonical chunk 들을 reindex (Postgres 는 모든 전환에서 보존됨 —
   Qdrant point 만 재구축).

방향에 따라 두 경로 중 하나를 선택하세요.

---

## 경로 A — OpenAI 로 전환 (transformers → openai)

hosted OpenAI 품질로 검색하고 싶을 때 사용.

**기존 메모리가 없는 fresh install** 이라면 `.env` 두 줄로 끝:

```bash
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

서버 재시작. `@huggingface/transformers` 의존성은 디스크에 ~50MB 설치되어
있지만 `EMBEDDING_PROVIDER=openai` 일 때 런타임에 절대 로드되지 않습니다.

**이미 transformers (384-dim) 로 메모리를 작성한 상태에서 전환** 하려면,
아래 경로 B 의 운영 단계를 그대로 따르되 차원을 반대로: Step 2 에서
`size=384` 대신 `size=1536`, Step 3 에서 `EMBEDDING_PROVIDER=openai` +
`OPENAI_API_KEY` 설정.

---

## 경로 B — Transformers 로 전환 (openai → transformers, 또는 default 재구축)

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

Qdrant collection 의 vector size는 생성 시점에 고정됩니다. transformers
벡터를 쓰기 전에 기존 1536-dim collection 을 삭제하고 384-dim 으로 재생성.
(역방향 경로 A → 1536-dim 이라면 size 만 반대로.)

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

## transformers 가 default 인 이유

11개 OSS peer 프로젝트 (Chroma, txtai, mem0, Letta, Zep, LlamaIndex,
LangChain, doobidoo/mcp-memory-service 등) 조사 결과, **MCP 메모리 서버
카테고리** 의 norm 은 *무료/로컬 default*. 가장 큰 벡터 기반 MCP 메모리
서버 (doobidoo, 1.7k★) 가 `$0` cost 와 `100% local` 을 헤드라인 차별화로
내세움. Akasha 도 이 컨벤션을 따라, OSS 사용자가 유료 API key
없이도 `npm install` 만으로 가치를 얻도록. OpenAI 는 hosted provider 품질을
선호하는 운영자를 위한 fully supported 옵션으로 유지됩니다.

선택한 모델 (`Xenova/all-MiniLM-L6-v2`) 은 Chroma (번들 ONNX), txtai
(sentence-transformers 폴백), doobidoo 가 모두 채택한 **수렴 default**.
384 차원, cosine distance, 디스크 ~22MB.

---

## 양방향 롤백

Postgres canonical 텍스트는 본 가이드의 모든 전환에서 보존되므로 작업은
가역적입니다. 직전 상태로 돌리려면 같은 경로를 반대 방향으로 따라가면
됩니다 — Qdrant collection 을 원래 차원으로 재생성, `.env` 를 원래대로
복원, reindex.
