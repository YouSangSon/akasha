# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Restore App Port Guard

Status:
- Restore-smoke now validates `RESTORE_APP_PORT` before Docker startup and
  health checks.
- Unset values still default to `18787`; configured values must be plain
  decimal integers in `1..65535`.
- Reviewer subagent found no issues.
- Focused restore-smoke/docs tests, typecheck, build, audit, full suite, and
  diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
