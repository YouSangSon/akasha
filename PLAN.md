# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — MCP Host Header Guard

Status:
- `/mcp` now applies port-agnostic Host validation for loopback-bound operator
  servers before auth, rate limiting, or MCP transport work.
- Loopback validation allows only `localhost`, `127.0.0.1`, and `[::1]`
  hostnames, and non-loopback deployments keep the previous behavior.
- Existing Origin validation remains in place.
- Worker implementation passed spec review and code-quality review with no
  findings.
- Focused MCP HTTP/docs tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
