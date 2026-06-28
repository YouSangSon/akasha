# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Backup Verify Target Dir Guard

Status:
- `backup:verify` now rejects whitespace-only `BACKUP_TARGET_DIR` values before
  remote path construction.
- Unset `BACKUP_TARGET_DIR` still falls back to `BACKUP_DIR`, and valid
  configured remote paths are unchanged.
- Reviewer subagent found no issue and noted that backup shell scripts retain
  their existing `${BACKUP_TARGET_DIR:-${BACKUP_DIR}}` behavior.
- Focused backup/docs tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
