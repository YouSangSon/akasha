# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Goal-Run Iteration Memory Link Validation

Status:
- Direct `record_iteration.memoryIds` now rejects non-finite, unsafe,
  non-integer, zero, and negative IDs before iteration mutation.
- Direct handler coverage verifies invalid memory links fail before
  `goalRuns.recordIteration`.
- Reviewer `Kant` caught unsafe integer acceptance; the guard now uses
  `Number.isSafeInteger()`.
- Focused goal-run tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
