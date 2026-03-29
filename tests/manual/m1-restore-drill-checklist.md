# M1 Restore Drill Checklist

- Confirm the latest Postgres dump exists in `BACKUP_DIR`.
- Confirm the latest Qdrant snapshot metadata exists in `BACKUP_DIR`.
- Copy both backup artifacts to an off-box location.
- Start the disposable restore environment with `docker compose -p restore-smoke up -d`.
- Restore Postgres into the disposable environment.
- Recover the Qdrant collection from the latest snapshot.
- Run one search command and confirm it returns at least one result.
- Run one context-pack command and confirm it returns `{ "ok": true }`.
- Tear down the disposable restore environment after the drill.
