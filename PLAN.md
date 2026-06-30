# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Audit Repository Input Guards

Status:
- `createAuditLogRepository` now rejects malformed pool handles before
  returning repository methods.
- Audit `record` now validates direct entry containers, required text fields,
  outcome enum values, optional text fields, and non-negative finite durations
  before constructing insert queries.
- Audit `listByOrganization` now rejects malformed options objects before
  resolving limits or querying.
- Existing organization checks, limit bounds, error-message truncation,
  audit-list behavior, and best-effort tool-boundary audit handling are
  preserved.
- Focused audit tests, typecheck, build, audit, single-worker full suite, and
  diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
