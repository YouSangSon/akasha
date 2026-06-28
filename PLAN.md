# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Backup Shell Target Dir Guard

Status:
- Backup shell scripts now reject whitespace-only `BACKUP_TARGET_DIR` values in
  remote-copy branches instead of relying on shell default expansion.
- Unset `BACKUP_TARGET_DIR` still falls back to `BACKUP_DIR`, and valid remote
  target paths are preserved.
- Executable shell tests cover `backup-postgres.sh`, `snapshot-qdrant.sh`, and
  `create-backup.sh` under `sh` with stubbed external commands.
- Reviewer subagent first caught string-only test coverage, then caught inherited
  env leakage in the shell harness; both were fixed before final verification.
- Focused backup tests, shell syntax checks, typecheck, build, audit, full
  suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
