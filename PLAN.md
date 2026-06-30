# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Repository Search Query Type Guard

Status:
- Direct repository `searchMemory` now rejects non-string `query` values before
  calling `.trim()`.
- Blank string queries still return `[]` without SQL, and that ordering is
  covered even when `limit` is invalid.
- Focused repository tests, typecheck, build, audit, full suite, review, and
  diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
