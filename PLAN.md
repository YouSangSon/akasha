# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Transformers Dependency Docs

Status:
- Package metadata installs `@huggingface/transformers` as a regular runtime
  dependency.
- Code comments and public docs now describe it as an installed dependency
  instead of an optional dependency.
- Public docs drift coverage now guards package/doc wording against that drift.
- Review, focused docs drift test, typecheck, build, audit, full test suite, and
  diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
