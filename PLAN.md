# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Node Runtime Support

Goal: keep Akasha on supported Node runtime lines.

Status:
- Node minimum is updated from 20 to 22.
- CI now covers Node 22 and 24.
- Public docs, install script, package metadata, lockfile metadata, and drift
  tests are updated.

Remaining for this loop:
- Commit locally; do not push.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
