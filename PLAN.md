# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Unarchive Archive ID Validation

Status:
- `unarchive_memory.archiveIds` now uses the shared positive safe integer
  schema and direct handler guard.
- Direct coverage verifies invalid archive IDs fail before canonical service
  resolution or archive lookup.
- HTTP coverage verifies unsafe archive IDs reject before registry dispatch.
- Explorer `Aristotle` confirmed this was the next smallest validation gap;
  reviewer `Lagrange` reported no findings.
- Focused app/MCP tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
