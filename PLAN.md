# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Direct Graph Kind Enum Validation

Status:
- Direct `inspect_memory_graph.kind` now rejects invalid entity-kind enum
  values before canonical repository dispatch.
- MCP schemas reuse the entity module's entity-kind tuple instead of carrying a
  second hardcoded list.
- Reviewer `Ptolemy` reported no findings.
- Focused MCP tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
