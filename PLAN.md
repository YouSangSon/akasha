# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Retry Backoff Attempt Guard

Status:
- `nextRetryDelayMs` now rejects invalid attempt counts before exponential
  backoff calculation.
- Existing attempt `0`, doubling, and 5-minute cap behavior are preserved.
- Focused ingest-sweeper tests, typecheck, build, audit, full suite, review,
  and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
