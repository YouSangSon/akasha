# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Backup Manifest Shape Guard

Status:
- Backup encryption and restore-smoke manifest parsers now reject `null` and
  array JSON manifests as non-object manifests.
- Backup encryption rejects these manifests before random bytes, artifact
  encryption, or manifest mutation work.
- Restore smoke rejects these manifests before per-field manifest parsing.
- Worker implementation passed spec review and code-quality review with no
  findings.
- Focused backup/restore script tests, typecheck, build, audit, full suite, and
  diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
