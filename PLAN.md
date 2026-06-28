# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Optional Service Env Guard

Status:
- Service config now rejects whitespace-only optional embedding model names and
  `QDRANT_COLLECTION_NAME` instead of passing blank identifiers to embedding or
  vector adapters.
- Defaults remain unchanged when those optional variables are unset.
- Focused config tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.
- Reviewer subagent attempt timed out and was closed with no findings returned.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
