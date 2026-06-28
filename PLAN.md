# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Direct Repository Limit Guard

Status:
- Direct repository search/list/governance/graph calls now reject invalid
  numeric limits before SQL instead of defaulting or flooring them.
- Omitted limits still use existing defaults, and retrieval lexical oversampling
  is capped before calling repository search.
- Reviewer subagent caught an API/MCP regression for valid public limits above
  25; the retrieval cap and regression test fixed it, and re-review found no
  issues.
- Focused repository/retrieval/MCP/API tests, typecheck, build, audit, full
  suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
