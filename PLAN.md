# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — MCP Context Nonblank Validation

Status:
- MCP-local prompt/context schemas now reject whitespace-only identifiers and
  sampled summaries.
- Tests cover elicited memory project keys, sampled classification summaries,
  and Akasha prompt identifiers before storage or dispatch.
- Reviewer found no issues.
- Typecheck, build, audit, full test suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
