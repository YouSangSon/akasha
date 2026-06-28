# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Rate Limit Integer Config

Status:
- `RATE_LIMIT_PER_MINUTE` now requires a plain positive integer string.
- Direct token-bucket construction rejects fractional capacities below or above
  1, preventing buckets that never accumulate a full request token.
- Focused tests cover fractional and non-decimal env values.
- Docs state the rate-limit cap is a positive integer.
- Reviewer agent timed out twice and was closed; local verification passed.
- Typecheck, build, audit, full test suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
