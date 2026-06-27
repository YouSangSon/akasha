# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Repo Secret Hygiene

Goal: keep tracked source, docs, and fixtures free of high-confidence
secret-shaped literals without printing matched values in test failures.

Status:
- Repo-level Vitest hygiene guard scans tracked text files with Akasha's
  existing `scanForSecrets` helper.
- Known scrubber regex/example files stay excluded.
- Synthetic AWS/GitHub token examples outside scrubber tests are fragmented in
  tracked source.
- Database URL exceptions are limited to exact local placeholder pairs and the
  exact `${POSTGRES_USER:-memory}:${POSTGRES_PASSWORD:-memory}` form.
- Focused and full verification passed; no push was performed.

Loop closeout:
- Local commit is the terminal action for this loop; do not push.
- Choose the next target from `BACKLOG.md`.

## Next Loop Candidates

Pick one clear target from `BACKLOG.md`, preferring stability, tests,
scalability, developer experience, documentation, then new features.
