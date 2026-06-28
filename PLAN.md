# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Repository Add Value Validation

Status:
- `addMemory` now rejects invalid kind, durability, and importance values
  before opening a Postgres transaction.
- Coverage verifies invalid enum values and non-Postgres-integer importance
  fail before `pool.connect()`.
- Reviewer skipped after previous reviewer-agent timeouts; self-review found no
  issues.
- Focused store tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
