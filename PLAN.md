# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Governance List/Graph Limit Validation

Status:
- Direct `list_memory.limit`, `inspect_memory_graph.limit`, and
  `inspect_memory_graph.relationshipLimit` now reject non-finite, unsafe,
  non-integer, zero/negative, and over-`5000` values before governance
  repository dispatch.
- Direct coverage verifies invalid limits fail before repository calls and the
  documented maximum `5000` still reaches the repository.
- Reviewer `Arendt` reported no findings.
- Focused MCP tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
