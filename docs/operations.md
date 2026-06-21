> **English** | [한국어](operations.ko.md)

# Operations runbook

Day-2 procedures for running context-forge in production. For initial
deployment see [deployment.md](deployment.md).

## Backup

```bash
npm run backup:create
```

Snapshots Postgres (`pg_dump --format=custom`) and Qdrant (snapshot API)
into `BACKUP_DIR`. Files are named `<timestamp>-postgres.dump` and
`<timestamp>-qdrant.tar`.

### Schedule

Cron example (daily at 03:00):

```cron
0 3 * * * cd /opt/context-forge && /usr/bin/npm run backup:create >>/var/log/context-forge-backup.log 2>&1
```

systemd timer alternative — see [docs/self-hosted-operations.md](self-hosted-operations.md)
for a working unit file.

### Off-host replication

Set `BACKUP_TARGET_HOST=user@host` in `.env` and the script appends an
rsync push after the local snapshot completes. Requires SSH key auth (no
passphrase) scoped to the destination's backup directory.

### Retention

The script does **not** auto-prune old backups. Manage retention with a
sibling cron job:

```cron
# Keep 30 days of backups
0 4 * * * find /var/lib/developer-memory-os/backups -mtime +30 -delete
```

### Verification

`npm run backup:verify` validates the latest snapshot's structure (gzip
integrity, pg_dump header, Qdrant snapshot manifest). Run it at the end
of every backup cycle:

```cron
5 3 * * * cd /opt/context-forge && /usr/bin/npm run backup:verify
```

## Restore

### Smoke test (recommended weekly)

```bash
npm run restore:smoke
```

Spins up an isolated compose stack (`compose.restore-smoke.yaml`),
restores the latest backup, and runs assertions against the restored
data. **Doesn't touch production.** Treat any failure as a critical
alert — your backups are unreliable.

### Production restore

```bash
# 1. Stop traffic to the bad instance.
docker compose stop app

# 2. Drop and recreate Postgres data dir; restore from dump.
docker compose down -v postgres
docker compose up -d postgres
docker compose exec -T postgres pg_restore -U memory -d memory_os \
  --clean --if-exists < /var/lib/developer-memory-os/backups/<timestamp>-postgres.dump

# 3. Restore Qdrant snapshot.
docker compose exec qdrant curl -X POST \
  http://localhost:6333/collections/memory_chunks_v1/snapshots/upload \
  -F snapshot=@/var/lib/developer-memory-os/backups/<timestamp>-qdrant.tar

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
```

Then check the audit log for sweep activity:

```bash
curl -X POST http://localhost:8787/v1/audit/list \
  -H "Authorization: Bearer $MEMORY_API_TOKENS" \
  -d '{"limit": 50}' | jq '.data.entries[] | select(.tool=="compact_memory")'
```

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

context-forge writes pino JSON to **stderr**. Wire your aggregator to
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
| `compact.unarchive_failed` | error | Per-archive failure; check the response outcomes. |
| `http.unhandled` | error | Unexpected exception in an HTTP handler. |
| `compact.sweep_tick_failed` | error | Sweeper threw; loop continues. |

### Health probes

- `GET /healthz` — process is alive (always 200 once up).
- `GET /readyz` — readiness gate. Probes Postgres and Qdrant on every call;
  also probes OpenAI when `EMBEDDING_PROVIDER=openai`. Returns 200 when all
  pass, 503 when any dependency is unreachable.

### Metrics

No native metrics export today. The audit log + structured logs are
the primary observability surface. If you need Prometheus, scrape from
the structured logs via a log-to-metrics pipeline (Loki/Promtail,
Vector, etc.).

## Schema migrations

All migrations are idempotent and applied at bootstrap. To add a new
migration:

1. Create `src/db/migrations/NNN_description.sql` (next sequence number).
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
  -d '{"projectKey": "my-project"}' | jq
```

### "Server refuses to start with 'fail-closed' error"

Either set `MEMORY_API_TOKENS` (production) or bind to loopback
(`HOST=127.0.0.1`, dev). See `assertSafeAuthConfig` in
`src/app/server.ts`.

### "I lost my MEMORY_API_TOKENS — how do I recover?"

The tokens are in `.env`. If you lost the .env, generate new ones
(`uuidgen` × N) and update both `.env` and every client. Old tokens
become invalid the moment the new `.env` is loaded (server restart).
