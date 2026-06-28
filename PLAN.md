# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Direct Add-Memory Kind Validation

Status:
- Direct `add_memory.kind` now rejects invalid memory-kind enum values before
  legacy repository or canonical service dispatch.
- Coverage exercises both direct legacy and canonical paths before backing
  stores are resolved.
- Reviewer `Erdos` timed out twice; self-review found no issues.
- Focused MCP tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
