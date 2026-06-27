# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Background Worker Operations

Goal: make crash-recovery sweepers easier to run and observe in production.

Status:
- Goal-run hardening and public docs refresh are implemented.
- Sweeper tick metrics are implemented.
- Background queue backlog gauges and supporting indexes are implemented.
- Dedicated background worker lifecycle is implemented and under final
  documentation/verification.

Remaining for this loop:
- Document `npm run dev:worker` / `npm run start:worker` in README, config,
  operations, and deployment docs.
- Verify focused tests, typecheck, docs drift, and full `npm test`.
- Commit locally; do not push.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
