> **English** | [한국어](troubleshooting.ko.md)

# Troubleshooting

Common errors and their fixes. If you don't find your issue here, open
an issue using the bug-report template at
[.github/ISSUE_TEMPLATE/bug_report.yml](../.github/ISSUE_TEMPLATE/bug_report.yml).

## Setup errors

### `Docker daemon not running`

`install.sh` aborts with this when `docker info` fails. Start Docker
Desktop (macOS / Windows) or `sudo systemctl start docker` (Linux), then
re-run `./install.sh`.

### `OPENAI_API_KEY in .env is still the placeholder`

`install.sh` refuses to proceed when `.env` contains
`OPENAI_API_KEY=sk-replace-me` (the template default). Edit `.env`,
paste your real key, and re-run.

If you don't want to use OpenAI:
```bash
EMBEDDING_PROVIDER=local
OPENAI_API_KEY=ignored
```

### `Node.js ≥ 20 required`

Upgrade Node. `nvm install 20 && nvm use 20` is the fastest path on
most Unix systems.

### Migrations fail with `ECONNREFUSED 127.0.0.1:5432`

Postgres isn't ready yet. `install.sh` runs `docker compose up -d
postgres qdrant` before migrations, but on slow hardware the healthcheck
may not be green by the time migrations start. Re-run `./install.sh` —
the `up -d` is idempotent and the health gate will succeed on the second
try.

If it fails repeatedly, check `docker compose logs postgres` for
container-level errors.

## Runtime errors

### `MEMORY_API_TOKENS must be set when binding to a non-loopback host`

The fail-closed startup gate. Either:
- Set `HOST=127.0.0.1` (loopback bind, no auth needed for dev), or
- Set `MEMORY_API_TOKENS=...` and bind wherever you want.

### `Missing required environment variable: OPENAI_API_KEY`

Either set the key or switch to local embeddings:
```bash
EMBEDDING_PROVIDER=local
```

### `Unsupported EMBEDDING_PROVIDER: <value>`

Only `openai` or `local` are valid. Check spelling.

### `SecretDetectedError: <category>` (HTTP 400)

Your `add_memory` content matched a secret pattern. Categories:
`openai_key`, `anthropic_key`, `aws_access_key`, `aws_secret`,
`pem_block`, `bearer_token`, `jwt`, `generic_high_entropy`.

The check is intentional — secrets shouldn't end up in vector indexes
or backups. Redact the secret from your content (replace with
`<REDACTED>`) and try again.

### `compaction is already running for this scope`

Two concurrent apply calls on the same `(org, scope)`. Wait and retry.

### `compaction apply is rate-limited; retry in <N>s`

Default is 1 apply / hour / org. Either wait, or call with custom rate
limit deps (custom integrations only).

### HTTP 401 on every request

Token doesn't match any entry in `MEMORY_API_TOKENS`. Re-check casing,
whitespace (split on commas removes outer whitespace, but inner
whitespace is significant), and that the server reloaded the env after
edit (restart the container).

### HTTP 403 with `organizationId mismatch: token is bound to a different organization`

Your token has a `:org` binding (e.g., `dev-token:dev-team`) and the
request body / header asks for a different org. Either:
- Use a token bound to that org, or
- Remove the conflicting `organizationId` from body / header (the bound
  org is auto-injected).

### HTTP 429 with `rate limit exceeded`

`RATE_LIMIT_PER_MINUTE` exhausted for this token. The `Retry-After`
response header tells you when to retry. Use a different token (load
balance) or raise the limit.

### `/readyz` returns 503

A dependency is unreachable. The response body lists which:
```json
{ "success": false, "data": { "checks": [{"name":"qdrant","status":"fail",...}] } }
```

Fix the failing dependency. The app process doesn't need a restart —
the next request after recovery rebuilds the singleton.

## Data issues

### Search returns no results after a fresh `add_memory`

Common causes:
1. **Wrong project key** — `searchMemory` is project-scoped; search the
   exact key you used in `add_memory`.
2. **Embedding provider mismatch** — if you switched `EMBEDDING_PROVIDER`
   without reindexing, old chunks have incompatible vectors. Run
   `reindex_memory`.
3. **Ingest job pending** — `add_memory` returns immediately even if
   chunking / embedding is still in progress. Query
   `SELECT status FROM ingest_jobs WHERE memory_record_id = <id>` to
   confirm completion.

### Duplicate records keep appearing

Compaction is dry-run only by default. Run with `dryRun: false` once
you've reviewed the plan. See [operations.md §Compaction](operations.md#compaction).

### Restored unarchive doesn't show in search

Unarchive creates a NEW `memory_records` row (different id from the
original). Searches by content / scope work; searches by the *original*
id won't find it. Use `sourceRecordId` from the unarchive response to
map old → new.

### `memory_archive` keeps growing unbounded

There's no built-in retention. Add a sweep:

```sql
DELETE FROM memory_archive
WHERE archived_at < NOW() - INTERVAL '180 days'
  AND qdrant_status = 'deleted';
```

(Don't delete rows where `qdrant_status != 'deleted'` — those still
hold the source-of-truth for orphan vectors the sweeper hasn't cleaned
yet.)

## Build / test issues

### `npm run typecheck` fails after a pull

Stale `node_modules` after a dep bump. `rm -rf node_modules && npm
install`.

### Tests fail with `Hook timed out in 10000ms`

The 3 PG-dependent test files time out trying to reach Postgres on
5432. They skip without PG, but the hook timeout itself is what you're
seeing. Bring up Postgres (`docker compose up -d postgres`) or accept
those 3 files as expected-skip.

### `vitest run` hangs

Most often: an `await` somewhere on a never-resolving promise (mock
not configured to resolve). Run with `--reporter=verbose` to see which
test is hung.

## Reporting bugs

If your issue isn't here:

1. Check `docker compose logs app` for the real error (the HTTP 500
   response is sanitized).
2. Reproduce with minimal input (smallest record, smallest scope).
3. Open an issue with: error message, version (`git rev-parse HEAD`),
   reproduction steps, and `EMBEDDING_PROVIDER`.

For security issues, **don't** open a public issue — see
[../SECURITY.md](../SECURITY.md).
