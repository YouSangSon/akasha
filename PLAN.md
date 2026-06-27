# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Public Docs Drift Coverage

Goal: make the docs index fail CI when a public docs page or English/Korean
pair is added without index coverage.

Status:
- `tests/scripts/public-docs-drift.test.ts` now discovers tracked public docs
  markdown under `docs/`, excluding `docs/superpowers/**` and docs index files.
- The guard checks English/Korean sibling pairs and both docs indexes'
  English-first / Korean-first link coverage.
- CI already runs `npm test`, so this guard runs in CI without workflow changes.
- Focused and full verification passed; no push was performed.

Loop closeout:
- Commit locally; do not push.
- Choose the next target from `BACKLOG.md`.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
