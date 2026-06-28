# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Recent Apply Count Organization Guard

Status:
- `countRecentApplyRuns` now rejects whitespace-only organization IDs before
  rate-limit count queries.
- Coverage verifies invalid recent-apply count organization IDs fail before
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
