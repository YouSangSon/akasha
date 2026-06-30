# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Rate Limiter Input Guards

Status:
- `createTokenBucketLimiter` now rejects non-object options before capacity or
  window access.
- Injected clocks must be functions and must return finite numbers before
  refill math runs.
- Direct rate-limit keys must be strings before bucket lookup.
- Focused rate-limit and adjacent HTTP/server tests, typecheck, build, audit,
  single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
