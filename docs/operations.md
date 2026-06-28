> **English** | [한국어](operations.ko.md)

# Operations runbook

Day-2 procedures for running Akasha in production. For initial
deployment see [deployment.md](deployment.md).

## Backup

```bash
npm run backup:create
```

With `VECTOR_BACKEND=qdrant`, `npm run backup:create` captures Postgres
(`pg_dump` piped through gzip) plus Qdrant snapshot data into `BACKUP_DIR`,
then writes a manifest with checksums. Files are named
`postgres-YYYYMMDD-HHMM.sql.gz`, `qdrant-YYYYMMDD-HHMM.snapshot`,
`qdrant-memory_chunks_v1-YYYYMMDD-HHMM.json` (metadata sidecar), and
`manifest-YYYYMMDD-HHMM.json`.

With `VECTOR_BACKEND=pgvector`, vectors live in Postgres; Qdrant snapshot data
is not part of the logical data path. `npm run backup:create` skips
`scripts/snapshot-qdrant.sh` for pgvector manifests, so pgvector backups require
`DATABASE_URL` and `BACKUP_DIR` but do not require `QDRANT_URL`. Use
`npm run backup:create:qdrant` or `npm run backup:create:pgvector` to force a
specific backend regardless of environment defaults.

### Schedule

Cron example (daily at 03:00):

```cron
0 3 * * * cd /opt/akasha && /usr/bin/npm run backup:create >>/var/log/akasha-backup.log 2>&1
```

systemd timer alternative — see [docs/self-hosted-operations.md](self-hosted-operations.md)
for a working unit file.

### Off-host replication

Set `BACKUP_TARGET_HOST=user@host` in `.env` and the script appends an
scp copy after the local snapshot completes. Requires SSH key auth (no
passphrase) scoped to the destination's backup directory.

### Retention

The script does **not** auto-prune old backups. Manage retention with a
sibling cron job:

```cron
# Keep 30 days of backups
0 4 * * * find /var/lib/developer-memory-os/backups -mtime +30 -delete
```

### Verification

`npm run backup:verify` validates the newest manifest is less than 24 hours
old, verifies local artifact checksums, and verifies the off-host copies on
`BACKUP_TARGET_HOST`. Run it at the end of every backup cycle:

```cron
5 3 * * * cd /opt/akasha && /usr/bin/npm run backup:verify
```

## Restore

### Smoke test (recommended weekly)

```bash
npm run restore:smoke
```

Spins up an isolated compose stack (`compose.restore-smoke.yaml`),
restores the latest backup, and runs assertions against the restored
data. **Doesn't touch production.** Treat any failure as a critical
alert — your backups are unreliable. Qdrant manifests require
`RESTORE_QDRANT_URL` and `RESTORE_SMOKE_QDRANT_RESTORE_CMD`; pgvector manifests
skip the Qdrant restore step and validate with `VECTOR_BACKEND=pgvector`.

### Production restore

```bash
# 1. Stop traffic to the bad instance.
docker compose stop app

# 2. Drop and recreate Postgres data dir; restore from the gzip SQL dump.
docker compose down -v postgres
docker compose up -d postgres
gunzip -c /var/lib/developer-memory-os/backups/postgres-YYYYMMDD-HHMM.sql.gz \
  | docker compose exec -T postgres psql -U memory -d memory_os

# 3. Restore Qdrant snapshot when VECTOR_BACKEND=qdrant.
QDRANT_COLLECTION_NAME=${QDRANT_COLLECTION_NAME:-memory_chunks_v1}
docker compose exec qdrant curl -X POST \
  "http://localhost:6333/collections/${QDRANT_COLLECTION_NAME}/snapshots/upload?priority=snapshot" \
  -F snapshot=@/var/lib/developer-memory-os/backups/qdrant-YYYYMMDD-HHMM.snapshot

#    For VECTOR_BACKEND=pgvector, vectors are in the Postgres dump; skip this step.

# 4. Verify and resume traffic.
docker compose start app
curl http://localhost:8787/readyz
```

