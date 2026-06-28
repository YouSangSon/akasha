# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Backup Required Env Guard

Status:
- Backup shell entrypoints now reject unset, empty, and whitespace-only required
  env values before filesystem, database, curl, SSH, or scp work.
- `create-backup.sh` validates `BACKUP_DIR` before invoking child scripts.
- Worker implementation passed spec review and code-quality review with no
  findings.
- Focused backup shell tests, shell syntax checks, typecheck, build, audit, full
  suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
