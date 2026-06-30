# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Worker Process Input Guards

Status:
- `runWorkerProcess` now rejects invalid direct options before resolving
  defaults or invoking the background-worker starter.
- Worker process options now validate optional logger, environment flag values,
  metrics recorder, and injected starter function.
- Handles returned by injected starters are validated before `startedWorkers`
  is read or startup/no-worker logging runs.
- Existing fail-fast delegation, no-worker warning, successful handle return,
  and app/server startup behavior is preserved.
- Focused worker-process, adjacent app/server tests, typecheck, build, audit,
  single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
