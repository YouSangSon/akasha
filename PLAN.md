# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Local ONNX Runtime CUDA Install Skip

Status:
- `install.sh` now runs the dependency install with
  `ONNXRUNTIME_NODE_INSTALL_CUDA=skip`, matching Dockerfile and CI installs.
- `tests/scripts/dockerfile-hardening.test.ts` guards Docker, CI, and local
  installer usage of the supported environment variable and rejects the npm
  unknown-config flag form.

Loop closeout:
- Controller review and final commit; do not push from this loop.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
