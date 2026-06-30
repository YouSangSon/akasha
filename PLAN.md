# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Archive Cleanup Input Guards

Status:
- `createMemoryArchiveRepository` now rejects malformed pool handles before
  returning repository methods.
- Qdrant cleanup status, find, claim, unarchive marking, and restored-record
  delete helpers now validate IDs, statuses, error message types, claim input
  containers, limits, and timestamps before query construction.
- Existing compaction run creation, archive apply, cleanup claim SQL shape,
  unarchive restore behavior, and scope-lock behavior are preserved.
- Focused archive repository tests, typecheck, build, audit, single-worker full
  suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
