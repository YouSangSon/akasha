# Self-Hosted Operations

This runbook covers the active Postgres operator stack with Qdrant by default
or pgvector for Postgres-only deployments. SQLite remains only in historical
planning/design documents and is not part of the deployed runtime path.

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
- `VECTOR_BACKEND`
- `QDRANT_URL`
- `QDRANT_COLLECTION_NAME` (optional, defaults to `memory_chunks_v1`)
- `QDRANT_API_KEY` (optional for unauthenticated local deployments)
- `BACKUP_TARGET_HOST` (optional; when non-empty, backup scripts copy artifacts with `ssh`/`scp`)
- `BACKUP_TARGET_DIR` (optional, defaults to `BACKUP_DIR` on the remote host)
- `BACKUP_ENCRYPTION_KEY_FILE` (optional; 32-byte AES data key, supplied
  directly or by your KMS/secret manager)
- `BACKUP_ENCRYPTION_KEEP_PLAINTEXT` (optional; defaults to false)

With `VECTOR_BACKEND=qdrant`, `npm run backup:create` captures Postgres and
Qdrant snapshot data. The backup scripts create and copy:

- `postgres-YYYYMMDD-HHMM.sql.gz`
- `qdrant-YYYYMMDD-HHMM.snapshot`
- `qdrant-memory_chunks_v1-YYYYMMDD-HHMM.json`
- `manifest-YYYYMMDD-HHMM.json`

The Qdrant metadata sidecar name includes the collection name.

When `BACKUP_ENCRYPTION_KEY_FILE` is set, `backup:create` encrypts the
Postgres dump and Qdrant snapshot with AES-256-GCM, rewrites the manifest to
point at `.enc` artifacts, records ciphertext checksums, and removes plaintext
artifacts unless `BACKUP_ENCRYPTION_KEEP_PLAINTEXT=true`. If
`BACKUP_TARGET_HOST` is also set, only the encrypted artifacts, manifest, and
non-sensitive Qdrant metadata sidecar are copied off-box. KMS integration is
intentionally external: decrypt or write a data key to
`BACKUP_ENCRYPTION_KEY_FILE` immediately before the backup job, then remove it
after the job under your scheduler/secret-manager policy.

To decrypt one artifact before a restore command:

```bash
export BACKUP_ENCRYPTION_KEY_FILE=/run/secrets/akasha-backup-data-key
export BACKUP_ENCRYPTED_INPUT=/var/lib/developer-memory-os/backups/postgres-YYYYMMDD-HHMM.sql.gz.enc
export BACKUP_DECRYPTED_OUTPUT=/tmp/postgres-YYYYMMDD-HHMM.sql.gz
npm run backup:decrypt
```

With `VECTOR_BACKEND=pgvector`, vectors live in Postgres; Qdrant snapshot data
is not part of the logical data path. `npm run backup:create` now skips
`scripts/snapshot-qdrant.sh` for pgvector, so pgvector operators do not need
`QDRANT_URL` for backups. Use `npm run backup:create:qdrant` or
`npm run backup:create:pgvector` when you want the command to ignore the current
environment default.

### systemd timer example

`/etc/systemd/system/akasha-backup.service`:

```ini
[Unit]
Description=Akasha backup
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/opt/akasha
EnvironmentFile=/opt/akasha/.env
ExecStart=/usr/bin/npm run backup:create
ExecStartPost=/usr/bin/npm run backup:verify
```

`/etc/systemd/system/akasha-backup.timer`:

```ini
[Unit]
Description=Run Akasha backup nightly

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true
Unit=akasha-backup.service

[Install]
WantedBy=timers.target
```

Enable it with:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now akasha-backup.timer
```

For local-only backups with no `BACKUP_TARGET_HOST`, omit the
`ExecStartPost=/usr/bin/npm run backup:verify` line or replace it with your
local checksum/restore-smoke policy.

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

Qdrant manifests require `RESTORE_QDRANT_URL` and
`RESTORE_SMOKE_QDRANT_RESTORE_CMD`. Pgvector manifests skip the Qdrant restore
step and validate with `VECTOR_BACKEND=pgvector`.

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
export RESTORE_SMOKE_QDRANT_RESTORE_CMD='curl -fsS -X POST "$RESTORE_QDRANT_URL/collections/$RESTORE_SMOKE_QDRANT_COLLECTION_NAME/snapshots/upload?priority=snapshot" -F "snapshot=@$RESTORE_SMOKE_QDRANT_ARTIFACT_PATH"'
npm run restore:smoke
```

For Qdrant manifests, this helper:

- boots `docker compose -f compose.yaml -f compose.restore-smoke.yaml -p restore-smoke up -d postgres qdrant`
- resolves the newest manifest and artifact paths from `BACKUP_DIR`
- restores the newest Postgres dump into the isolated database
- restores the newest Qdrant snapshot into the isolated vector store
- starts the `app` service only after both restores succeed and waits for `/healthz`
- runs one real `search_memory` query and one real `build_context_pack` call against the restored services
  using `RESTORE_SMOKE_ORGANIZATION_ID` when set (or `LEGACY_ANONYMOUS_SEARCH=true` for intentional legacy org-blind checks)
- tears the disposable environment down with `docker compose -f compose.yaml -f compose.restore-smoke.yaml -p restore-smoke down -v`

For pgvector manifests, it boots the pgvector compose overlay, restores only the
Postgres dump, skips the Qdrant snapshot command, and runs the same
search/context-pack checks with `VECTOR_BACKEND=pgvector`.

Manual teardown is still safe if a shell command fails mid-run:

```bash
docker compose -f compose.yaml -f compose.restore-smoke.yaml -p restore-smoke down -v
```
