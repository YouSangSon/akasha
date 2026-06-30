# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Background Worker Coordinator Guards

Status:
- `startBackgroundWorkers` now rejects invalid direct options before reading
  worker flags, bootstrapping services, or starting sweepers.
- Coordinator options now validate logger methods, environment flag types,
  fail-fast mode, metrics recorders, service bootstrap, and injected starter
  functions.
- Malformed bootstrap service results are rejected in fail-fast mode and logged
  as worker startup failures in default mode without starting sweepers.
- Existing disabled-worker noop behavior, shared bootstrap, stop handling,
  fail-fast bootstrap errors, server startup resilience, and metrics wiring is
  preserved.
- Focused coordinator, adjacent app/server tests, typecheck, build, audit,
  single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
