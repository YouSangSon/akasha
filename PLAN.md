# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Transformers Embedding Client Input Guards

Status:
- `createTransformersEmbeddingClient` now rejects malformed client input,
  blank/non-string model values, and invalid injected extractor factories before
  model loading.
- Single-text and batch embedding methods now reject malformed direct text
  input before loading or calling the extractor.
- Injected extractor factory results are validated before use so malformed
  factories fail explicitly.
- Focused transformers embedding tests, typecheck, build, audit, and
  single-worker full suite passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
