# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Transformers Import Suppression

Status:
- `@huggingface/transformers` ships TypeScript declarations and is now a
  regular dependency.
- `src/embedding/transformers-embedding.ts` no longer carries the old dynamic
  import `@ts-ignore` comment.
- Review, focused Transformers embedding/public docs tests, typecheck, build,
  audit, full test suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
