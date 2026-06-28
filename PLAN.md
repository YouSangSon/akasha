# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Direct Retrieval Limit Validation

Status:
- `normalizeLimit()` now rejects direct retrieval limits that are non-finite,
  non-integer, zero, or negative before retrieval work.
- Direct registry coverage verifies `search_memory` and `build_context_pack`
  reject invalid limits before `retrieveMemory`.
- Reviewer `Dalton` reported no findings.
- Focused MCP tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Direct `record_iteration.memoryIds` validation before iteration mutation.
- Otherwise pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
