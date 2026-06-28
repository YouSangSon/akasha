# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Embedding Module Doc Drift

Status:
- Architecture docs reference `src/embedding/local-embeddings.ts`, but the
  actual module is `src/embedding/local-embedding.ts`.
- English/Korean docs now use the actual filename.
- Public docs drift coverage now checks embedding provider module filenames.
- Review, focused public docs drift test, typecheck, build, audit, full test
  suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
