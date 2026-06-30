# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Vector Point Input Guards

Status:
- `buildVectorPoint` now rejects malformed point input before assembling vector
  IDs or payload metadata.
- Chunk/memory record IDs must be positive safe integers, vectors must be
  non-empty finite-number arrays, and payload fields must match their expected
  string/null/tag shapes.
- Focused vector builder and caller tests, typecheck, build, audit,
  single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
