# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Governance Memory ID Validation

Status:
- Direct `update_memory`, `delete_memory`, and `tag_memory` now reject invalid
  `memoryId` values before canonical service dispatch.
- Direct coverage verifies invalid memory IDs fail before repository update or
  archive calls.
- Reviewer `Banach` reported no findings.
- Focused MCP tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
