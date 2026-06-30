# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Search Ranking Timestamp Guards

Status:
- Search ranking helpers now reject non-canonical `updatedAt` timestamps before
  recency scoring or tie-break sorting.
- `newestUpdatedAtFor` rejects empty input, and `scoreSearchResult` rejects
  non-finite recency anchors before total-score calculation.
- Focused search tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
