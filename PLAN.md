# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Ingest Job Organization Guard

Status:
- `create` now rejects whitespace-only organization IDs before inserting ingest
  job rows.
- Coverage verifies invalid ingest job organization IDs fail before
  `pool.query()`.
- Reviewer subagent found no issues.
- Focused jobs tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
