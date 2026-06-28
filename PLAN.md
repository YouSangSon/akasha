# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Required Service Env Guard

Status:
- Required service environment variables now reject whitespace-only values.
- Coverage verifies direct required values and fallback Postgres env values fail
  before config construction.
- Reviewer subagent found no issues; fallback Postgres regressions were added
  for residual coverage.
- Focused config/server tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
