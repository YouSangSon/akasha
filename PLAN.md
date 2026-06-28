# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Static Bearer Timing Hardening

Status:
- Static bearer token checks now compare fixed-width SHA-256 digests.
- `matchBearer` scans the full configured static-token list before returning
  the first matched binding, avoiding obvious token-length and match-position
  timing differences.
- Focused auth tests cover first-token matches, later-token matches, and
  different-length input.
- Reviewer found no issues.
- Typecheck, build, audit, full test suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
