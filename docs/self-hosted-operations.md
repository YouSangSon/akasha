# Self-Hosted Operations

## Deployment operations

Bring up the data plane and operator service:

```bash
cp .env.example .env
docker compose up -d postgres qdrant
npm run db:migrate
npm run dev:server
```

Check the private operator surface:

```bash
curl http://127.0.0.1:8787/healthz
```

Expected response:

```json
{"ok":true,"host":"127.0.0.1","port":8787}
```

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

The Qdrant snapshot wrapper stores both the snapshot metadata JSON and the downloaded `.snapshot` archive in `BACKUP_DIR`.

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

This helper always starts the disposable restore environment with:

```bash
docker compose -p restore-smoke up -d
```

After the smoke check finishes:

```bash
docker compose -p restore-smoke down -v
```
