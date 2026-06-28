# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Apply Compaction Organization Guard

Status:
- `applyCompaction` now rejects whitespace-only organization IDs before run ID
  generation, semantic embedding, rate-limit checks, archive writes, or vector
  deletes.
- Coverage verifies invalid apply organization IDs fail before those side
  effects.
- Reviewer subagent found no issues.
- Focused compaction tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
