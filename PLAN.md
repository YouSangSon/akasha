# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Backup Encryption Manifest Guard

Status:
- Backup encryption now validates manifest metadata before idempotent returns
  or artifact encryption work.
- Qdrant metadata is required unless the manifest explicitly uses `pgvector`,
  and invalid vector backend values are rejected early.
- Worker implementation passed spec and code-quality subagent review after
  fixing the Qdrant-default and vector-backend gaps.
- Focused backup-encryption tests, typecheck, build, audit, full suite, and
  diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
