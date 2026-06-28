# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Compaction Threshold Validation

Status:
- Direct `compact_memory.decayThreshold`, `halfLifeDays`, and
  `semanticDedupThreshold` now reject schema-invalid values before repository
  dispatch.
- Direct coverage verifies invalid threshold values fail before service
  dispatch and documented boundaries still reach the compaction path.
- Reviewer `McClintock` reported no findings.
- Focused MCP tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
