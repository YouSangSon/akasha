# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Audit Log Limit Validation

Status:
- Direct `list_audit_log.limit` now rejects non-finite, unsafe, non-integer,
  zero/negative, and over-`1000` values before audit repository dispatch.
- Direct coverage verifies invalid limits fail before `listByOrganization` and
  the documented maximum `1000` still reaches the repository.
- Reviewer `Franklin` requested boundary coverage; after the fix, re-review
  reported no findings.
- Focused MCP tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
