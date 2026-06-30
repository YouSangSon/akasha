# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Context Pack Record Input Guards

Status:
- `buildContextPack` now rejects invalid top-level input before record
  iteration.
- Context pack records must provide valid consumed id, scope, memory type,
  content, and source metadata before section selection or markdown rendering.
- Existing grouping, section caps, cache-friendly ordering, compact excerpts,
  and prompt-injection labeling behavior is preserved.
- Focused context-pack and adjacent goal/MCP tests, typecheck, build, audit,
  single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
