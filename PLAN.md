# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Docker ONNX Runtime Install Stability

Status:
- `docker/app.Dockerfile` builder and runner installs now set
  `ONNXRUNTIME_NODE_INSTALL_CUDA=skip`, matching CI's CPU-only install path
  and avoiding GPU provider downloads during image builds.
- CI installs now use the same environment variable form instead of npm's
  unknown CLI config path.
- Docker hardening tests now guard both Docker `npm ci` commands and the CI
  workflow for that env var.
- Worker implementation, spec review, code-quality review/re-review, focused
  tests, typecheck, build, audit, and the single-worker full suite passed.

Loop closeout:
- Commit locally without pushing.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
