# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Retrieval Limit Contract Guard

Status:
- `search_memory` and `build_context_pack` now reject limits above the
  effective `100` cap instead of silently reducing them.
- The shared tool schemas, HTTP routes, MCP resources, and
  `akasha_session_start` prompt all enforce the same maximum.
- Reviewer subagent caught resource and prompt boundary drift; both were fixed
  and re-review found no issues.
- Focused MCP/app tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
