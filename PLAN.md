# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Dependency Health Probe Input Guards

Status:
- `checkDependencies` now validates the direct probes container before
  iterating entries or reporting readiness checks.
- Dependency probe keys are constrained to the typed low-cardinality set:
  Postgres, Qdrant, and OpenAI.
- Probe builders now reject malformed Postgres pools, Qdrant/OpenAI inputs,
  optional fetch handles, blank credentials, and invalid timeout values before
  returning a probe closure.
- Existing `/readyz`, `/metrics` dependency gauges, probe failure reporting,
  and provider/backend probe selection behavior is preserved.
- Focused health tests, adjacent server/metrics tests, typecheck, build,
  audit, single-worker full suite, and diff checks passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
