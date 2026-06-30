# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Semantic Duplicate Input Guards

Status:
- `cosineSimilarity` now rejects non-array direct vectors before length reads.
- `findSemanticDuplicates` now rejects invalid record collections, record IDs,
  importance values, embedding maps, and malformed embedding vectors before
  clustering.
- Missing embeddings still skip records, but explicit malformed embedding
  values now fail before semantic grouping.
- Existing cosine scoring, default threshold, missing-embedding skip behavior,
  and highest-importance/lowest-id keep rule are preserved.
- Focused semantic duplicate and adjacent compaction/goal-repeat tests,
  typecheck, build, audit, single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
