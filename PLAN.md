# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Repeat Attempt Input Guards

Status:
- `findRepeatAttempts` now rejects invalid direct inputs before threshold
  resolution or cosine scoring.
- Candidate and prior failure embeddings must contain finite values, and prior
  embedding dimensions must match the candidate dimensions before comparison.
- Prior failure iteration indexes, attempts, and threshold values are validated
  before repeat matching.
- Existing default threshold, match filtering, and best-first ordering behavior
  is preserved.
- Focused repeat-detector and adjacent goal/MCP tests, typecheck, build, audit,
  single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
