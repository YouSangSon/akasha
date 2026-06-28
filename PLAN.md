# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Qdrant Snapshot Name Guard

Status:
- Qdrant snapshot response parsing now rejects missing, non-string, empty, and
  whitespace-only snapshot names before download URL construction.
- Valid string snapshot names are preserved unchanged.
- Worker implementation passed spec review and code-quality review with no
  findings.
- Focused backup shell tests, shell syntax check, typecheck, build, audit, full
  suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
