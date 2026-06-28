# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — OAuth Numeric Env Guard

Status:
- OAuth verifier numeric env parsing now rejects whitespace-only, decimal,
  negative, exponent, zero-timeout, and timer-overflow values instead of relying
  on JavaScript number coercion.
- `MCP_OAUTH_JWKS_TIMEOUT_MS` is capped to the Node timer-compatible maximum.
- Reviewer subagent caught the missing timeout upper bound; it was fixed before
  final verification.
- Focused OAuth tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
