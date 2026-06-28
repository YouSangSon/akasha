# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Search/Context Non-Blank Text

Status:
- `search_memory.query` and `build_context_pack.task` now reject
  whitespace-only text at HTTP/MCP schema and direct registry handler
  boundaries.
- Tests cover HTTP, MCP protocol, direct retrieveMemory override, and canonical
  services paths before search/vector/context-pack persistence work.
- Reviewer found no issues.
- Typecheck, build, audit, full test suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
