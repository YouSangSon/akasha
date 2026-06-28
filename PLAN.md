# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Optional Goal-Run Note Normalization

Status:
- Blank optional goal-run notes now normalize to `null` before service
  dispatch.
- Direct handler coverage verifies `terminationCriteria`, iteration
  `summary`/`error`, complete `resolution`, and abandon `reason` payloads.
- Reviewer found no issues.
- Typecheck, build, audit, full test suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
