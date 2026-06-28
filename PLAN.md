# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Restore Smoke Tool Input Guard

Status:
- Restore-smoke tool input construction now rejects whitespace-only
  `projectKey`, `userScopeId`, and `organizationId` before registry dispatch.
- Undefined optional fields are still omitted for legacy restore-smoke mode.
- Reviewer subagent found no issues.
- Focused restore-smoke tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
