> **English** | [한국어](configuration.ko.md)

# Configuration reference

context-forge is configured entirely through environment variables. There are
no config files or runtime flags. This document is the canonical reference
for every variable the project reads.

For a copy-paste template, see [.env.example](../.env.example) at the repo
root. The `install.sh` wrapper auto-creates `.env` from that template on
first run.

## How config flows

```
.env (your file)
   ├─→ docker compose substitution     (compose.yaml's ${VAR:-default})
   └─→ Node process.env                (read by src/config.ts)
```

Everything inside Postgres / Qdrant containers comes from the compose layer.
The Node app reads from `process.env` directly via `resolveServiceConfig` in
`src/config.ts`. Values supplied to `compose up` propagate to both.

## Validation behavior

Variables marked **required** throw at startup if missing or invalid. This is
intentional — fail-closed beats running with an undefined value silently.

The fail-closed gate also refuses to bind to a non-loopback host
(`HOST=0.0.0.0`, `HOST=10.x.x.x`, etc.) when `MEMORY_API_TOKENS` is empty —
preventing accidental zero-auth public exposure.

## Required

| Variable | Default | Notes |
|---|---|---|
| `MEMORY_API_TOKENS` | — | Comma-separated bearer tokens. See [Auth](#auth) below. |

`OPENAI_API_KEY` is **not** required for default operation. The default
embedding provider is `transformers` (free local ONNX). Set `OPENAI_API_KEY`
only when you set `EMBEDDING_PROVIDER=openai`. See [Embeddings](#embeddings).

## Postgres

The compose-bundled Postgres is the default. Override `DATABASE_URL` to point
at an external instance.

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | (computed) | Full URL. Takes precedence over `POSTGRES_*`. |
| `POSTGRES_USER` | `memory` | |
| `POSTGRES_PASSWORD` | `memory` | Change in production. |
| `POSTGRES_DB` | `memory_os` | |
| `POSTGRES_HOST` | `127.0.0.1` (host process) / `postgres` (compose) | |
| `POSTGRES_PORT` | `5432` | |

When the compose-managed Postgres is used, `DATABASE_URL` is auto-built from
the `POSTGRES_*` parts (with host=`postgres` inside the network). When running
the migration script from the host, `install.sh` rewrites the host to
`127.0.0.1:5432` for reachability.

## Vector backend

| Variable | Default | Notes |
|---|---|---|
| `VECTOR_BACKEND` | `qdrant` | `qdrant` (default) or `pgvector`. When `pgvector`, vectors are stored in Postgres — no Qdrant service needed and Qdrant credentials are not required. Switching backends requires a `reindex_memory`. |

## Qdrant

Qdrant variables are only required when `VECTOR_BACKEND=qdrant` (the default).

| Variable | Default | Notes |
|---|---|---|
| `QDRANT_URL` | `http://localhost:6333` | Inside compose: `http://qdrant:6333`. |
| `QDRANT_API_KEY` | `local-qdrant-key` | Change in production. |
| `QDRANT_COLLECTION_NAME` | `memory_chunks_v1` | Bumping the version triggers a reindex. |

## Server bind (HTTP API)

| Variable | Default | Notes |
|---|---|---|
| `HOST` | `127.0.0.1` | Bind interface. `0.0.0.0` exposes off-box; pair with `MEMORY_API_TOKENS`. |
| `PORT` | `8787` | |
| `NODE_ENV` | unset | `production` enables connection pooling defaults. |

## Embeddings

| Variable | Default | Notes |
|---|---|---|
| `EMBEDDING_PROVIDER` | `transformers` | `transformers` (free local ONNX, default), `openai` (paid API), or `local` (deterministic stub for CI). |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | 1536-dim. Bumping requires reindex. |
| `TRANSFORMERS_EMBEDDING_MODEL` | `Xenova/all-MiniLM-L6-v2` | Hugging Face ONNX model id. 384-dim. Only when `EMBEDDING_PROVIDER=transformers`. |
| `EMBEDDING_DIMENSIONS` | `384` | Vector size for `transformers` and `local` providers. |
| `EMBEDDING_MODEL` | `local-deterministic-v1` | Only meaningful when `EMBEDDING_PROVIDER=local`. |

### Choosing a provider — cost vs. quality vs. setup

| Provider | Cost | Semantic quality | Setup |
|---|---|---|---|
| `openai` | Paid (~cents/month for personal use; verify on [openai.com/api/pricing](https://openai.com/api/pricing)) | Best | Just set `OPENAI_API_KEY` |
| `transformers` | **Free** | Good (close to OpenAI for most workloads) | `npm install @huggingface/transformers` (optional dep, ~50MB onnxruntime + ~22MB model on first call) |
| `local` | Free | **None — semantically meaningless**, exact-match only | Zero setup, but unsuitable for real retrieval |

The `transformers` provider runs `Xenova/all-MiniLM-L6-v2` locally via ONNX —
the same model Chroma and txtai default to. CPU inference is sufficient
(~hundreds of embeddings/second on a laptop). The model and tokenizer are
downloaded once on first call to `~/.cache/huggingface/hub/` and cached.
For air-gapped deployments, pre-populate that cache directory.

**Switching providers requires a reindex** — different vector dimensions or
content semantics produce incompatible Qdrant points. Run
`npm run reindex_memory` (or the `reindex_memory` MCP tool) after switching.
For the v1.0.x → transformers-default upgrade specifically, see the
step-by-step playbook in
[docs/migrations/openai-to-transformers.md](migrations/openai-to-transformers.md)
(includes `curl` commands for recreating the Qdrant collection at the new
dimension).

## Auth

`MEMORY_API_TOKENS` is a comma-separated list of bearer tokens. Each token may
optionally be bound to an organization with `:` syntax:

```bash
# Single token, any org:
MEMORY_API_TOKENS=dev-token

# Multi-token rotation (deploy with both, rotate clients, then drop old):
MEMORY_API_TOKENS=old-token,new-token

# Org-bound (multi-tenant): each token can only read/write its bound org.
MEMORY_API_TOKENS=alpha-token:dev-team,beta-token:finance-team

# Mixed:
MEMORY_API_TOKENS=alpha-token:dev-team,legacy-token
```

When a token has an org binding:
- Requests automatically inherit `organizationId = <bound org>`.
- A request body or `x-organization-id` header that disagrees → **403**.

When a token has no binding (legacy form):
- Requests use `organizationId` from `x-organization-id` header or body.
- If neither supplies one, the default-strict guard refuses the read with a
  clear error pointing the operator at the three available fixes (token-org
  binding, header, body). Bind tokens to orgs in production.
- To opt into the historical org-blind behavior — e.g. a single-tenant
  install with no plans to add a second tenant — set
  `LEGACY_ANONYMOUS_SEARCH=true` in `.env`. The flag is read on every
  request, so flips take effect without a restart. This flag now gates
  **all** read paths: `retrieve_memory` (search), `compact_memory` dry-run
  (`listMemory`), and the vector-hydration step (`getMemoryRecordsByIds`).
  Without it, every read that omits an org throws an operational error.

## Personal / single-tenant use

`organization_id` is just a string label, not a "company" or "account" concept —
there is no separate signup or user system. Every record-bearing table declares
`organization_id TEXT NOT NULL DEFAULT 'default'`, so a request that omits the
org silently lands in the `'default'` tenant. For one-person use you do **not**
need to think about orgs at all.

Three personal setups, in order of increasing isolation:

| Use case | `MEMORY_API_TOKENS` | `HOST` | What you get |
|---|---|---|---|
| Local solo, no auth | (empty) | `127.0.0.1` | All data in `'default'` org. The fail-closed startup gate permits this only on loopback. |
| Local solo, token-protected | `mytoken` (no `:`) | `127.0.0.1` or LAN | Token verified, org label still defaults to `'default'`. |
| Future-proof single tenant | `mytoken:yousang-personal` | any | Already isolated under one named tenant — adding a second person later is one more comma-separated entry, no schema change. |

Multi-tenancy is the **N=1 special case** of the same code path, so there is no
"personal mode" flag and no separate query path to maintain. If you want strict
per-user isolation later (e.g. SaaS-style serving multiple individuals), issue
each person their own `token:org` pair — the org filter at the SQL and Qdrant
layers handles the rest.

## Rate limit

| Variable | Default | Notes |
|---|---|---|
| `RATE_LIMIT_PER_MINUTE` | unset → no limit (compose deployments default to **60**) | Token-bucket cap, keyed per token. Recommended in production. |

The compaction-apply path has a separate, stricter limit (1 per hour per
org by default) hard-coded in `applyCompaction` deps. It can be tuned by
constructing the orchestrator differently in custom integrations.

## Compaction sweeper

The sweeper retries Qdrant cleanup for archived records whose in-line delete
failed. Off by default — opt in on a single replica that runs continuously.

| Variable | Default | Notes |
|---|---|---|
| `COMPACTION_SWEEP_ENABLED` | `false` | Truthy values: `true`, `1`, `yes` (case-insensitive). All others = false. |
| `COMPACTION_SWEEP_INTERVAL_MS` | `30000` | Tick interval. Must be ≥ 1000. |

When enabled, each tick processes up to 100 pending rows and gives up after 5
attempts (rows then move to `qdrant_status='failed'` for ops review).

## Backup

| Variable | Default | Notes |
|---|---|---|
| `BACKUP_DIR` | `./.developer-memory-os/backups` | Where `npm run backup:create` writes. |
| `BACKUP_TARGET_HOST` | unset | Optional rsync target for off-host replication. |

See [docs/operations.md](operations.md) for the backup/restore workflow.

## Common configurations

### Local solo dev (loopback, no auth needed)

```bash
EMBEDDING_PROVIDER=local
MEMORY_API_TOKENS=
HOST=127.0.0.1
```

Loopback bind + empty tokens = the fail-closed gate permits this in dev.
Embedding stays offline. No external API key required.

### Single-user with OpenAI

```bash
OPENAI_API_KEY=sk-...
MEMORY_API_TOKENS=local-dev-token
HOST=127.0.0.1
PORT=8787
```

### Multi-tenant production

```bash
HOST=0.0.0.0
PORT=8787
DATABASE_URL=postgres://memory:STRONG_PW@db.internal:5432/memory_os
QDRANT_URL=https://qdrant.internal:6333
QDRANT_API_KEY=STRONG_QDRANT_KEY
OPENAI_API_KEY=sk-prod-...
MEMORY_API_TOKENS=team-a-token:team-a,team-b-token:team-b,ops-token:ops
RATE_LIMIT_PER_MINUTE=300
COMPACTION_SWEEP_ENABLED=true
NODE_ENV=production
```

Pair with TLS at the reverse proxy layer; see
[docs/deployment.md](deployment.md).
