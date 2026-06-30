# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Unarchive Compaction Input Guards

Status:
- `unarchiveCompaction` now rejects invalid direct input before reading archive
  IDs, resolving archive rows, restoring records, chunking, embedding, or
  vector writes.
- Archive IDs must be an array of positive safe integers, and organization ID
  plus actor must be non-blank strings.
- Malformed direct input is covered with no-side-effect assertions across the
  archive repository, chunk repository, embedding client, and vector index.
- Existing empty-input, skip, restore, batching, compensation, and per-archive
  failure isolation behavior is preserved.
- Focused unarchive, adjacent MCP/HTTP, typecheck, build, audit,
  single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
