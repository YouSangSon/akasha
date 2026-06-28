# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Goal Context Limit Validation

Status:
- Direct `build_goal_context.limit` now rejects non-finite, unsafe,
  non-integer, zero/negative, and over-`200` values before goal-run lookup or
  memory listing.
- Direct coverage verifies invalid limits fail before service dispatch and the
  documented maximum `200` still reaches the repository.
- Reviewer `Aquinas` reported no findings.
- Focused MCP tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
