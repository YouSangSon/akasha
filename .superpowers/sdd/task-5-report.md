## Task 5 Report — Public Documentation And Stale Comment Sweep

### Branch

`feat/resilience-wave-2-audit-consistency`

### Scope executed

- Added the public docs drift test first and captured RED.
- Updated only the public docs and Korean mirrors named in the brief.
- Removed only the stale pgvector reindex comment from runtime source.
- Did not modify runtime behavior, Docker behavior, migrations, MCP behavior,
  HTTP routes, or archive cleanup logic.

### Files changed

- `README.md`
- `README.ko.md`
- `docs/architecture.md`
- `docs/architecture.ko.md`
- `docs/api-reference.md`
- `docs/api-reference.ko.md`
- `docs/deployment.md`
- `docs/deployment.ko.md`
- `docs/operations.md`
- `docs/operations.ko.md`
- `docs/security.md`
- `docs/security.ko.md`
- `docs/configuration.md`
- `docs/configuration.ko.md`
- `src/vector/pgvector-index.ts`
- `CHANGELOG.md`
- `CHANGELOG.ko.md`
- `tests/scripts/public-docs-drift.test.ts`

### RED first

Added `tests/scripts/public-docs-drift.test.ts` with the exact checks from the
brief, then ran:

```bash
npm test -- tests/scripts/public-docs-drift.test.ts
```

RED result:

```text
FAIL  tests/scripts/public-docs-drift.test.ts > public documentation drift checks > does not describe reindex orphan vectors as an open pgvector follow-up
FAIL  tests/scripts/public-docs-drift.test.ts > public documentation drift checks > documents descriptor-driven tool validation in API docs
FAIL  tests/scripts/public-docs-drift.test.ts > public documentation drift checks > documents non-root container runtime in security docs
```

### Documentation and comment updates

**Drift test**
- Added `tests/scripts/public-docs-drift.test.ts` to lock:
  - stale pgvector reindex comment removal
  - shared tool schema wording in API docs
  - non-root runtime wording in security docs

**Architecture**
- Replaced the old `Tool registry (src/mcp/server.ts)` box with descriptor-driven
  tool schema/registry/handler wording in English and Korean.
- Added the atomic archive cleanup claim semantics paragraph in English and Korean.

**API reference**
- Added the shared zod-backed tool schema validation paragraph in English and Korean.

**Deployment**
- Replaced the old sweeper coordination wording with the atomic claim /
  visibility-window explanation.
- Kept the recommendation to run one enabled replica by default.
- Tightened production secret wording to call out development defaults explicitly.

**Operations**
- Documented archive cleanup retry visibility semantics.
- Documented `failed` archive rows as operator-review items, not silent endless retries.

**Security**
- Added container runtime hardening guidance covering non-root runtime and
  replacing development credentials before production use.

**Configuration**
- Marked `QDRANT_API_KEY=local-qdrant-key` as a development-only default.
- Added explicit production guidance to replace default credentials with generated secrets.

**README**
- Added the one-line statement that HTTP and MCP share the same seven-tool schema surface.

**Changelog**
- Added `[Unreleased]` entries in English and Korean covering:
  - descriptor-shared validation
  - non-root runtime docs
  - production credential replacement guidance
  - atomic archive-cleanup claim semantics

**Stale comment sweep**
- Removed the `ORPHAN VECTORS ON REINDEX (KNOWN FOLLOW-UP)` block from
  `src/vector/pgvector-index.ts`.

### GREEN and verification

Focused drift test:

```bash
npm test -- tests/scripts/public-docs-drift.test.ts
```

Result:

```text
✓ tests/scripts/public-docs-drift.test.ts (3 tests)
```

Full gates run:

```bash
npm run typecheck
npm test
docker build -f docker/app.Dockerfile .
```

Results:

```text
npm run typecheck
  exit code 0

npm test
  Test Files  43 passed | 2 skipped (45)
  Tests       393 passed | 27 skipped (420)

docker build -f docker/app.Dockerfile .
  exit code 0
```

Final verification commands:

```bash
wc -l src/mcp/server.ts
rg -n "full schema validation lives in P17|ORPHAN VECTORS ON REINDEX|multi-replica-safe at the SQL level" src docs README.md README.ko.md
git status --short --untracked-files=all
```

Results:

```text
wc -l src/mcp/server.ts
  105 src/mcp/server.ts

rg ...
  no matches

git status --short --untracked-files=all
  only intentional Task 5 files changed before commit
```

### Self-review

- Kept changes inside the briefed ownership scope.
- Preserved bilingual docs where Korean mirrors existed.
- Preserved `EMBEDDING_PROVIDER=transformers` as default and kept `OPENAI_API_KEY`
  optional unless `EMBEDDING_PROVIDER=openai`.
- Did not change runtime logic; the only source edit was the stale comment removal.
- Drift coverage is intentionally narrow and high-signal: it protects the exact
  public claims the approved plan called out.

### Concerns

- None on scope or verification.
