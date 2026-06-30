# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Outbox Sweeper Input Guards

Status:
- `runOutboxSweep` now rejects invalid direct input before claiming rows or
  deleting Qdrant points.
- Sweeper tunables, dependency methods, logger methods, and injected clock
  results are validated before repository calls.
- Claimed cleanup rows are validated before vector deletes or qdrant-status
  updates, including archive IDs, organization IDs, point IDs, and attempt
  counts.
- Existing empty sweep, clean, retry, give-up, and custom tunable behavior is
  preserved.
- Focused outbox, adjacent sweeper/background-worker tests, typecheck, build,
  audit, single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
