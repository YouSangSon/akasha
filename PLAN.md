# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Goal Context Input Guards

Status:
- `buildGoalContextPack` now rejects invalid top-level input before goal
  rendering or context-pack composition.
- Goal run render fields and iteration render fields are validated before
  sorting, single-line normalization, or last-error extraction.
- Memory record validation remains delegated to `buildContextPack`.
- Focused goal-context and adjacent goal/context tests, typecheck, build, audit,
  single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
