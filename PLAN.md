# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Direct Tag Array Guard

Status:
- Direct `update_memory` and `tag_memory` registry calls now reject configured
  non-array `tags` before canonical service resolution.
- `tags: undefined` still means no tag update for `update_memory`, and arrays
  still validate each tag for non-whitespace text.
- Worker implementation passed spec review and code-quality review with no
  findings.
- Focused MCP server tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
