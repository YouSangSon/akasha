# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — MCP Server Construction Input Guards

Status:
- `createMcpServer` now rejects malformed server construction options before
  reading registry wiring fields.
- `resolveStdioCwd` now rejects malformed direct env/fallback inputs and
  invalid fallback cwd values before stdio startup.
- Existing default server construction, injected registry schema-only tests,
  and valid cwd behavior are preserved.
- Focused MCP server construction/cwd tests, typecheck, build, audit, and
  single-worker full suite passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
