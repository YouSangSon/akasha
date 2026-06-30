# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Sweeper Loop Input Guards

Status:
- `startBackgroundSweeper` and `startIngestSweeper` now reject invalid direct
  input before scheduling timers or logging loop startup.
- Loop logger methods, optional metrics recorders, and interval values are
  validated before any background sweep can be scheduled.
- `intervalMs` now rejects non-finite, non-integer, and sub-1000 values instead
  of only checking the numeric lower bound.
- Existing tick scheduling, stop handling, metric recording, error swallowing,
  and environment parsing behavior is preserved.
- Focused sweeper-loop, adjacent one-shot/background-worker tests, typecheck,
  build, audit, single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
