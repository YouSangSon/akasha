# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Local Embedding Client Input Guards

Status:
- `createLocalEmbeddingClient` now rejects malformed client input and invalid
  dimensions before allocating deterministic vectors.
- Single-text and batch embedding methods now reject malformed direct text
  input before hashing.
- Existing deterministic vector generation, configured dimensions, L2
  normalization, and batch ordering behavior are preserved.
- Focused local embedding tests, typecheck, build, audit, and single-worker
  full suite passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
