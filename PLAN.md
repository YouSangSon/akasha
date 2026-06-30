# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — JSON HTTP Route Input Guards

Status:
- `createMemoryRoutes` now rejects malformed direct route context containers,
  registry objects, logger handles, and OAuth metadata handles before route
  construction.
- `resolveOrganizationId` now rejects malformed direct request/header inputs
  before organization header resolution.
- Existing JSON HTTP route behavior, organization resolution semantics, and
  partial-registry route construction are preserved.
- Focused route/organization/server tests, typecheck, build, audit, subagent
  implementation/reviews, and single-worker full suite passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
