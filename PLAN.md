# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Unreleased Ingest Outbox Changelog Drift

Status:
- `CHANGELOG.md` and `CHANGELOG.ko.md` Unreleased now describe Migration 007
  as the shipped Qdrant outbox support for the implemented, opt-in ingest
  sweeper/retry loop.
- `tests/scripts/public-docs-drift.test.ts` now checks only the Unreleased
  Migration 007 ingest outbox bullet for stale `#12 branch`, `in-flight`, or
  `in-progress` wording, leaving older release history alone.

Loop closeout:
- Focused public docs drift test passed; controller review and final commit;
  do not push from this loop.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
