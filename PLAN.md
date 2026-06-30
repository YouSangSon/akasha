# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — OAuth Scope Input Guards

Status:
- OAuth scope enforcement now validates direct scope input containers before
  checking `dryRun` or routing tool authorization decisions.
- OAuth token scope lists are rejected when malformed before scope matching.
- Direct scope-kind and unsupported tool helper values now fail with explicit
  errors instead of falling through switch logic.
- Existing HTTP route scope enforcement, MCP Streamable HTTP authorization,
  JWT verification, and static-token bypass behavior is preserved.
- Focused OAuth tests, adjacent MCP/server tests, typecheck, build, audit,
  single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
