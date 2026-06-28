# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Backup Target Host Guard

Status:
- Backup shell entrypoints now reject whitespace-only `BACKUP_TARGET_HOST`
  values before any SSH/SCP work.
- Unset and exact empty `BACKUP_TARGET_HOST` still mean local-only.
- Worker implementation passed spec review and code-quality review with no
  findings.
- Focused backup shell tests, shell syntax checks, typecheck, build, audit,
  full suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
