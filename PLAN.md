# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — User Scope Resolver Input Guards

Status:
- `resolveUserScopeId` now rejects invalid direct input before reading
  explicit/default user scope IDs, environment fallback, git config, or local
  OS user fallback.
- Resolver inputs must provide a non-blank string `cwd`; explicit and default
  user scope IDs must be strings when present.
- Existing explicit/default precedence, environment trimming, git-email hash,
  and local username fallback behavior is preserved.
- Focused MCP utility and adjacent MCP tests, typecheck, build, audit,
  single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
