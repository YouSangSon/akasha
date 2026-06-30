# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — OAuth Helper Input Guards

Status:
- OAuth protected-resource challenge helpers now reject invalid direct config,
  scope, and resource inputs before header formatting or metadata URL building.
- Challenge config must provide object metadata, string metadata URL, and
  string scope entries.
- Metadata path checks return false for non-string direct inputs.
- Existing metadata generation, path matching, challenge formatting, and
  escaping behavior is preserved.
- Focused OAuth helper and adjacent app auth/server tests, typecheck, build,
  audit, single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
