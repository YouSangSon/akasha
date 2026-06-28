# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Chunk Replacement Organization Guard

Status:
- `replaceChunksForRecord` and `replaceChunksForRecordWithPendingIngest` now
  reject whitespace-only record organization IDs before opening transactions.
- Coverage verifies invalid chunk replacement organization IDs fail before
  `pool.connect()`.
- Reviewer skipped after previous reviewer-agent timeouts; self-review found no
  issues.
- Focused canonical indexing tests, typecheck, build, audit, full suite, and
  diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
