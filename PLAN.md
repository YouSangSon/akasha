# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Lifecycle ProjectKey Type Guard

Status:
- Direct lifecycle init now rejects non-string `projectKey` values before
  calling `.trim()`.
- Existing whitespace-only lifecycle project-key behavior and CLI parsing are
  unchanged.
- Focused CLI/lifecycle tests, typecheck, build, audit, full suite, review, and
  diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
