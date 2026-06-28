# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Goal-Run Repository Organization Guard

Status:
- Goal-run repository entry points now reject whitespace-only organization IDs
  before SQL queries or transaction opens.
- Coverage verifies invalid goal-run organization IDs fail before `pool.query()`
  or `pool.connect()`.
- Reviewer subagent found no issues.
- Focused goal-run tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
