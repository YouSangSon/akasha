# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Goal-Run Enum Validation

Status:
- Public and direct goal-run scope, iteration outcome, and list status
  validation now share the same allowed-value constants before service
  dispatch.
- Direct coverage rejects invalid enum values before goal-run service dispatch.
- Reviewer `Noether` reported no findings.
- Focused MCP tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
