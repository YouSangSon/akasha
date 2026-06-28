# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Operations Restore Collection Drift

Status:
- General operations restore examples now use `QDRANT_COLLECTION_NAME` instead
  of a hardcoded `memory_chunks_v1` snapshot upload path.
- Upload examples now use `priority=snapshot`, matching the self-hosted
  restore-smoke guidance.
- Public docs drift coverage now guards both operations and self-hosted restore
  upload paths.
- Review, focused public docs drift test, typecheck, build, audit, full test
  suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
