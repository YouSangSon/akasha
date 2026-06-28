# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Vector Adapter Organization Guard

Status:
- Qdrant and pgvector adapters now reject whitespace-only optional organization
  filters before backend query/delete work.
- Coverage verifies invalid vector organization filters fail before backend
  calls, while exact empty-string legacy behavior remains pinned.
- Reviewer subagent found a compatibility coverage gap; exact empty-string
  query/delete tests were added.
- Focused vector tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
