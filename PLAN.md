# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Archive Restore Organization Guard

Status:
- `restoreToCanonical` now rejects whitespace-only organization IDs before
  restoring archived rows into canonical memory.
- Coverage verifies invalid restore organization IDs fail before
  `pool.query()`.
- Reviewer skipped after previous reviewer-agent timeouts; self-review found no
  issues.
- Focused archive repository tests, typecheck, build, audit, full suite, and
  diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
