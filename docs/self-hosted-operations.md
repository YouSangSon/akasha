# Self-Hosted Operations

## Nightly backups

Set the required environment variables, then run:

```bash
./scripts/backup-postgres.sh
./scripts/snapshot-qdrant.sh
```

Required variables:

- `BACKUP_DIR`
- `DATABASE_URL`
- `QDRANT_URL`
- `QDRANT_COLLECTION_NAME` (optional, defaults to `memory_chunks_v1`)
- `QDRANT_API_KEY` (optional for unauthenticated local deployments)

## Backup verification

Run the verification helper with the latest backup metadata:

```bash
LATEST_BACKUP_AT="2026-03-30T00:00:00.000Z" \
LOCAL_ARTIFACTS_PRESENT=true \
REMOTE_ARTIFACTS_PRESENT=true \
CHECKSUMS_MATCH=true \
tsx scripts/backup-verify.ts
```

## Restore smoke

Run a minimal restore smoke check with shell commands that exercise one search and one context-pack call:

```bash
RESTORE_SMOKE_SEARCH_CMD='echo "[{\"id\":12}]"' \
RESTORE_SMOKE_PACK_CMD='echo "{\"ok\":true}"' \
tsx scripts/restore-smoke.ts
```

This helper always starts the restore environment with:

```bash
docker compose -p restore-smoke up -d
```

Use a disposable compose project name and tear it down after the check completes.
