# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Backup Manifest Metadata Guard

Status:
- Backup manifest parsing now rejects whitespace-only required metadata before
  local or remote artifact checks.
- Optional Qdrant metadata on pgvector manifests is still preserved and
  verified when present.
- Focused backup tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
