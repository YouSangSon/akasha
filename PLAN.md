# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — In-Range Dependency Refresh

Status:
- `npm outdated` reports in-range updates for `@modelcontextprotocol/sdk`,
  `@qdrant/js-client-rest`, and `pg`.
- Lockfile now resolves `@modelcontextprotocol/sdk` 1.29.0,
  `@qdrant/js-client-rest` 1.18.0, and `pg` 8.22.0.
- Major upgrades are intentionally skipped without approval.
- Package metadata checked: compatible Node engines and MIT/Apache licenses.
- Review, build, audit, full test suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
