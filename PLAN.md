# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Memory Chunk Repository Input Guards

Status:
- `createMemoryChunkRepository` now rejects malformed pool handles before
  returning repository methods.
- Chunk insert/replace, point-ID update, delete, list, get-by-record, and
  context-pack run inputs now validate IDs, scopes, options, dates, chunk
  shapes, embedding config, and selected memory IDs before SQL or transactions.
- Existing batched insert/update SQL shape, replacement transaction behavior,
  list pagination, context-pack persistence, and ingest retry row creation are
  preserved.
- Focused canonical-indexing tests, typecheck, build, audit, and single-worker
  full suite passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
