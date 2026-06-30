# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Repository Nullable Text Type Guard

Status:
- Repository title/summary normalization now rejects non-string non-null values
  before calling `.trim()`.
- Existing `null`, whitespace-to-`null`, non-empty string, default summary, and
  secret scanning behavior are preserved.
- Focused repository tests, typecheck, build, audit, full suite, review, and
  diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
