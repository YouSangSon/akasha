# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Source Ref Parser Type Guard

Status:
- `parseStoredPostgresSourceRef` now rejects non-string direct values before
  JSON parsing, fallback logging, or returning metadata.
- Valid JSON metadata, invalid JSON string fallback/logging, missing
  `sourceRef` fallback, and missing `uri` behavior are preserved.
- Focused parser tests, typecheck, build, audit, full suite, review, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
