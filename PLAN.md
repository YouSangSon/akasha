# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Secret Scrubber Input Guards

Status:
- `scanForSecrets` now rejects non-string direct content before regex scanning.
- `assertNoSecrets` inherits the same guard before secret-detection error
  construction.
- Focused scrubber, repository, canonical indexing, repo hygiene, typecheck,
  build, audit, single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
