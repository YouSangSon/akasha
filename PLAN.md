# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Ranking Input Guards

Status:
- `rankResults`, `newestUpdatedAtFor`, `rankCandidates`, and
  `scoreSearchResult` now reject invalid direct inputs before metadata scoring,
  timestamp tie-break sorting, or score fusion.
- Ranked records must provide valid ids, scope types, memory types, content, and
  source types before ranking weights are read.
- Candidate score totals and optional score options are validated before
  sorting or score component construction.
- Existing project/user ordering, metadata weights, recency scoring, vector and
  lexical score behavior, and canonical timestamp errors are preserved.
- Focused ranking and adjacent search/MCP tests, typecheck, build, audit,
  single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
