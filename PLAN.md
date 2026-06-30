# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Decay Score Input Guards

Status:
- `decayScore` now rejects invalid importance, `createdAt`, `now`, and
  half-life inputs before scoring.
- `findDecayCandidates` now rejects invalid records, scoring callback,
  threshold, and `now` inputs before looping.
- Focused decay tests, typecheck, build, audit, full suite, review, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
