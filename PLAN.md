# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Ingest Job Repository Input Guards

Status:
- `createIngestJobRepository` now rejects malformed pool handles before
  returning repository methods.
- Ingest job create/update methods now reject malformed direct inputs,
  invalid job IDs, invalid memory record IDs, invalid attempt counts, and
  invalid retry dates before query construction or failure logging.
- Retry list/claim methods now validate their input containers, limits, and
  timestamps before computing visibility windows or querying.
- Existing claim SQL shape, visibility timeout behavior, error serialization,
  and integration-only persistence behavior are preserved.
- Focused job repository tests, typecheck, build, audit, single-worker full
  suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
