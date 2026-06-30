# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — MCP Utility Primitive Guards

Status:
- `formatMemoryIdentifier`, `normalizeLimit`, `toMemoryType`, and `summarize`
  now reject invalid direct primitive inputs before formatting, slicing, or
  conversion.
- Memory identifier records must include non-blank scope fields and positive
  safe-integer IDs.
- Limits must be numbers before positive integer range checks run; memory kinds
  and summary content must be strings before conversion/slicing.
- Existing formatting, default limit, supported memory-kind conversion, and
  summary truncation behavior is preserved.
- Focused MCP utility and adjacent MCP tests, typecheck, build, audit,
  single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
