# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Qdrant Snapshot Collection Guard

Status:
- `snapshot-qdrant.sh` now rejects empty or whitespace-only
  `QDRANT_COLLECTION_NAME` values before metadata or curl snapshot work.
- Unset collection names still default to `memory_chunks_v1`, and valid
  collection names are preserved.
- Executable shell tests log curl/SSH/SCP calls and verify invalid collection
  names do no snapshot or remote work.
- Reviewer subagent found no implementation issues and caught a missing curl-log
  assertion, which was fixed before final verification.
- Focused backup tests, shell syntax checks, typecheck, build, audit, full
  suite, and diff whitespace checks passed.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
