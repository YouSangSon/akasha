# Self-Hosted Operations

This runbook covers the active Postgres + Qdrant operator stack. SQLite remains only in historical planning/design documents and is not part of the deployed runtime path.

## Deployment operations

Bring up the data plane and operator service:

```bash
cp .env.example .env
docker compose build app
docker compose up -d postgres qdrant
npm run build
docker compose run --rm app npm run db:migrate
docker compose up -d app
```

Check the private operator surface:

```bash
curl http://127.0.0.1:8787/healthz
```

Expected response:

```json
{"success":true,"data":{"ok":true,"host":"0.0.0.0","port":8787}}
```

## Nightly backups

Review the relevant environment variables, then run the packaged backup job:

```bash
npm run backup:create
```

Relevant variables:

- `BACKUP_DIR`
- `DATABASE_URL`
- `QDRANT_URL`
- `QDRANT_COLLECTION_NAME` (optional, defaults to `memory_chunks_v1`)
- `QDRANT_API_KEY` (optional for unauthenticated local deployments)
- `BACKUP_TARGET_HOST` (optional; when non-empty, backup scripts copy artifacts with `ssh`/`scp`)
- `BACKUP_TARGET_DIR` (optional, defaults to `BACKUP_DIR` on the remote host)

The backup scripts create and copy:

- `postgres-YYYYMMDD-HHMM.sql.gz`
- `qdrant-YYYYMMDD-HHMM.snapshot`
- `qdrant-memory_chunks_v1-YYYYMMDD-HHMM.json`
- `manifest-YYYYMMDD-HHMM.json`

The Qdrant metadata sidecar name includes the collection name.

## Backup verification

Run the verification helper against the newest local manifest and the copied files on `BACKUP_TARGET_HOST`:

```bash
npm run backup:verify
```

`backup:verify` is for remote-copy deployments and requires `BACKUP_TARGET_HOST`.
It passes only when the newest manifest is less than 24 hours old, both
artifacts exist locally, both artifacts exist on the off-box host, and the
manifest checksums match both copies.

## Restore smoke

Run a disposable restore check against the newest manifest in `BACKUP_DIR`:

```bash
export RESTORE_POSTGRES_PORT=15432
export RESTORE_QDRANT_PORT=16333
export RESTORE_APP_PORT=18787
export RESTORE_POSTGRES_URL="postgres://memory:memory@127.0.0.1:${RESTORE_POSTGRES_PORT}/memory_os"
export RESTORE_QDRANT_URL="http://127.0.0.1:${RESTORE_QDRANT_PORT}"
export RESTORE_SMOKE_PROJECT_KEY="project-alpha"
export RESTORE_SMOKE_ORGANIZATION_ID="default"
export RESTORE_SMOKE_SEARCH_QUERY="continue work"
export RESTORE_SMOKE_PACK_TASK="continue work"
export RESTORE_SMOKE_POSTGRES_RESTORE_CMD='cat "$RESTORE_SMOKE_POSTGRES_ARTIFACT_PATH" | gunzip | psql "$RESTORE_POSTGRES_URL"'
export RESTORE_SMOKE_QDRANT_RESTORE_CMD='curl -fsS -X POST "$RESTORE_QDRANT_URL/collections/memory_chunks_v1/snapshots/upload" -F "snapshot=@$RESTORE_SMOKE_QDRANT_ARTIFACT_PATH"'
npm run restore:smoke
```

This helper always:

- boots `docker compose -f compose.yaml -f compose.restore-smoke.yaml -p restore-smoke up -d postgres qdrant`
- resolves the newest manifest and artifact paths from `BACKUP_DIR`
- restores the newest Postgres dump into the isolated database
- restores the newest Qdrant snapshot into the isolated vector store
- starts the `app` service only after both restores succeed and waits for `/healthz`
- runs one real `search_memory` query and one real `build_context_pack` call against the restored services
  using `RESTORE_SMOKE_ORGANIZATION_ID` when set (or `LEGACY_ANONYMOUS_SEARCH=true` for intentional legacy org-blind checks)
- tears the disposable environment down with `docker compose -f compose.yaml -f compose.restore-smoke.yaml -p restore-smoke down -v`

Manual teardown is still safe if a shell command fails mid-run:

```bash
docker compose -f compose.yaml -f compose.restore-smoke.yaml -p restore-smoke down -v
```
