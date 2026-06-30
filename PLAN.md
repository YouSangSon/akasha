# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Metrics Registry Input Guards

Status:
- `createMetricsRegistry` now validates direct HTTP observations, sweeper
  observations, dependency reports, and optional backlog snapshots before
  mutating telemetry state or rendering labels.
- Sweeper worker/status labels and dependency check statuses are constrained to
  their low-cardinality runtime enums.
- Backlog snapshot containers and rows are validated while preserving the
  existing behavior that unknown queue/state strings are filtered from output.
- Existing `/metrics`, `/readyz`, background worker metrics, and collector
  failure behavior is preserved.
- Focused metrics tests, typecheck, build, audit, single-worker full suite, and
  diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
