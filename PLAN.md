# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Scope Identifier Validation

Status:
- `projectKey` and `userScopeId` now reject whitespace-only values at schema
  and direct handler boundaries.
- Tests cover HTTP, MCP protocol, direct retrieval, repository resolution, and
  goal-run scope paths before dispatch.
- Initial review found direct-registry gaps; follow-up review found no issues.
- Typecheck, build, audit, full test suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
