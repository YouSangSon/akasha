# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — User Scope Resolver Guard

Status:
- `resolveUserScopeId()` now rejects whitespace-only explicit and default user
  scope IDs at the utility boundary instead of returning them to callers.
- Coverage verifies explicit/default rejection and the existing trimmed
  `DEVELOPER_MEMORY_USER_ID` fallback behavior.
- Reviewer subagent found no issues.
- Focused MCP utility/server/goal-run tests, typecheck, build, audit, full
  suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
