# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Log Level Env Guard

Status:
- `LOG_LEVEL` resolution is now explicit and testable before Pino
  initialization.
- Whitespace-only and unsupported log levels fail with an Akasha-owned startup
  message instead of Pino internals.
- Case-insensitive supported levels preserve common existing env values such as
  `INFO` and `DEBUG`.
- Reviewer subagent caught the uppercase compatibility risk; fixed before final
  verification.
- Focused logger/docs tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
