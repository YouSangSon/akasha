# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Importance Bounds Validation

Status:
- Public and direct `update_memory.importance` validation now matches the
  Postgres `INTEGER` range before repository dispatch.
- Direct coverage rejects non-integers, non-finite values, and out-of-range
  integers; public schema coverage accepts/rejects the int32 boundaries.
- Reviewer `Bohr` caught JavaScript-safe integer drift; after the fix, re-review
  reported no findings.
- Focused MCP tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
