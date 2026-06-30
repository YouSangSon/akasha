# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Direct Goal-Run Note Guard

Status:
- Direct goal-run registry calls now reject configured non-string optional note
  fields before service dispatch.
- `null`, `undefined`, and blank optional notes still normalize to `null`, and
  non-empty strings still pass through secret scanning and persistence.
- Spec review and code-quality review found no issues.
- Focused goal-run tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
