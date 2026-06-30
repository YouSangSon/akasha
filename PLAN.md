# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Retrieval Input Guards

Status:
- `retrieveMemory` now rejects invalid direct inputs before organization,
  vector index, repository, scope, vector, or limit access.
- Corrupt vector hits with invalid `memory_record_id` payloads are ignored
  before repository hydration or vector-score fusion.
- Existing org strictness, legacy anonymous opt-in behavior, lexical
  oversampling, ranking, and hybrid fusion behavior is preserved.
- Focused retrieval and adjacent search/MCP tests, typecheck, build, audit,
  single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
