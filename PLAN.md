# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Restore Smoke Optional Env Guard

Status:
- Restore-smoke now rejects whitespace-only optional text env values for
  `RESTORE_SMOKE_USER_SCOPE_ID` and `RESTORE_SMOKE_ORGANIZATION_ID`.
- Unset optional values are still omitted, and configured nonblank values are
  trimmed before use.
- Reviewer subagent found no issues.
- Focused restore-smoke/docs tests, typecheck, build, audit, full suite, and
  diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
