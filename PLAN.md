# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Bearer Token Comma List Guard

Status:
- `MEMORY_API_TOKENS` now rejects blank entries inside configured comma lists
  instead of silently dropping them.
- Unset and exact whole-empty values still disable static auth for documented
  loopback local development.
- Config docs and `.env.example` now call out blank-entry rejection.
- Worker implementation passed spec review; code-quality review found one
  missing whitespace-only test, which was fixed and re-reviewed cleanly.
- Focused bearer-auth tests, public docs drift guard, typecheck, build, audit,
  full suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
