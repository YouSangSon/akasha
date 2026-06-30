# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Operator Server Option Guards

Status:
- `createOperatorServer` and `startOperatorServer` now reject malformed direct
  option containers and injected config/logger/auth/metrics handles before
  reading option fields.
- OAuth protected-resource metadata validation is reusable and now validates
  the serialized metadata fields.
- Existing omitted-options env fallback, empty-registry construction, auth
  warning behavior, metrics, and background worker paths are preserved.
- Focused operator/server/OAuth/metrics tests, typecheck, build, audit,
  subagent implementation/reviews, and single-worker full suite passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
