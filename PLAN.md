# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Shared Read Organization Guard

Status:
- Shared read organization validation now rejects whitespace-only
  organization IDs even when legacy anonymous reads are enabled.
- Coverage verifies `listMemory`, `getMemoryRecordsByIds`, and
  `retrieveMemory` fail before query/vector work.
- Reviewer skipped after previous reviewer-agent timeouts; self-review found no
  issues.
- Focused store/retrieval tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
