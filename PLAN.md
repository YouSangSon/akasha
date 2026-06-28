# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — HTTP Goal-Run Enum Coverage

Status:
- HTTP `/v1/goal-run/*` coverage now verifies invalid scope, status, and
  outcome values reject before registry dispatch.
- Coverage exercises valid auth/body shape so failures prove route schema
  validation, not auth or body parsing.
- Reviewer `Dirac` reported no findings.
- Focused MCP tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
