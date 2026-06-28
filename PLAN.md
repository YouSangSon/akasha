# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Backup Manifest Writer Object Guard

Status:
- Backup manifest writer snippets now reject existing non-object manifest JSON
  before mutation.
- Missing manifest files still start from `{}`.
- Worker implementation passed spec review and code-quality review with no
  findings.
- Focused backup shell tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
