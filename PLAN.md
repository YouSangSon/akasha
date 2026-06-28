# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Repository Add Metadata Normalization

Status:
- `addMemory` now normalizes whitespace-only title and summary values to `null`
  before persistence.
- Coverage verifies SQL insert parameters and hydrated output use `null`.
- Reviewer skipped after previous reviewer-agent timeouts; self-review found no
  issues.
- Focused store tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
