# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Apply Compaction Input Guards

Status:
- `applyCompaction` now rejects invalid direct input before generated run IDs,
  semantic embedding, rate-limit checks, archive repository calls, or Qdrant
  deletes.
- The apply path reuses compaction-plan input validation and adds apply-specific
  checks for organization ID, actor, semantic threshold, dependency shape,
  rate-limit config, generated run IDs, and injected clock results.
- Malformed direct calls are covered with no-side-effect assertions across
  generated IDs, embeddings, archive repository calls, and vector deletes.
- Existing dry-run, apply, replay, rate-limit, duplicate/decay, semantic
  fallback, Qdrant-pending, and PG-failure behavior is preserved.
- Focused apply, adjacent compaction/MCP/HTTP, typecheck, build, audit,
  single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
