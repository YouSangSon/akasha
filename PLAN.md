# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Compaction Plan Input Guards

Status:
- `buildCompactionPlan` now rejects invalid direct input before duplicate,
  decay, semantic-group override, or promotion planning.
- Plan records must provide valid IDs, memory/source types, content, created-at
  values, and finite optional importance.
- Scope, scope labels, dry-run flag, optional project key, decay parameters,
  injected dates, and semantic duplicate override groups are validated before
  summary/result construction.
- `shouldPromoteRecord` now rejects malformed direct records before source or
  content inspection.
- Existing exact duplicate detection, decay defaults, semantic override use,
  promotion candidate selection, and summary output behavior is preserved.
- Focused compaction-plan and adjacent compaction/MCP tests, typecheck, build,
  audit, single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
