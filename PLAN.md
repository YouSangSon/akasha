# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Direct Graph Query Guard

Status:
- Direct `inspectMemoryGraph()` repository calls now reject whitespace-only
  query filters before SQL work instead of treating them as no filter.
- Existing API/MCP validation and nonblank direct query behavior are preserved.
- Reviewer subagent found no issues.
- Focused store/MCP/API tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
