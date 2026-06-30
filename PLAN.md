# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Eval Metrics Input Guards

Status:
- `recallAtK` and `mrrAtK` now reject non-array inputs, invalid record IDs,
  and invalid `k` values before metric calculation.
- `recallAtK` now deduplicates retrieved IDs in the top-k window so duplicate
  retrievals cannot push recall above `1`.
- Focused eval metric tests, typecheck, build, audit, full suite, review, and
  diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
