# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — DB Boundary Input Guards

Status:
- `createPgPool` now rejects malformed input and blank/non-string connection
  strings before constructing a `pg.Pool`.
- Migration helpers now reject malformed SQL read options, env objects/env
  values, and migration pool handles before fallback or query work.
- pgvector integration suites now defer real pool construction until `beforeAll`
  so skipped suites remain skipped when `PGVECTOR_TEST_URL` is absent.
- Focused DB/vector tests, typecheck, build, audit, and single-worker full suite
  passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
