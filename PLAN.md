# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Repository Metadata Normalization

Status:
- `updateMemoryRecord` now normalizes explicitly supplied blank title and
  summary values to `null` at the repository boundary.
- Coverage verifies SQL update parameters and hydrated output use `null`
  instead of whitespace-only metadata.
- Reviewer skipped after previous reviewer-agent timeouts; self-review found no
  issues.
- Focused MCP tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
