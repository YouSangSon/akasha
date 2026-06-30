# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Background Queue Metrics Guards

Status:
- Background queue metrics collection now rejects invalid `now` values before
  timestamp serialization or database queries.
- Non-finite database count values are rejected instead of being silently
  reported as zero; missing/null counts still map to zero gauges.
- Focused background queue and adjacent metrics/server tests, typecheck, build,
  audit, single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
