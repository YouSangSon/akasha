# M1 Restore Drill Checklist

- Confirm the latest Postgres dump exists in `BACKUP_DIR`.
- Confirm the latest Qdrant snapshot and `manifest-YYYYMMDD-HHMM.json` exist in `BACKUP_DIR`.
- Confirm the newest manifest and both artifacts were copied to the off-box backup host.
- Start the disposable restore environment with `docker compose -f compose.yaml -f compose.restore-smoke.yaml -p restore-smoke up -d postgres qdrant`.
- Restore Postgres into the disposable environment.
- Recover the Qdrant collection from the latest snapshot.
- Confirm the app can start against the restored Postgres and Qdrant services.
- Run one search command and confirm it returns at least one result.
- Run one context-pack command and confirm it returns `{ "ok": true }`.
- Tear down the disposable restore environment after the drill.
