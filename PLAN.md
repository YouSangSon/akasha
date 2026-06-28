# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — MCP Stdio CWD Guard

Status:
- MCP stdio startup now rejects whitespace-only `DMO_CWD` values before
  registry/server creation.
- Valid configured paths are returned unchanged, and fallback `process.cwd()`
  resolution remains lazy when `DMO_CWD` is set.
- Reviewer subagent caught an eager fallback regression; fixed before final
  verification.
- Focused stdio-cwd/docs tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
