# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Lexical Entity Helper Type Guards

Status:
- Exported lexical and entity helpers now reject malformed direct text inputs
  before string normalization, regex matching, or scoring field access.
- Existing valid string tokenization, scoring, entity extraction, and entity
  overlap behavior are preserved.
- Focused search/entity tests, typecheck, build, audit, full suite, review, and
  diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
