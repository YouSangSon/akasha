# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — HTTP Organization Header Guard

Status:
- HTTP memory routes now reject explicitly blank body `organizationId` values
  and blank or repeated `x-organization-id` headers before registry dispatch.
- Absent organization IDs remain a legacy path, and valid single header/body
  organization IDs still preserve the existing precedence rules.
- Coverage includes resolver unit cases and a raw HTTP duplicate-header
  integration test that exercises Node's real header normalization behavior.
- Reviewer subagent caught the duplicate raw-header gap; it was fixed before
  final verification.
- Focused route tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
