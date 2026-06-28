# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — CLI Organization Flag Guard

Status:
- CLI `--organization-id` parsing now rejects whitespace-only values before
  registry dispatch or lifecycle file writes.
- Coverage verifies parse rejection, no registry dispatch, and no lifecycle
  output directory creation for invalid CLI organization IDs.
- Reviewer subagent found no issues; an init no-write regression was added for
  residual coverage.
- Focused CLI tests, typecheck, build, audit, full suite, and diff
  whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
