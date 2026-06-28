# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Goal-Run ID Safe Integer Validation

Status:
- Direct goal-run handlers now reject invalid `goalRunId` values before
  service dispatch.
- Public schemas now use a shared positive safe integer schema for goal-run
  IDs, memory governance IDs, and iteration memory links.
- HTTP coverage verifies unsafe `goalRunId` rejects before registry dispatch.
- Reviewer `Hume` caught the schema/handler mismatch; re-review by `Poincare`
  reported no findings.
- Focused app/goal-run tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
