# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Unreleased Changelog Migration Range Drift

Status:
- `CHANGELOG.md` and `CHANGELOG.ko.md` Unreleased entries now describe the
  current migration range as `001-015`.
- `tests/scripts/public-docs-drift.test.ts` now checks only the Unreleased
  changelog section for the current range and stale `001-012` drift.

Loop closeout:
- Controller review and final commit; do not push from this loop.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
