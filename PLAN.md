# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Sweeper Interval Env Parsing

Status:
- `COMPACTION_SWEEP_INTERVAL_MS` and `INGEST_SWEEP_INTERVAL_MS` now require
  plain decimal integer strings.
- Partial numeric strings (`1000abc`) and JS numeric literal forms (`1e3`,
  `0x3e8`, `0b1111101000`) fail closed instead of being accepted.
- Focused loop tests cover partial, decimal, scientific, hex, and binary
  notation rejection.
- Reviewer caught the JS numeric literal compatibility issue; patch updated.
- Typecheck, build, audit, full test suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
