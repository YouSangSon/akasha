# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Direct Audit Limit Guard

Status:
- Direct audit-log listing calls now reject invalid numeric limits before SQL
  instead of defaulting, flooring, or clamping them.
- Omitted limits still default to `100`, and valid boundary limits `1` and
  `1000` pass through unchanged.
- Reviewer subagent caught missing positive/default coverage; the gap was fixed
  and re-review found no issues.
- Focused audit/MCP tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
