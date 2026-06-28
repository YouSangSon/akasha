# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Goal-Run Repeat Threshold Validation

Status:
- Direct `check_repeat_attempt.threshold` calls now reject non-finite values,
  values less than or equal to zero, and values greater than one.
- Direct handler coverage verifies invalid thresholds fail before goal-run
  lookup or embedding work.
- Reviewer was unavailable due usage limit; self-review and local gates cover
  the change.

Loop closeout:
- Run focused and full verification, then commit locally; do not push.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
