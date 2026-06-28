# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Store-Memory Prompt Kind Validation

Status:
- `akasha_store_memory.kind` now uses the same memory-kind enum as service
  tools instead of accepting any nonblank text.
- Prompt protocol coverage rejects unsupported store-memory kinds before
  rendering instructions.
- Reviewer skipped after previous reviewer-agent timeouts; self-review found no
  issues.
- Focused MCP tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
