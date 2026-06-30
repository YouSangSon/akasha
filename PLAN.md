# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Exact Duplicate Input Guards

Status:
- `findExactContentDuplicates` now rejects invalid records before content
  normalization, duplicate grouping, or candidate sorting.
- Direct records must be an array of objects with positive safe-integer `id`,
  string `content`, and finite optional `importance`.
- Focused duplicate and compaction tests, typecheck, build, audit, isolated
  timeout-sensitive files, single-worker full suite, and diff checks passed.
- Default parallel `npm test` still hit unrelated 5s timeout-sensitive tests
  under load; those files passed in isolation.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
