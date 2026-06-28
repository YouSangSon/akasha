# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — OAuth Organization Claim Guard

Status:
- OAuth verifier now rejects present blank or non-string organization claims
  instead of treating them as unbound tokens.
- Coverage verifies absent organization claims remain unbound while malformed
  present claims reject the JWT.
- Reviewer subagent found no issues.
- Focused auth/HTTP tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