For complete recovery from a destroyed host, follow [deployment.md
§Disaster recovery](deployment.md#disaster-recovery).

## Compaction

Two-phase model: **dry-run first, apply second.**

### Routine compaction (manual review)

```bash
# Dry-run shows what would be archived.
curl -X POST http://localhost:8787/v1/memory/compact \
  -H "Authorization: Bearer $MEMORY_API_TOKENS" \
  -H "Content-Type: application/json" \
  -d '{"projectKey": "my-project"}' | jq

# Reviewing duplicateGroups + decayCandidates...

# Apply once satisfied.
curl -X POST http://localhost:8787/v1/memory/compact \
  -H "Authorization: Bearer $MEMORY_API_TOKENS" \
  -H "Content-Type: application/json" \
  -d '{"projectKey": "my-project", "dryRun": false}' | jq
```

Default rate limit: 1 apply / hour / org. Tune via custom orchestrator
deps if needed.

### Sweeper backlog

After an apply with Qdrant failures, `applyStats.qdrantPointsPending`
reports the backlog. Enable the sweeper to drain it:

```bash
COMPACTION_SWEEP_ENABLED=true
COMPACTION_SWEEP_INTERVAL_MS=30000
npm run start:worker
```

You can set the same env vars on one HTTP replica instead. In multi-replica
deploys, prefer one dedicated worker process and leave the flags disabled on
request-serving replicas.

Each tick atomically claims pending archive rows and pushes
`qdrant_next_retry_at` into a short visibility window. If a worker crashes
after claim, the row becomes due again when that window expires.

Then check the signal that matches where the sweeper runs. Sweeper loops emit
process log events, not audit-log rows. For an HTTP replica running the sweeper,
inspect the app logs:

```bash
docker compose logs --no-log-prefix --since 10m app \
  | jq 'select(.event=="compact.sweep_tick" or .event=="compact.sweep_tick_failed")'
```

In-process HTTP sweeper tick metrics are available on the HTTP process's
`/metrics` endpoint only when that process runs the sweeper:

```bash
curl -s http://localhost:8787/metrics \
  | grep '^akasha_sweeper_.*worker="compaction"'
```

Dedicated worker mode is different: use worker process logs for tick activity
from `npm run start:worker`, and use HTTP `/metrics` only for backlog gauges
such as `akasha_background_queue_rows{queue="compaction",...}`. Do not use the
HTTP `app` service logs as the dedicated-worker source unless that service is
the worker.

### Stuck rows

Rows with `qdrant_status='failed'` (5+ retries) need manual review:

```sql
SELECT id, organization_id, qdrant_attempt_count, qdrant_last_error
FROM memory_archive
WHERE qdrant_status = 'failed'
ORDER BY archived_at DESC;
```

Likely causes: Qdrant collection name mismatch (after a `QDRANT_COLLECTION_NAME`
change), permanent Qdrant outage, or schema drift. Once root cause is fixed,
manually `UPDATE memory_archive SET qdrant_status='pending'` to re-enqueue.
Treat failed rows as an operator-review queue rather than a silent background
retry forever.

## Ingest sweeper

`add_memory` records a write-ahead ingest job before vector upsert. If the
process crashes after Postgres commit but before vector indexing completes,
the ingest sweeper re-embeds those committed chunks and writes them to the
active vector backend.

Enable it on exactly one continuously-running replica:

```bash
INGEST_SWEEP_ENABLED=true
INGEST_SWEEP_INTERVAL_MS=30000
npm run start:worker
```

For a shared worker process, set both ingest and compaction sweeper flags in the
same environment. For the old single-process topology, set them on one HTTP
replica instead.

Check failed ingest rows:

```sql
SELECT id, organization_id, memory_record_id, qdrant_attempts, qdrant_last_error
FROM ingest_jobs
WHERE qdrant_status = 'failed'
ORDER BY updated_at DESC;
```

After fixing the underlying cause, re-enqueue a row by setting
`qdrant_status='pending'`, `qdrant_next_retry_at=NOW()`, and clearing
`qdrant_last_error` if the old message is no longer useful.

## Memory governance

Open the static operator shell at:

```text
http://localhost:8787/admin/memory
```

The shell itself is unauthenticated and embeds no memory data or token. Enter
the API URL, bearer token, organization, and scope in the page; the actual
list/edit/tag/archive actions call the authenticated `/v1/*` governance API.
The page keeps the token only in the current browser runtime.

CLI equivalents:

```bash
# Review records, optionally filtering by tag or archived state.
curl -X POST http://localhost:8787/v1/memory/list \
  -H "Authorization: Bearer $MEMORY_API_TOKENS" \
  -H "Content-Type: application/json" \
  -d '{"projectKey": "my-project", "tag": "ops", "limit": 50}' | jq

# Edit content or metadata. This refreshes entity and vector state.
curl -X POST http://localhost:8787/v1/memory/update \
  -H "Authorization: Bearer $MEMORY_API_TOKENS" \
  -H "Content-Type: application/json" \
  -d '{"memoryId": 42, "summary": "Updated operational summary"}' | jq

# Replace governance tags.
curl -X POST http://localhost:8787/v1/memory/tag \
  -H "Authorization: Bearer $MEMORY_API_TOKENS" \
  -H "Content-Type: application/json" \
  -d '{"memoryId": 42, "tags": ["ops", "reviewed"]}' | jq

# Archive one record through the recoverable archive path.
curl -X POST http://localhost:8787/v1/memory/delete \
  -H "Authorization: Bearer $MEMORY_API_TOKENS" \
  -H "Content-Type: application/json" \
  -d '{"memoryId": 42}' | jq
```

`list_memory` and `inspect_memory_graph` are read-scoped for OAuth.
`update_memory`, `delete_memory`, and `tag_memory` require admin scope. If
`delete_memory` reports
`qdrantPointsPending > 0`, enable the compaction sweeper and use the same
"Stuck rows" checks as compaction cleanup.

## Unarchive

Restore archived records when an apply was a mistake:

```bash
# Find recent archives:
psql -c "SELECT id, source_record_id, archive_reason, archived_at
         FROM memory_archive
         WHERE organization_id='dev-team'
           AND archived_at > NOW() - INTERVAL '1 hour'
         ORDER BY archived_at DESC;"

# Restore them:
curl -X POST http://localhost:8787/v1/memory/unarchive \
  -H "Authorization: Bearer $MEMORY_API_TOKENS" \
  -d '{"archiveIds": [42, 43, 44]}' | jq
```

The restored records get fresh BIGSERIAL ids; the response maps each to
its original `sourceRecordId` so callers can update references.

## Monitoring

### Process logs

Akasha writes pino JSON to **stderr**. Wire your aggregator to
collect stderr from the app container:

```bash
docker compose logs --since 1h app | jq 'select(.level >= 40)'  # warn+
```

Key event names to monitor:

| Event | Severity | Action |
|---|---|---|
| `auth.disabled` | warn | Expected only in dev. In prod = misconfig. |
| `compact.qdrant_delete_failed` | warn | Sweeper will retry. |
| `compact.sweep_giveup` | warn | Manual investigation (see "Stuck rows"). |
| `ingest.sweep_giveup` | warn | Manual investigation (see ingest failed rows). |
| `compact.unarchive_failed` | error | Per-archive failure; check the response outcomes. |
| `http.unhandled` | error | Unexpected exception in an HTTP handler. |
| `compact.sweep_tick_failed` | error | Sweeper threw; loop continues. |
| `ingest.sweep_tick_failed` | error | Ingest sweeper threw; loop continues. |

### Health probes

- `GET /healthz` — process is alive (always 200 once up).
- `GET /readyz` — readiness gate. Always probes Postgres. It also probes
  Qdrant when `VECTOR_BACKEND=qdrant` and OpenAI when
  `EMBEDDING_PROVIDER=openai`. `VECTOR_BACKEND=pgvector` deployments do not
  require Qdrant for readiness. Returns 200 when all active probes pass, 503
  when any active dependency is unreachable.

### Metrics

`GET /metrics` exposes native Prometheus text exposition
(`text/plain; version=0.0.4`) and is unauthenticated like `/healthz` and
`/readyz`.

Key series:

- `akasha_http_requests_total{method,route,status}`
- `akasha_http_request_duration_seconds_count{method,route,status}`
- `akasha_http_request_duration_seconds_sum{method,route,status}`
- `akasha_sweeper_ticks_total{worker,status}`
- `akasha_sweeper_tick_duration_seconds_count{worker,status}`
- `akasha_sweeper_tick_duration_seconds_sum{worker,status}`
- `akasha_sweeper_rows_total{worker,outcome}`
- `akasha_background_queue_collect_success`
- `akasha_background_queue_rows{queue,state}`
- `akasha_dependency_up{name="postgres"}`
- `akasha_dependency_check_duration_seconds{name="postgres"}`

HTTP labels are deliberately low-cardinality and privacy-safe. `route` is a
static route name (`/v1/memory/search`, `/mcp`, `/healthz`, `/readyz`,
`/admin/memory`, `/metrics`, or `unknown`), never the raw URL or query string.
Metrics do not include bearer tokens, organization IDs, request bodies, search
queries, or memory content.

Sweeper metrics are emitted only after a loop tick has run in the HTTP process.
`worker` is `compaction` or `ingest`; `status` is `success` or `error`;
`outcome` is a bounded row outcome such as `scanned`, `cleaned`, `completed`,
`retried`, or `failed`. If both sweepers are disabled, these series stay empty.

The dedicated `npm run start:worker` process currently has no HTTP metrics
listener. Prometheus scrape configs scrape configured targets; a process without
an HTTP listener is not a scrape target. Add a worker-local metrics endpoint or
sidecar only if Prometheus must scrape per-worker tick counters from that
process.

Background queue gauges are collected on each `/metrics` scrape from Postgres.
`queue` is `ingest` or `compaction`; `state` is `pending`, `due`, or `failed`.
`due` means work is eligible for the next sweeper claim. If collection fails,
`akasha_background_queue_collect_success` is `0` and the scrape still returns
200 with no error details in the metrics body.

Dependency gauges use the most recent `/readyz` report. If `/readyz` has not
run yet, dependency metrics are omitted. `/metrics` does not call readiness
probes for Postgres, Qdrant, or OpenAI, but it does issue read-only Postgres
backlog count queries for the background queue gauges.

## Schema migrations

All migrations are idempotent and applied at bootstrap. Migrations currently
span `001-015`; new migrations append the next unused number after that range.
To add a new migration:

1. Create `src/db/migrations/NNN_description.sql` (next sequence number, currently `016_*.sql`).
2. Append the filename to `MIGRATION_FILES` in `src/db/migrate.ts`.
3. Append the SQL to `embeddedPostgresMigrationSql` in the same file
   (production fallback when SQL files aren't on disk).
4. Use `CREATE … IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`.

To verify locally without affecting your dev DB:

```bash
docker compose exec postgres psql -U memory -d memory_os -c "\d memory_archive"
```

## Common runbooks

### "Apply ran but Qdrant looks stale"

Check `qdrantPointsPending` in the apply response. If > 0, the sweeper
will drain (enable it if not already). Verify with:

```sql
SELECT qdrant_status, COUNT(*) FROM memory_archive GROUP BY 1;
```

### "Searches return nothing after migration"

You probably switched `EMBEDDING_PROVIDER` or `OPENAI_EMBEDDING_MODEL`
without reindexing. Run:

```bash
curl -X POST http://localhost:8787/v1/memory/reindex \
  -H "Authorization: Bearer $MEMORY_API_TOKENS" \
  -d '{"organizationId": "default", "projectKey": "my-project"}' | jq
```

### "Server refuses to start with 'fail-closed' error"

Either set `MEMORY_API_TOKENS` (production) or bind to loopback
(`HOST=127.0.0.1`, dev). See `assertSafeAuthConfig` in
`src/app/server.ts`.

### "I lost my MEMORY_API_TOKENS — how do I recover?"

The tokens are in `.env`. If you lost the .env, generate new ones
(`uuidgen` × N) and update both `.env` and every client. Old tokens
become invalid the moment the new `.env` is loaded (server restart).
