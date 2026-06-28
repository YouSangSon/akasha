# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Service Config Integer Parsing

Status:
- `PORT` and `EMBEDDING_DIMENSIONS` now require plain decimal positive integer
  strings; `PORT` still enforces the 1-65535 range.
- Config tests cover scientific, hex, binary, signed, fractional, whitespace,
  empty dimension, and out-of-range port inputs.
- English/Korean configuration docs now state the stricter integer format.
- Reviewer caught an empty `EMBEDDING_DIMENSIONS` fallback bypass; the parser
  now defaults only when the variable is undefined. Final re-review found no
  issues.
- Typecheck, build, audit, full test suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
