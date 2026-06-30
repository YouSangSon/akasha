# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Chunk Text Input Guards

Status:
- `chunkText` now validates direct input shape, text type, and token settings
  before tokenization.
- Blank text still returns `[]` after valid settings, and deterministic chunk
  offsets are preserved.
- Focused chunk tests, typecheck, build, audit, full suite, review, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
