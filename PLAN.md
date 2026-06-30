# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — CLI Direct Input Guards

Status:
- `parseCliArgs` now rejects malformed direct argv containers and non-string
  argv entries before command parsing.
- `runCli` now rejects malformed direct option containers, invalid cwd values,
  and malformed registry containers before command dispatch.
- Omitted options, registry-free commands, and command-specific partial
  registry objects remain supported.
- Focused CLI tests, typecheck, build, audit, and the single-worker full suite
  passed.

Loop closeout:
- Commit the final CLI guard, then merge and push `main` per user request.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
