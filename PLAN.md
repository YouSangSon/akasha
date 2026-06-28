# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Restore Smoke Collection Guard

Status:
- Restore-smoke Qdrant collection resolution now rejects explicitly
  whitespace-only manifest `qdrant.collectionName` and
  `QDRANT_COLLECTION_NAME` values instead of silently falling back.
- Omitted collection metadata still falls back to env/default for old manifests.
- Pgvector mode remains unaffected and now has explicit regression coverage.
- Reviewer subagent found no issue and noted the pgvector test gap, which was
  covered before final verification.
- Focused restore-smoke tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
