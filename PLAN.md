# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — MCP HTTP Request Input Guards

Status:
- `handleMcpHttpRequest` now rejects malformed direct option containers and
  invalid req/res/auth/rate-limit/logger handles before destructuring.
- Existing method, host, origin, auth, rate-limit, and MCP transport behavior
  are preserved.
- Focused MCP HTTP boundary/transport tests, typecheck, build, audit,
  subagent spec/code-quality reviews, and single-worker full suite passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
