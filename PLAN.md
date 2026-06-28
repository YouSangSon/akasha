# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Update-Memory Metadata Normalization

Status:
- Direct `update_memory.title` and `summary` now preserve omitted fields while
  normalizing blank or null patches to `null`.
- Coverage verifies blank metadata clears before repository dispatch instead
  of persisting whitespace-only strings.
- Reviewer skipped after previous reviewer-agent timeouts; self-review found no
  issues.
- Focused MCP tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
