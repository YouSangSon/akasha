# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Backup Plaintext Flag Guard

Status:
- `BACKUP_ENCRYPTION_KEEP_PLAINTEXT` now accepts only trimmed,
  case-insensitive `true` or `false` values when configured.
- Unset still defaults to removing plaintext artifacts after encrypted backup
  artifacts are written.
- Worker implementation passed spec review and code-quality review with no
  findings.
- Focused backup encryption/docs tests, typecheck, build, audit, full suite,
  and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
