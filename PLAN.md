# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Vector Upsert Organization Guard

Status:
- Vector adapters now reject missing, non-string, or whitespace-only
  `payload.organization_id` values before upsert backend calls.
- Coverage verifies invalid upsert point organization payloads fail before
  Qdrant or pgvector work.
- Reviewer subagent found no issues; missing/non-string regressions were added
  for residual coverage.
- Focused vector tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
