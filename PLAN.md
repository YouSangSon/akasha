# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Goal Run Repository Input Guards

Status:
- `createGoalRunRepository` now rejects malformed pool handles before returning
  repository methods.
- Start, iteration, get, list, complete, and abandon inputs now validate input
  containers, organization IDs, run IDs, scope/status/outcome values, optional
  text fields, and memory ID arrays before SQL or transactions.
- Existing row mapping, active-run conflict behavior, iteration count bumping,
  and active-run memory pinning behavior are preserved.
- Focused goal-run repository tests, typecheck, build, audit, and single-worker
  full suite passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
