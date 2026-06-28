# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Backup Encryption Key File Guard

Status:
- `BACKUP_ENCRYPTION_KEY_FILE` now rejects explicit empty or whitespace-only
  values in the TypeScript encryption helper and backup shell entrypoints.
- Unset values still disable backup encryption; configured nonblank paths are
  trimmed before key-file reads.
- Reviewer subagent caught a missing positive shell encryption test; the gap was
  fixed and re-review found no issues.
- Focused backup/docs tests, shell syntax checks, typecheck, build, audit, full
  suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
