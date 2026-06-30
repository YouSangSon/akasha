# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — MCP Registry Construction Input Guards

Status:
- `createToolRegistry` now rejects malformed construction options before
  reading option fields or wiring handlers.
- `createToolHandlers` now rejects malformed direct handler construction input
  before destructuring shared MCP wiring fields.
- Existing default registry construction and MCP server behavior are
  preserved.
- Focused MCP registry tests, typecheck, build, audit, and single-worker full
  suite passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
