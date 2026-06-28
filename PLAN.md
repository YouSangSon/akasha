# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Direct Memory Scope Enum Validation

Status:
- Direct memory handlers now reject invalid `scope` enum values before
  repository or canonical service dispatch.
- Coverage exercises `add_memory`, `compact_memory`, `list_memory`, and
  `inspect_memory_graph` direct paths.
- Reviewer `Einstein` reported no findings.
- Focused MCP tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
