# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Project Ingest Input Guards

Status:
- `collectProjectSources` now rejects malformed or non-directory project roots
  before joining approved source paths or reading files.
- `ingestProjectArtifacts` now rejects malformed direct inputs, blank project
  IDs, missing repositories, and invalid repository `addMemory` methods before
  filesystem or persistence work.
- Existing approved-source filtering and normalized project memory ingestion
  behavior is preserved.
- Focused ingest tests, typecheck, build, audit, single-worker full suite, and
  diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
