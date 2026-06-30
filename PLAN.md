# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Direct Scope Identifier Type Guard

Status:
- Direct scope identifier guards now reject non-string `projectKey` and
  `userScopeId` values before calling `.trim()`.
- Registry instrumentation validates provided scope identifiers before
  logging/audit, so local scope validation failures do not trigger
  service-backed audit resolution.
- Existing missing/whitespace messages are preserved for handler-level required
  checks.
- Focused MCP/goal-run tests, typecheck, build, audit, full suite, review, and
  diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
