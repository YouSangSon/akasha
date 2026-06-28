# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Compaction Candidate ID Parsing

Status:
- `applyCompaction` now validates archive candidate IDs before creating a
  compaction run.
- Candidate IDs must be positive safe decimal integers, avoiding `parseInt`
  truncation such as `12abc` or `12.5` to `12`.
- Focused test covers fractional IDs failing before run creation, archive
  application, or vector deletion.
- Reviewer found no issues.
- Typecheck, build, audit, full test suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
