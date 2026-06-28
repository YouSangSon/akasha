# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Organization ID Validation

Status:
- MCP service/context schemas and direct registry calls now reject
  whitespace-only `organizationId` values.
- HTTP routes preserve blank-string-as-absent behavior but reject present
  non-string body `organizationId` before token/header enrichment.
- Review found and closed HTTP sanitizer edge cases; final review found no
  issues.
- Typecheck, build, audit, full test suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
