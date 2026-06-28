# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Service Config Backup Env Guard

Status:
- `resolveServiceConfig()` now rejects whitespace-only `BACKUP_DIR`,
  `BACKUP_TARGET_HOST`, and `BACKUP_ENCRYPTION_KEY_FILE` values before
  returning runtime backup config.
- Unset `BACKUP_DIR` still uses the existing local backup directory default,
  and exact empty `BACKUP_TARGET_HOST` still means local-only.
- Worker implementation passed spec review and code-quality review with no
  findings.
- Focused config tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
