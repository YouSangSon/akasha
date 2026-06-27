# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Restore Smoke Qdrant Collection Names

Goal: keep the backup/restore runbook aligned with custom Qdrant collection
names and current uploaded-snapshot recovery behavior.

Status:
- Restore smoke exposes the manifest Qdrant collection as
  `RESTORE_SMOKE_QDRANT_COLLECTION_NAME`, with env/default fallback for older
  manifests.
- Self-hosted restore commands use the manifest-derived collection and Qdrant
  uploaded-snapshot `priority=snapshot`.
- Focused and full verification passed; no push was performed.

Loop closeout:
- Local commit is the terminal action for this loop; do not push.
- Choose the next target from `BACKLOG.md`.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
