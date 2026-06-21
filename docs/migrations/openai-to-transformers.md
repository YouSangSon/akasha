> **English** | [한국어](openai-to-transformers.ko.md)

# Switching between OpenAI and Transformers embedding providers

The default `EMBEDDING_PROVIDER` is `transformers` (free local ONNX,
`Xenova/all-MiniLM-L6-v2`, 384-dim). The `openai` provider
(`text-embedding-3-small`, 1536-dim, paid) is a fully-supported opt-in.

This guide covers switching between the two. The Qdrant collection's
vector size is fixed at creation time, so any switch that crosses
dimensions (transformers ↔ openai) needs three operational steps:

1. Recreate the Qdrant collection at the new dimension.
2. Update `.env` to point at the new provider.
3. Reindex the existing canonical chunks (Postgres preserves them across
   any switch — only Qdrant points get rebuilt).

Two paths follow — pick the direction you're going.

---

## Path A — Switch to OpenAI (transformers → openai)

Use this when you want hosted OpenAI quality for retrieval.

If you have **no existing memories yet** (fresh install), it's two lines
in `.env`:

```bash
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

Restart the server. The `@huggingface/transformers` dependency is
installed (~50MB on disk) but never loaded at runtime when the provider
is set to `openai`.

If you **already wrote memories under transformers** (384-dim) and want
to switch, follow the operational steps from Path B below — but invert
the dimensions: in Step 2 use `size=1536` instead of `size=384`, and in
Step 3 set `EMBEDDING_PROVIDER=openai` with `OPENAI_API_KEY`.

---

## Path B — Switch to Transformers (openai → transformers, or rebuild the default)

You'll need ~2 minutes of downtime, the Qdrant API endpoint reachable, and
the existing canonical text intact in Postgres (which it is — chunks live
in `memory_chunks` independently of Qdrant).

### Step 1 — Stop the running server

```bash
# If you run via Docker Compose:
docker compose stop app

# If you run via npm directly:
# (Ctrl-C the dev:server, or systemctl stop, etc.)
```

### Step 2 — Recreate the Qdrant collection with the new dimension

The Qdrant collection's vector size is fixed at creation time. Delete the
existing 1536-dim collection and recreate it as 384-dim before transformers
vectors can be written. (For the inverse path A → 1536-dim, swap the size.)

```bash
# Set these from your .env:
QDRANT_URL=${QDRANT_URL:-http://localhost:6333}
QDRANT_API_KEY=${QDRANT_API_KEY:-local-qdrant-key}
QDRANT_COLLECTION_NAME=${QDRANT_COLLECTION_NAME:-memory_chunks_v1}

# Delete the old collection (drops all Qdrant points — Postgres untouched).
curl -fsS -X DELETE \
  -H "api-key: ${QDRANT_API_KEY}" \
  "${QDRANT_URL}/collections/${QDRANT_COLLECTION_NAME}"

# Recreate with size=384, cosine distance (matches the new default).
curl -fsS -X PUT \
  -H "api-key: ${QDRANT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"vectors":{"size":384,"distance":"Cosine"}}' \
  "${QDRANT_URL}/collections/${QDRANT_COLLECTION_NAME}"
```

> **Tip:** If you'd rather keep the old 1536-dim collection around for
> rollback, bump `QDRANT_COLLECTION_NAME` in `.env` to a new value (e.g.
> `memory_chunks_v2`) instead of deleting. The new collection is created
> on first reindex; the old one stays untouched.

### Step 3 — Update `.env`

Either delete the line (the new default kicks in) or set it explicitly:

```bash
EMBEDDING_PROVIDER=transformers
# Optional override (default below):
# TRANSFORMERS_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
```

`OPENAI_API_KEY` can be commented out unless you still use it elsewhere.

### Step 4 — Pull the new code and install

```bash
git pull
npm install   # picks up @huggingface/transformers (~50MB onnxruntime-node)
npm run build
```

### Step 5 — Restart the server

```bash
docker compose up -d app
# or:
npm run start:server
```

The first call to any tool that writes a memory (e.g. `add_memory` or
`reindex_memory`) triggers a one-time download of the
`Xenova/all-MiniLM-L6-v2` model (~22MB) into
`~/.cache/huggingface/hub/`. Subsequent calls hit the cached model.

### Step 6 — Reindex existing memories

Postgres still holds the canonical chunk text from your old data — you just
need to re-embed it under the new model and write the new vectors into the
recreated Qdrant collection.

```bash
# Via the CLI:
node dist/src/cli.js reindex --scope-type=org --scope-id=default

# Or via the MCP tool, for each scope you want to reindex:
#   reindex_memory({ scopes: [{ scope_type: "org", scope_id: "default" }] })

# Or via the HTTP route:
curl -fsS -X POST \
  -H "Authorization: Bearer ${MEMORY_API_TOKENS}" \
  -H "Content-Type: application/json" \
  -d '{"scopes":[{"scope_type":"org","scope_id":"default"}]}' \
  "http://localhost:${PORT:-8787}/v1/memory/reindex"
```

The reindex enumerates every chunk in the given scope, embeds it with the
currently-configured provider (now transformers/384-dim), and upserts the
fresh points into Qdrant. Idempotent — safe to re-run.

### Step 7 — Sanity check

```bash
# Should return search results with non-empty score:
curl -fsS -X POST \
  -H "Authorization: Bearer ${MEMORY_API_TOKENS}" \
  -H "Content-Type: application/json" \
  -d '{"query":"any text from a known memory","scopes":[...]}' \
  "http://localhost:${PORT:-8787}/v1/memory/search"
```

If results come back empty, check:

1. The Qdrant collection has size=384:
   `curl -H "api-key:..." ${QDRANT_URL}/collections/${QDRANT_COLLECTION_NAME}`
   and look at `vectors.size`.
2. `chunkCount` from the reindex response matches the row count in
   `SELECT COUNT(*) FROM memory_chunks WHERE organization_id = '...'`.
3. The server logs don't show "dim mismatch" errors — those mean Qdrant
   still expects 1536.

---

## Why transformers is the default

A cross-OSS survey of 11 peer projects (Chroma, txtai, mem0, Letta, Zep,
LlamaIndex, LangChain, doobidoo/mcp-memory-service, etc.) found that the
**MCP memory server category** norm is *free/local default*. The largest
vector-using MCP memory server (doobidoo, 1.7k★) headlines `$0` cost and
`100% local` as its differentiator. Akasha follows that convention
so OSS users get value from `npm install` without a paid API key. OpenAI
remains a fully supported, well-documented option for operators who prefer
hosted-provider quality.

The chosen model (`Xenova/all-MiniLM-L6-v2`) is the same convergent default
picked by Chroma (bundled ONNX), txtai (sentence-transformers fallback),
and doobidoo. 384 dimensions, cosine distance, ~22MB on disk.

---

## Rollback either direction

Postgres canonical text is preserved across every switch in this guide,
so the operation is reversible. To go back to wherever you came from,
follow the same path in the opposite direction: recreate the Qdrant
collection at the original dimension, restore the original `.env`,
reindex.
