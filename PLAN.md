# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Developer Memory User Env Guard

Status:
- `DEVELOPER_MEMORY_USER_ID` now rejects explicit empty or whitespace-only
  values instead of falling through to git/OS fallback.
- Unset values still derive from `git config user.email`, then OS username, and
  configured nonblank values are trimmed before use.
- Reviewer subagent caught missing fallback coverage and `.env.example` drift;
  both were fixed and re-review found no issues.
- Focused MCP/docs tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
