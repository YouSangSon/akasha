# Task 4 Report: Container And Compose Hardening

## Scope

- Modified `docker/app.Dockerfile`
- Modified `compose.yaml`
- Modified `.env.example`
- Added `tests/scripts/dockerfile-hardening.test.ts`
- No test index or config update was required

## Preconditions

- Branch: `feat/resilience-wave-2-audit-consistency`
- Worktree status before edits: clean
- Read before implementation:
  - `README.md`
  - `CONTRIBUTING.md`
  - `docs/architecture.md`
  - `docs/configuration.md`
  - `docs/README.md`
  - `.superpowers/sdd/task-4-brief.md`

## TDD Evidence

### RED

Command:

```bash
npm test -- tests/scripts/dockerfile-hardening.test.ts
```

Observed failure:

```text
❯ tests/scripts/dockerfile-hardening.test.ts (2 tests | 2 failed)
  × docker/app.Dockerfile hardening > runs the runtime image as the non-root akasha user
    → expected 'FROM node:22-alpine AS builder\n\nWOR…' to contain 'addgroup -S -g 10001 akasha'
  × docker/app.Dockerfile hardening > creates a writable backup directory before switching users
    → expected 'FROM node:22-alpine AS builder\n\nWOR…' to contain 'mkdir -p /var/lib/developer-memory-os…'
```

Cause: the runtime stage still ran as root and did not create or chown the backup directory path required by the task.

### GREEN

Command:

```bash
npm test -- tests/scripts/dockerfile-hardening.test.ts tests/config/service-config.test.ts
```

Result:

```text
✓ tests/scripts/dockerfile-hardening.test.ts (2 tests)
✓ tests/config/service-config.test.ts (5 tests)
Test Files  2 passed (2)
Tests  7 passed (7)
```

## Implementation Summary

### `docker/app.Dockerfile`

- Added runtime user/group `akasha` with UID/GID `10001`
- Created `/var/lib/developer-memory-os/backups` before user switch
- Chowned `/app` and `/var/lib/developer-memory-os` to `akasha`
- Switched runtime stage to `USER akasha`

### `compose.yaml`

- Kept local development defaults unchanged
- Added production-hardening comments above:
  - `POSTGRES_PASSWORD`
  - `QDRANT__SERVICE__API_KEY`

### `.env.example`

- Kept values unchanged
- Updated comments for:
  - `POSTGRES_PASSWORD`
  - `QDRANT_API_KEY`
- Comments now state they are local defaults and should be replaced in production with generated secrets

## Verification

### Focused tests

```bash
npm test -- tests/scripts/dockerfile-hardening.test.ts tests/config/service-config.test.ts
```

Passed.

### Typecheck

```bash
npm run typecheck
```

Passed.

### Full test suite

```bash
npm test
```

Passed.

Summary:

```text
Test Files  42 passed | 2 skipped (44)
Tests  390 passed | 27 skipped (417)
```

### Docker build

```bash
docker build -f docker/app.Dockerfile .
```

Passed.

Notes:

- Build completed successfully with Docker Desktop's `docker-container` driver
- Docker emitted a non-failing cache-only warning because no `--load` or `--push` output target was specified

### Audit

```bash
npm audit --audit-level=moderate
```

Result:

```text
1 low severity vulnerability
esbuild allows arbitrary file read when running the development server on Windows
fix available via `npm audit fix`
```

This did not fail the requested audit threshold because the advisory severity is low, below `moderate`.

## Self-Review

- The runtime container now drops root privileges by default and still preserves the expected backup path
- Compose quick-start behavior remains unchanged for local use
- Documentation changes in this task are limited to inline compose and env comments only, per scope
- `tests/config/service-config.test.ts` did not need edits because runtime config behavior was unchanged

## Commit

Planned commit message:

```text
fix(docker): run app container as non-root
```
