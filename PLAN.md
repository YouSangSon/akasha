# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Backup Off-Box Copy Manifest Guard

Status:
- Encrypted off-box backup copy list construction now validates manifest
  artifact filenames before invoking `scp`.
- Qdrant artifact names are required whenever a Qdrant manifest block is present
  or the backend is not `pgvector`.
- Worker implementation passed spec review and code-quality re-review after
  fixing Qdrant fail-closed consistency gaps.
- Focused backup shell tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
