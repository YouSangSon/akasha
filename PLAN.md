# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Eval Threshold Env Guard

Status:
- Retrieval eval thresholds now use a strict parser instead of raw
  `Number(...)`.
- `EVAL_RECALL_THRESHOLD` and `EVAL_MRR_THRESHOLD` must be decimal values from
  `0` to `1` when provided, so whitespace no longer silently lowers thresholds
  to zero and invalid text cannot become `NaN`.
- Focused eval tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
