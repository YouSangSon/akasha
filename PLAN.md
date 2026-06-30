# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Qdrant Client Input Guards

Status:
- `createQdrantClient` now rejects malformed input containers and blank or
  non-string URL/API key values before constructing the SDK client.
- Qdrant client unit coverage mocks the SDK constructor so valid construction
  stays offline and does not trigger compatibility checks.
- Existing service config expectations and Qdrant SDK construction behavior are
  preserved for valid inputs.
- Focused qdrant client tests, typecheck, build, audit, and single-worker full
  suite passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
