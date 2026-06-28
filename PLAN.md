# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — MCP Resource Blank Parameter Validation

Status:
- MCP resource URL parsing now rejects whitespace-only decoded path segments,
  recent-memory `query`, and optional search params before registry dispatch.
- Protocol coverage verifies invalid recent-memory and context-pack resource
  URIs fail before `search_memory` / `build_context_pack` dispatch.
- Reviewer found no issues.
- Typecheck, build, audit, full test suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
