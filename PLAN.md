# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Lifecycle Init Path Guard

Status:
- Direct lifecycle initialization now rejects whitespace-only `repoDir` and
  optional `outDir` values before resolving paths or writing generated files.
- CLI-level blank `--out-dir` behavior is covered; direct tests also verify
  whitespace-only path inputs leave the temp repo empty.
- Reviewer subagent found a weak no-write assertion; it was tightened before
  final verification.
- Focused CLI tests, typecheck, build, audit, full suite, and diff whitespace
  checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
