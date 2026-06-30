# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Compose Env Flow Drift

Status:
- `.env.example` now describes Compose config flow as `${VAR:-default}`
  variable substitution instead of `env_file` substitution, matching
  `compose.yaml` and `docs/configuration.md`.
- Public docs drift coverage now guards the wording against regressing.
- Spec review, focused docs drift test, typecheck, build, audit, and the
  single-worker full suite passed.

Loop closeout:
- Commit locally without pushing.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
