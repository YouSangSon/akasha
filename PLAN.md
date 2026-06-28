# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Restore Smoke Text Env Guard

Status:
- Restore-smoke now rejects whitespace-only text env values for
  `RESTORE_SMOKE_PROJECT`, `RESTORE_SMOKE_PROJECT_KEY`,
  `RESTORE_SMOKE_SEARCH_QUERY`, and `RESTORE_SMOKE_PACK_TASK`.
- Unset values still use the existing defaults, and configured nonblank values
  are preserved.
- Reviewer subagent found no issues.
- Focused restore-smoke/docs tests, typecheck, build, audit, full suite, and
  diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
