# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Ingest Sweeper Input Guards

Status:
- `runIngestSweep` now rejects invalid direct input before claiming jobs,
  reading chunks, embedding, deleting old vectors, or upserting new vectors.
- Sweeper dependencies, logger methods, tunables, and injected clock results
  are validated before repository calls.
- Claimed ingest jobs are validated before per-job work starts, and chunk plus
  embedding results are validated before vector side effects.
- Malformed chunk or embedding data stays in the existing per-job retry/fail
  path instead of reaching vector deletes or upserts.
- Existing empty sweep, success, no-chunk completion, retry, give-up, custom
  batch size, and idempotent re-upsert behavior is preserved.
- Focused ingest, adjacent ingest/background-worker tests, typecheck, build,
  audit, single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
