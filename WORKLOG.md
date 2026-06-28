# WORKLOG

## 2026-06-27

- Read project rules, README, contributing guide, architecture/config docs,
  docs index, package scripts, CI, and test layout.
- Confirmed no repo-local `CLAUDE.md` or `.agents/skills/` directory exists.
- Implemented goal-run hardening and documentation refresh in the active branch.
- Added sweeper metrics for compaction and ingest loops.
- Added `/metrics` background queue backlog gauges and partial indexes to avoid
  historical-row scans.
- Added dedicated background worker lifecycle:
  - `src/app/background-workers.ts`
  - `src/app/worker.ts`
  - `npm run dev:worker`
  - `npm run start:worker`
- Fixed review findings:
  - HTTP executable shutdown now awaits worker/probe cleanup via
    `closeOperatorServer()`.
  - Worker startup now happens only after HTTP bind succeeds.
  - Listen failure cleans the probe pool and does not start workers.
- Focused worker tests passed:
  `npm test -- tests/app/background-workers.test.ts tests/app/start-background-workers-server.test.ts tests/app/worker.test.ts tests/app/start-operator-server-metrics.test.ts`.
- Web/GitHub research:
  - Node HTTP docs confirmed `server.close()` handles HTTP close, while
    Akasha-owned worker/pool cleanup needs an app wrapper:
    https://nodejs.org/api/http.html#serverclosecallback
  - Redis `agent-memory-server` uses separate production API and background
    worker processes, matching the dedicated worker topology:
    https://github.com/redis/agent-memory-server
  - Node release data shows Node 20 is EOL as of 2026-04-30; added a backlog
    item to move runtime/CI support to active LTS lines:
    https://github.com/nodejs/release#release-schedule

Next:
- Commit locally.

Verification:
- `npm test -- tests/app/background-workers.test.ts tests/app/start-background-workers-server.test.ts tests/app/worker.test.ts tests/app/start-operator-server-metrics.test.ts`
- `npm test -- tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`62` files passed, `2` skipped; `605` tests passed, `34` skipped)
- `git diff --check`

## 2026-06-29

- Hardened OAuth organization claim validation:
  - Present blank or non-string organization claims now reject the token instead
    of silently becoming unbound.
  - OAuth verifier coverage verifies absent organization claims remain unbound
    while malformed present claims reject the JWT.
  - Reviewer subagent found no issues.

Verification:
- `npx vitest run tests/app/oauth-token-auth.test.ts tests/app/bearer-auth.test.ts tests/app/mcp-http.test.ts` (53 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (779 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened CLI organization flag validation:
  - `--organization-id` now rejects whitespace-only values before registry
    dispatch or lifecycle file writes.
  - CLI coverage verifies parse rejection, no registry dispatch, and no
    lifecycle output directory creation for invalid organization IDs.
  - Reviewer subagent found no issues; added an init no-write regression for
    residual coverage.

Verification:
- `npx vitest run tests/cli.test.ts` (19 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (776 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened vector upsert point organization validation:
  - Qdrant and pgvector adapters now reject missing, non-string, or
    whitespace-only `payload.organization_id` values before backend upsert
    calls.
  - Vector coverage verifies invalid upsert point organization payloads fail
    before Qdrant or pgvector work.
  - Reviewer subagent found no issues; added missing/non-string regressions for
    residual coverage.

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts` (40 passed, 12 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (773 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened unarchive-compaction organization validation:
  - `unarchiveCompaction` now rejects whitespace-only organization IDs before
    archive lookup, restore, chunking, embedding, vector writes, or mark
    updates.
  - Unarchive-compaction coverage verifies invalid organization IDs fail before
    those side effects.
  - Reviewer subagent found no issues.

Verification:
- `npx vitest run tests/compact/unarchive-compaction.test.ts tests/compact/apply-compaction.test.ts tests/compact/ingest-sweeper.test.ts tests/compact/outbox-sweeper.test.ts` (43 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (769 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened apply-compaction organization validation:
  - `applyCompaction` now rejects whitespace-only organization IDs before run ID
    generation, semantic embedding, rate-limit checks, archive writes, or vector
    deletes.
  - Apply-compaction coverage verifies invalid organization IDs fail before
    those side effects.
  - Reviewer subagent found no issues.

Verification:
- `npx vitest run tests/compact/apply-compaction.test.ts tests/compact/compact-memory.test.ts tests/compact/semantic-duplicates.test.ts tests/compact/decay-score.test.ts` (47 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (768 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened goal-run repository organization validation:
  - Repository entry points now reject whitespace-only organization IDs before
    SQL queries or transaction opens.
  - Goal-run repository coverage verifies invalid organization IDs fail before
    `pool.query()` or `pool.connect()`.
  - Reviewer subagent found no issues.

Verification:
- `npx vitest run tests/goal-run/goal-run-repository.test.ts tests/goal-run/goal-run-handlers.test.ts tests/goal-run/build-goal-context.test.ts tests/goal-run/find-repeat-attempts.test.ts` (44 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (767 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened vector point organization validation:
  - `buildVectorPoint` now rejects whitespace-only required organization IDs
    before producing vector payload metadata.
  - Point-builder coverage verifies invalid organization IDs fail immediately.
  - Reviewer subagent found no issues.

Verification:
- `npx vitest run tests/vector/point-builder.test.ts tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts` (36 passed, 12 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (762 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened vector adapter organization filters:
  - Qdrant and pgvector adapters now reject whitespace-only optional
    organization filters before backend query/delete work.
  - Vector coverage verifies invalid organization filters fail before backend
    calls.
  - Exact empty-string legacy behavior is pinned for query and delete paths.
  - Reviewer subagent found a compatibility coverage gap; added the
    exact-empty-string regressions in response.

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts` (33 passed, 12 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (761 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened ingest job creation organization validation:
  - `create` now rejects whitespace-only organization IDs before inserting
    ingest job rows.
  - Ingest job coverage verifies invalid organization IDs fail before
    `pool.query()`.
  - Reviewer subagent found no issues.

Verification:
- `npx vitest run tests/jobs/ingest-job-claim.test.ts tests/jobs/serialize-error.test.ts` (7 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (750 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened audit repository organization validation:
  - `record` and `listByOrganization` now reject whitespace-only organization
    IDs before writing or reading audit rows.
  - Audit repository coverage verifies invalid organization IDs fail before
    `pool.query()`.
  - Reviewer subagent found no issues.

Verification:
- `npx vitest run tests/audit/audit-truncation.test.ts tests/audit/audit-write.test.ts` (11 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (749 passed, 34 skipped across 65 files)
- `git diff --check`

## 2026-06-28

- Hardened canonical reindex organization validation:
  - `reindexCanonicalMemory` now rejects whitespace-only organization IDs
    before chunk listing, embedding, or vector work.
  - Canonical indexing coverage verifies invalid organization IDs fail before
    indexing side effects.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/canonical-indexing.test.ts` (26 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (747 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened canonical write-path organization validation:
  - `writeCanonicalMemory` now rejects whitespace-only returned record
    organization IDs before ingest job creation or indexing side effects.
  - Canonical indexing coverage verifies invalid organization IDs fail before
    ingest and indexing work.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/canonical-indexing.test.ts` (25 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (746 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened canonical refresh organization validation:
  - `refreshCanonicalMemoryIndex` now rejects whitespace-only record
    organization IDs before embedding, chunk replacement, or vector work.
  - Canonical indexing coverage verifies invalid organization IDs fail before
    indexing side effects.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/canonical-indexing.test.ts` (24 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (745 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened canonical chunk replacement organization validation:
  - `replaceChunksForRecord` and `replaceChunksForRecordWithPendingIngest` now
    reject whitespace-only record organization IDs before opening transactions.
  - Canonical indexing coverage verifies invalid organization IDs fail before
    `pool.connect()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/canonical-indexing.test.ts` (23 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (744 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened canonical chunk insert organization validation:
  - `insertChunks` now rejects whitespace-only record organization IDs before
    inserting canonical chunks.
  - Canonical indexing coverage verifies invalid organization IDs fail before
    `pool.query()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/canonical-indexing.test.ts` (21 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (742 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened context-pack run organization validation:
  - `createContextPackRun` now rejects whitespace-only organization IDs before
    inserting context-pack run rows.
  - Canonical indexing coverage verifies invalid organization IDs fail before
    `pool.query()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/canonical-indexing.test.ts` (20 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (741 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened canonical chunk list organization validation:
  - `listChunks` now rejects whitespace-only organization IDs before listing
    canonical chunks.
  - Canonical indexing coverage verifies invalid organization IDs fail before
    `pool.query()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/canonical-indexing.test.ts` (19 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (740 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened canonical chunk delete organization validation:
  - `deleteChunksForRecord` now rejects whitespace-only organization IDs before
    deleting canonical chunks.
  - Canonical indexing coverage verifies invalid organization IDs fail before
    `pool.query()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/canonical-indexing.test.ts` (18 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (739 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened compaction run scope validation:
  - `createCompactionRun` now rejects whitespace-only scope type and scope ID
    values before inserting compaction run rows.
  - Archive repository coverage verifies invalid compaction run scope inputs
    fail before `pool.query()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-archive-repository.test.ts` (33 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (738 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened scope-lock key validation:
  - `acquireScopeLock` now rejects whitespace-only scope type and scope ID
    values before advisory lock queries.
  - Archive repository coverage verifies invalid scope-lock key inputs fail
    before `pool.query()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-archive-repository.test.ts` (31 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (736 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened scope-lock organization validation:
  - `acquireScopeLock` now rejects whitespace-only organization IDs before
    advisory lock queries.
  - Archive repository coverage verifies invalid organization IDs fail before
    `pool.query()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-archive-repository.test.ts` (29 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (734 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened recent apply-count organization validation:
  - `countRecentApplyRuns` now rejects whitespace-only organization IDs before
    rate-limit count queries.
  - Archive repository coverage verifies invalid organization IDs fail before
    `pool.query()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-archive-repository.test.ts` (28 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (733 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened restored-record cleanup organization validation:
  - `deleteRestoredCanonicalRecord` now rejects whitespace-only organization
    IDs before cleanup deletes.
  - Archive repository coverage verifies invalid organization IDs fail before
    `pool.query()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-archive-repository.test.ts` (27 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (732 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened archive restore organization validation:
  - `restoreToCanonical` now rejects whitespace-only organization IDs before
    restoring archived rows into canonical memory.
  - Archive repository coverage verifies invalid organization IDs fail before
    `pool.query()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-archive-repository.test.ts` (26 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (731 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened archive lookup organization validation:
  - `findArchiveByIds` now rejects whitespace-only organization IDs before
    archive lookup.
  - Archive repository coverage verifies invalid organization IDs fail before
    `pool.query()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-archive-repository.test.ts` (25 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (730 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened archive run creation organization validation:
  - `createCompactionRun` now rejects whitespace-only organization IDs before
    inserting compaction run rows.
  - Archive repository coverage verifies invalid organization IDs fail before
    `pool.query()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-archive-repository.test.ts` (24 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (729 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened archive apply organization validation:
  - `applyCompactionRecord` now rejects whitespace-only organization IDs before
    issuing the canonical DELETE/archive INSERT query.
  - Archive repository coverage verifies invalid organization IDs fail before
    `pool.query()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-archive-repository.test.ts` (23 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (728 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened repository get-by-id organization validation:
  - `getMemoryRecordById` now rejects whitespace-only organization IDs before
    issuing a Postgres query.
  - Repository coverage verifies invalid organization IDs fail before
    `pool.query()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts` (46 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (727 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened graph inspect organization validation:
  - `inspectMemoryGraph` now rejects whitespace-only organization IDs before
    issuing graph queries.
  - Repository coverage verifies invalid organization IDs fail before
    `pool.query()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts` (45 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (726 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened governance list organization validation:
  - `listMemoryForGovernance` now rejects whitespace-only organization IDs
    before issuing a Postgres query.
  - Repository coverage verifies invalid organization IDs fail before
    `pool.query()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts` (44 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (725 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened repository search organization validation:
  - `searchMemory` now rejects whitespace-only organization IDs before issuing
    a Postgres query.
  - Repository coverage verifies invalid organization IDs fail before
    `pool.query()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts` (43 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (724 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened shared read organization validation:
  - `assertOrganizationId` now rejects whitespace-only organization IDs even
    when the legacy anonymous read flag is enabled.
  - Store and retrieval coverage verifies `listMemory`,
    `getMemoryRecordsByIds`, and `retrieveMemory` fail before query/vector
    work.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/search/retrieve-memory.test.ts` (52 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (723 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened repository delete organization validation:
  - `deleteMemoryRecord` now rejects whitespace-only organization IDs before
    issuing a Postgres query.
  - Repository coverage verifies invalid organization IDs fail before
    `pool.query()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts` (40 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (720 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened repository archive organization validation:
  - `archiveMemoryRecord` now rejects whitespace-only organization IDs before
    issuing a Postgres query.
  - Repository coverage verifies invalid organization IDs fail before
    `pool.query()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts` (39 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (719 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened repository update organization validation:
  - `updateMemoryRecord` now rejects whitespace-only organization IDs before
    opening a Postgres transaction.
  - Repository coverage verifies invalid organization IDs fail before
    `pool.connect()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts` (38 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (718 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened repository add organization validation:
  - `addMemory` now rejects whitespace-only organization IDs before opening a
    Postgres transaction.
  - Repository coverage verifies invalid organization IDs fail before
    `pool.connect()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts` (37 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (717 passed, 34 skipped across 65 files)
- `git diff --check`

- Normalized blank repository add metadata:
  - `addMemory` now normalizes explicitly supplied blank title and summary
    values to `null` before persistence.
  - Repository coverage verifies SQL insert parameters and hydrated output use
    `null` instead of whitespace-only metadata.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts` (36 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (716 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened repository add secret scrubbing:
  - `addMemory` now rejects secret-shaped content, titles, and summaries before
    opening a Postgres transaction.
  - Repository coverage verifies AWS key, GitHub token, and Stripe key
    detections fail before `pool.connect()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts` (35 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (715 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened repository add value validation:
  - `addMemory` now rejects invalid memory kind, durability, and importance
    values before opening a Postgres transaction.
  - Repository coverage verifies invalid enum values and non-Postgres-integer
    importance fail before `pool.connect()`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts` (32 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (712 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened repository update value validation:
  - `updateMemoryRecord` now rejects invalid memory kind, durability, and
    importance values before issuing SQL updates.
  - Repository coverage verifies invalid enum values and non-Postgres-integer
    importance roll back before `UPDATE memory_records`.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts` (31 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (711 passed, 34 skipped across 65 files)
- `git diff --check`

- Normalized blank repository metadata patches:
  - `updateMemoryRecord` now normalizes explicitly supplied blank title and
    summary values to `null` before persistence.
  - Repository coverage verifies SQL update parameters and hydrated output use
    `null` instead of whitespace-only metadata.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts` (30 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (710 passed, 34 skipped across 65 files)
- `git diff --check`

- Normalized blank update-memory metadata patches:
  - Direct `update_memory.title` and `summary` preserve omitted fields but
    normalize blank or null patches to `null`.
  - Direct coverage verifies whitespace-only metadata clears before repository
    dispatch instead of persisting whitespace-only strings.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/mcp/server.test.ts` (120 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (709 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened store-memory prompt kind enum validation:
  - `akasha_store_memory.kind` now uses the supported memory-kind enum instead
    of accepting arbitrary nonblank text.
  - Prompt protocol coverage rejects unsupported store-memory kinds before
    rendering instructions.
  - Reviewer skipped after previous reviewer-agent timeouts; self-review found
    no issues.

Verification:
- `npx vitest run tests/mcp/server.test.ts` (119 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (708 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened direct add-memory kind enum validation:
  - Direct `add_memory.kind` now rejects unsupported memory kinds before
    legacy repository resolution or canonical service dispatch.
  - Direct coverage verifies invalid kinds fail before either backing store
    path is resolved.
  - Reviewer `Erdos` timed out twice; self-review found no issues.

Verification:
- `npx vitest run tests/mcp/server.test.ts` (118 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (707 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened direct graph entity-kind enum validation:
  - `inspect_memory_graph.kind` now rejects unsupported entity kinds before
    canonical repository dispatch.
  - MCP schemas reuse the entity module's `ENTITY_KIND_VALUES` tuple so public
    and direct validation share the same source of truth.
  - Subagent reviewer `Ptolemy` reported no findings.

Verification:
- `npx vitest run tests/mcp/server.test.ts` (117 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (706 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened direct memory scope enum validation:
  - Direct `add_memory`, `compact_memory`, `list_memory`, and
    `inspect_memory_graph` now reject unsupported `scope` values before
    repository or canonical service dispatch.
  - Direct coverage verifies invalid scopes fail before legacy repository
    resolution or canonical repository calls.
  - Subagent reviewer `Einstein` reported no findings.

Verification:
- `npx vitest run tests/mcp/server.test.ts` (116 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (705 passed, 34 skipped across 65 files)
- `git diff --check`

- Added HTTP goal-run enum validation coverage:
  - HTTP `/v1/goal-run/*` coverage verifies invalid scope, status, and outcome
    values reject before registry dispatch.
  - Coverage exercises valid auth/body shape so failures prove route schema
    validation, not auth or body parsing.
  - Subagent reviewer `Dirac` reported no findings.

Verification:
- `npx vitest run tests/app/server.test.ts` (65 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (704 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened goal-run enum validation:
  - Public and direct goal-run scope, iteration outcome, and list status
    validation now share the same allowed-value constants before service
    dispatch.
  - Direct coverage rejects invalid enum values before goal-run service
    dispatch.
  - Subagent reviewer `Noether` reported no findings.

Verification:
- `npx vitest run tests/goal-run/goal-run-handlers.test.ts` (22 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (703 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened memory enum validation:
  - Public and direct `update_memory.kind` and `durability` validation now
    share the same allowed-value constants before repository dispatch.
  - Direct coverage rejects invalid enum values before repository dispatch and
    proves valid enum updates still refresh the index path.
  - Subagent reviewer `Sartre` reported no findings.

Verification:
- `npx vitest run tests/mcp/server.test.ts` (115 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (702 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened memory importance bounds:
  - Public and direct `update_memory.importance` validation now matches the
    Postgres `INTEGER` range before repository dispatch.
  - Direct coverage rejects non-integers, non-finite values, and out-of-range
    integers; public schema coverage accepts/rejects the int32 boundaries.
  - Subagent reviewer `Bohr` caught JavaScript-safe integer drift; after the
    fix, re-review reported no findings.

Verification:
- `npx vitest run tests/mcp/server.test.ts` (113 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (700 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened direct compaction threshold validation:
  - Direct `compact_memory.decayThreshold`, `halfLifeDays`, and
    `semanticDedupThreshold` reject schema-invalid values before repository
    dispatch.
  - Direct coverage verifies invalid threshold values fail before service
    dispatch and documented boundaries still reach the compaction path.
  - Subagent reviewer `McClintock` reported no findings.

Verification:
- `npx vitest run tests/mcp/server.test.ts` (110 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (697 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened direct compaction limit validation:
  - Direct `compact_memory.limit` rejects invalid and over-limit values before
    repository dispatch.
  - Direct coverage verifies invalid limits fail before service dispatch and
    the documented maximum `5000` still reaches the repository.
  - Subagent reviewer `Huygens` reported no findings.

Verification:
- `npx vitest run tests/mcp/server.test.ts` (108 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (695 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened direct goal-context limit validation:
  - Direct `build_goal_context.limit` rejects invalid and over-limit values
    before goal-run lookup or memory listing.
  - Direct coverage verifies invalid limits fail before service dispatch and
    the documented maximum `200` still reaches the repository.
  - Subagent reviewer `Aquinas` reported no findings.

Verification:
- `npx vitest run tests/goal-run/goal-run-handlers.test.ts` (21 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (693 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened direct governance list and graph limit validation:
  - Direct `list_memory.limit`, `inspect_memory_graph.limit`, and
    `inspect_memory_graph.relationshipLimit` reject invalid and over-limit
    values before governance repository dispatch.
  - Direct coverage verifies invalid limits fail before repository calls and
    the documented maximum `5000` still reaches the repository.
  - Subagent reviewer `Arendt` reported no findings.

Verification:
- `npx vitest run tests/mcp/server.test.ts` (106 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (691 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened direct audit log limit validation:
  - Direct `list_audit_log.limit` rejects invalid and over-limit values before
    audit repository dispatch.
  - Direct coverage verifies invalid limits fail before `listByOrganization`
    and the documented maximum `1000` still reaches the repository.
  - Subagent reviewer `Franklin` requested boundary coverage; after the fix,
    re-review reported no findings.

Verification:
- `npx vitest run tests/mcp/server.test.ts` (104 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (689 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened direct governance memory ID validation:
  - Direct `update_memory`, `delete_memory`, and `tag_memory` reject invalid
    `memoryId` values before canonical service dispatch.
  - Direct coverage verifies invalid memory IDs fail before repository update
    or archive calls.
  - Subagent reviewer `Banach` reported no findings.

Verification:
- `npx vitest run tests/mcp/server.test.ts` (102 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (687 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened unarchive archive ID validation:
  - `unarchive_memory.archiveIds` now uses the shared positive safe integer
    schema and direct handler guard.
  - Direct coverage verifies invalid archive IDs fail before canonical service
    resolution or archive lookup, while preserving the existing `[]` no-op.
  - HTTP coverage verifies unsafe archive IDs reject before registry dispatch.
  - Explorer `Aristotle` confirmed this was the next smallest validation gap;
    reviewer `Lagrange` reported no findings.

Verification:
- `npx vitest run tests/mcp/server.test.ts tests/app/server.test.ts`
  (165 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (686 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened goal-run ID validation:
  - Direct goal-run handlers reject invalid `goalRunId` values before
    `recordIteration`, `get`, `complete`, `abandon`, context, or repeat-check
    service dispatch.
  - Public schemas use a shared positive safe integer schema for goal-run IDs,
    memory governance IDs, and iteration memory links.
  - HTTP coverage verifies unsafe `goalRunId` rejects before registry dispatch.
  - Subagent reviewer `Hume` caught the schema/handler mismatch; re-review by
    `Poincare` reported no findings.

Verification:
- `npx vitest run tests/goal-run/goal-run-handlers.test.ts tests/app/server.test.ts`
  (82 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (684 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened direct iteration memory-link validation:
  - Direct `record_iteration.memoryIds` now rejects `NaN`, unsafe, non-integer,
    zero, and negative IDs before `goalRuns.recordIteration`.
  - Direct handler coverage verifies invalid memory links fail before iteration
    mutation.
  - Subagent reviewer `Kant` caught unsafe integer acceptance; the guard now
    uses `Number.isSafeInteger()`.

Verification:
- `npx vitest run tests/goal-run/goal-run-handlers.test.ts tests/goal-run/goal-run-repository.test.ts`
  (25 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (682 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened direct retrieval limit validation:
  - `normalizeLimit()` now rejects `NaN`, non-integer, zero, and negative
    limits before retrieval work while preserving the default `10` and cap
    `100`.
  - Direct registry coverage verifies `search_memory` and `build_context_pack`
    reject invalid limits before `retrieveMemory` is called.
  - Subagent reviewer `Dalton` reported no findings.
  - Subagent explorer `Kierkegaard` found the next write-path candidate:
    direct `record_iteration.memoryIds` validation before iteration mutation.

Verification:
- `npx vitest run tests/mcp/server.test.ts` (100 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (681 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened repeat-check threshold validation:
  - Direct `check_repeat_attempt.threshold` rejects `NaN`, values less than or
    equal to zero, and values greater than one before goal-run lookup or
    embedding work.
  - Direct handler coverage verifies invalid thresholds fail without
    `goalRuns.get` or embedding side effects.
  - Subagent reviewer `Copernicus` was unavailable due usage limit; self-review
    covered the small validation change.

Verification:
- `npx vitest run tests/goal-run/goal-run-handlers.test.ts` (17 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (680 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened MCP context optional text validation:
  - `add_memory_interactive.message` and
    `classify_memory_candidate.instruction` now reuse
    `nonBlankTextInputSchema`.
  - Protocol coverage verifies whitespace-only values fail before elicitation
    or sampling side effects.
  - Subagent reviewer `Helmholtz` reported no findings.

Verification:
- `npx vitest run tests/mcp/server.test.ts` (99 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (679 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened governance tag validation:
  - `update_memory.tags` and `tag_memory.tags` now reject whitespace-only tag
    entries in public schemas and direct handlers before repository update or
    vector refresh.
  - Empty tag arrays remain valid for intentional tag clearing.
  - Direct registry, HTTP, and MCP protocol tests cover blank tag rejection;
    direct and HTTP tests cover `tags: []`.
  - Subagent reviewer `Singer` reported no findings and requested the positive
    `tags: []` guard, which was added before commit.

Verification:
- `npx vitest run tests/mcp/server.test.ts tests/app/server.test.ts`
  (160 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (678 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened organization ID validation:
  - MCP service/context input schemas now reject whitespace-only
    `organizationId` values.
  - Direct registry calls reject whitespace-only `organizationId` before
    handler dispatch or audit writes.
  - HTTP routes keep blank string body `organizationId` as absent, but reject
    present non-string body values before token/header organization enrichment.
  - Subagent reviewer `Godel` caught the blank-body HTTP regression;
    `Heisenberg` caught non-string values being omitted; `Cicero` caught the
    token-bound overwrite case. Follow-up review by `Newton` reported no
    issues.

Verification:
- `npx vitest run tests/app/server.test.ts tests/mcp/server.test.ts tests/mcp/resolve-org.test.ts`
  (173 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (677 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened MCP context and prompt nonblank validation:
  - Elicited memory `projectKey`, sampled classification `summary`,
    `akasha_session_start` `organizationId`/`projectKey`, and
    `akasha_store_memory` `projectKey`/`kind` now reuse
    `nonBlankTextInputSchema`.
  - Protocol tests cover blank elicited project keys, blank sampled summaries,
    and blank prompt identifiers before storage or dispatch.
  - Subagent reviewer `Pascal` reported no findings.

Verification:
- `npx vitest run tests/mcp/server.test.ts` (95 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (672 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened scope identifier validation:
  - `projectKey` and `userScopeId` now reject whitespace-only values in public
    schemas and shared direct-handler scope guards.
  - Tests cover HTTP, MCP protocol, direct retrieval, `resolveRepository`
    dispatch, and goal-run scope paths.
  - Subagent reviewer `Curie` caught direct-registry bypasses for
    `resolveRepository` and ignored `userScopeId`; the follow-up guard and
    regression tests closed both. Re-review by `Averroes` reported no issues.

Verification:
- `npx vitest run tests/goal-run/goal-run-handlers.test.ts tests/app/server.test.ts tests/mcp/server.test.ts`
  (167 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (669 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened optional goal-run note normalization:
  - `terminationCriteria`, iteration `summary`/`error`, complete
    `resolution`, and abandon `reason` now normalize blank/whitespace strings
    to `null` at the handler boundary.
  - Direct handler coverage verifies service payloads before persistence.
  - Subagent reviewer `Sagan` reported no findings.

Verification:
- `npx vitest run tests/goal-run/goal-run-handlers.test.ts` (15 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (664 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened goal-run required text validation:
  - `start_goal_run.goal`, `record_iteration.attempt`, and
    `check_repeat_attempt.attempt` now reject whitespace-only text at schema
    and direct registry handler boundaries.
  - Tests cover HTTP, MCP protocol, and direct handler paths before goal-run
    service or embedding dispatch.
  - Subagent reviewer `Ramanujan` reported no findings.

Verification:
- `npx vitest run tests/goal-run/goal-run-handlers.test.ts tests/app/server.test.ts tests/mcp/server.test.ts`
  (161 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (663 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened governance filter validation:
  - `list_memory.tag` and `inspect_memory_graph.query` now reject
    whitespace-only text at schema and direct registry handler boundaries.
  - Tests cover HTTP, MCP protocol, and direct canonical registry paths before
    repository dispatch.
  - Subagent reviewer `Pauli` reported no findings.

Verification:
- `npx vitest run tests/app/server.test.ts tests/mcp/server.test.ts`
  (145 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (658 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened MCP resource parameter validation:
  - MCP resource URL parsing now rejects whitespace-only decoded path
    segments, recent-memory `query`, and optional search params before
    registry dispatch.
  - Protocol tests cover invalid recent-memory and context-pack resource URIs
    before `search_memory` / `build_context_pack` dispatch.
  - Subagent reviewer `Archimedes` reported no findings.

Verification:
- `npx vitest run tests/mcp/server.test.ts` (86 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (655 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened session prompt task validation:
  - `akasha_session_start.task` now rejects whitespace-only text through the
    MCP prompt argument schema.
  - Protocol coverage verifies blank prompt tasks fail before
    `build_context_pack` dispatch.
  - Subagent reviewer `Galileo` reported no findings.

Verification:
- `npx vitest run tests/mcp/server.test.ts` (80 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (649 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened search/context text validation:
  - `search_memory.query` and `build_context_pack.task` now reject
    whitespace-only text at HTTP/MCP schema and direct registry handler
    boundaries.
  - Direct registry guards protect both override-backed retrieval and canonical
    services paths before embedding, vector search, or context-pack run
    persistence.
  - Tests cover HTTP, MCP protocol, direct retrieveMemory override, and
    canonical services paths.
  - Subagent reviewer `Hubble` reported no findings.

Verification:
- `npx vitest run tests/app/server.test.ts tests/mcp/server.test.ts`
  (135 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (648 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened service config integer parsing:
  - `PORT` and `EMBEDDING_DIMENSIONS` now require plain decimal positive
    integer strings instead of accepting every JavaScript `Number(...)`
    integer form.
  - `PORT` still enforces the 1-65535 range.
  - Focused tests cover scientific, hex, binary, signed, fractional,
    whitespace, empty dimension, and out-of-range port inputs.
  - English/Korean configuration docs now state the stricter integer format.
  - Subagent reviewer `Rawls` caught an empty `EMBEDDING_DIMENSIONS` fallback
    bypass; the parser now defaults only when the variable is undefined.
    Re-review reported no findings.

Verification:
- `npx vitest run tests/config/service-config.test.ts tests/scripts/public-docs-drift.test.ts`
  (42 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (643 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened memory content validation:
  - Memory writes now reject whitespace-only content at HTTP/MCP schema,
    direct registry handler, canonical write, and repository add/update
    boundaries.
  - CLI, HTTP, MCP protocol, direct registry, canonical indexing, and
    repository tests cover blank content rejection before dispatch or
    persistence side effects.
  - Initial review caught that schema-only validation missed direct
    registry/CLI/canonical write paths; the patch was moved to a shared
    store-level invariant and re-tested.
  - Follow-up review requested direct repository and MCP protocol coverage;
    the added tests closed both gaps. Final re-review reported no issues.

Verification:
- `npx vitest run tests/cli.test.ts tests/app/server.test.ts tests/mcp/server.test.ts tests/store/canonical-indexing.test.ts tests/store/memory-repository.test.ts`
  (192 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (628 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened compaction apply candidate ID parsing:
  - `applyCompaction` now validates archive candidate IDs before creating a
    compaction run.
  - Candidate IDs must be positive safe decimal integers, avoiding `parseInt`
    truncation such as `12abc` or `12.5` to `12`.
  - Regression coverage verifies fractional IDs fail before run creation,
    archive application, or vector deletion.
  - Subagent reviewer `Bacon` reported no findings on the staged patch.

Verification:
- `npx vitest run tests/compact/apply-compaction.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (618 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened HTTP rate-limit configuration:
  - `RATE_LIMIT_PER_MINUTE` now requires a plain positive integer string.
  - Direct token-bucket construction rejects fractional capacities below or
    above 1, preventing buckets that can never accumulate a full request token.
  - Focused tests cover fractional and non-decimal env values (`0.5`,
    `100.5`, `100abc`, `1e2`, `0x64`).
  - English/Korean configuration docs now state the cap is a positive integer.
  - Subagent reviewer `Darwin` timed out twice and was closed before returning
    findings; local verification completed.

Verification:
- `npx vitest run tests/app/rate-limit.test.ts tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (617 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened sweeper interval env parsing:
  - `COMPACTION_SWEEP_INTERVAL_MS` and `INGEST_SWEEP_INTERVAL_MS` now require
    plain decimal integer strings before conversion.
  - Partial numeric strings like `1000abc` fail closed instead of truncating to
    `1000`.
  - Scientific, hex, and binary JS numeric literal forms (`1e3`, `0x3e8`,
    `0b1111101000`) fail closed instead of being accepted by `Number`.
  - Focused tests cover both compaction and ingest sweeper parsers.
  - Subagent reviewer `Euler` caught the JS numeric literal compatibility
    issue; the patch was updated before final verification.

Verification:
- `npx vitest run tests/compact/sweeper-loop.test.ts tests/compact/ingest-sweeper-loop.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (616 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened static bearer-token comparison:
  - `matchBearer` now hashes provided and configured static tokens to
    fixed-width SHA-256 digests before `timingSafeEqual`.
  - The matcher scans every configured static token and returns the first
    matched binding after the scan, avoiding obvious token-length and
    match-position timing differences.
  - Focused tests cover first-token matches, later-token matches, and
    different-length input.
  - Subagent reviewer `Raman` reported no findings on the staged patch.

Verification:
- `npx vitest run tests/app/bearer-auth.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (616 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Refreshed in-range dependency lockfile/install updates:
  - `@modelcontextprotocol/sdk` 1.28.0 -> 1.29.0.
  - `@qdrant/js-client-rest` 1.17.0 -> 1.18.0.
  - `pg` 8.20.0 -> 8.22.0, including its in-range transitive `pg-*`
    packages.
  - Skipped major upgrades reported by `npm outdated` without approval.
  - Checked package metadata: Node engines remain compatible with the Node 22
    floor, licenses are MIT or Apache-2.0, and `npm audit` reported 0
    vulnerabilities after update.

Verification:
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (615 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Updated general operations Qdrant restore examples to use the host-published
  Qdrant port:
  - English/Korean operations docs now call host `curl` against
    `http://127.0.0.1:6333/...` instead of assuming the Qdrant container has
    `curl` installed.
  - Public docs drift coverage now guards against reintroducing
    `docker compose exec qdrant curl -X POST` in the restore example.

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (615 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Aligned general operations Qdrant restore examples with collection-name
  configuration:
  - English/Korean operations docs now use `QDRANT_COLLECTION_NAME` for the
    snapshot upload collection instead of hardcoding `memory_chunks_v1`.
  - The upload examples include `priority=snapshot`, matching the self-hosted
    restore-smoke command.
  - Public docs drift coverage now guards both operations and self-hosted
    restore upload paths.

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (615 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Fixed architecture docs embedding module filename drift:
  - English/Korean architecture docs now reference the real
    `src/embedding/local-embedding.ts` module instead of the stale pluralized
    path.
  - Public docs drift coverage now verifies all documented embedding provider
    module filenames exist and are listed in both architecture docs.

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (615 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Removed stale Transformers dynamic-import TypeScript suppression:
  - `@huggingface/transformers` is a regular dependency and ships declarations.
  - `src/embedding/transformers-embedding.ts` no longer needs the old
    `@ts-ignore` before the dynamic import.

Verification:
- `npx vitest run tests/embedding/transformers-embedding.test.ts tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (614 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Aligned Transformers dependency docs/comments with package metadata:
  - `package.json` installs `@huggingface/transformers` as a regular runtime
    dependency because `EMBEDDING_PROVIDER=transformers` is the default.
  - Code comments and public docs no longer call it an optional dependency.
  - The runtime error now points at a missing/pruned runtime install instead of
    optional dependency installation.
  - Public docs drift coverage now guards the English/Korean docs and source
    comments against reintroducing optional-dependency wording while the package
    remains in `dependencies`.

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (614 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Clarified dedicated worker metrics guidance:
  - Operations runbooks now separate in-process HTTP sweeper tick counters from
    dedicated worker mode.
  - Dedicated `npm run start:worker` operators should use worker process logs
    for tick activity and HTTP `/metrics` only for Postgres backlog gauges.
  - API and operations docs now state that the dedicated worker currently has
    no HTTP metrics listener.
  - Public docs drift coverage now guards the English/Korean wording.
- Source rationale:
  - Prometheus `scrape_config` entries define the targets Prometheus scrapes;
    a dedicated worker process without an HTTP listener is not a scrape target:
    https://prometheus.io/docs/prometheus/latest/configuration/configuration/#scrape_config

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (613 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Implemented Node runtime support update:
  - `package.json` and root lock metadata now require Node `>=22`.
  - `@types/node` now targets the Node 22 line so TypeScript cannot silently
    admit Node 24-only APIs while package support starts at Node 22.
  - GitHub Actions CI now runs Node 22 and 24.
  - README badges/quick-start docs, troubleshooting docs, and `install.sh`
    now state/enforce Node.js >= 22.
  - Public docs drift tests now guard package metadata, lock metadata, README
    badges, troubleshooting docs, CI matrix, and installer runtime checks.
- Review gates:
  - Spec compliance passed.
  - Quality review initially caught Node 24 type definitions and missing
    installer drift coverage; both were fixed and re-review approved.
- Implemented repo secret hygiene guard:
  - Added `tests/scripts/repo-secret-hygiene.test.ts` to scan `git ls-files`
    text files with Akasha's existing `scanForSecrets` helper.
  - Failure output is limited to file path and secret category; matched values
    are never reported.
  - Excluded the detector source and scrubber unit test, where regexes and
    examples are intentional.
  - Allowed only exact placeholder DB URL userinfo pairs such as
    `memory:memory`, `user:pass`, `user:pw`, `postgres:test`, `memory:STRONG_PW`,
    and the exact `${POSTGRES_USER:-memory}:${POSTGRES_PASSWORD:-memory}` form;
    other embedded DB credentials still fail.
  - Split synthetic AWS/GitHub secret-shaped literals in non-scrubber store
    tests into runtime string fragments.
  - Review gates:
    - Spec compliance passed.
    - Quality review caught broad DB credential allowlisting and untracked test
      risk; both were fixed before final verification.
- Source rationale:
  - GitHub push protection blocks hardcoded credentials before they reach a
    repository, including test/fixture-shaped tokens:
    https://docs.github.com/en/code-security/concepts/secret-security/push-protection
  - OWASP Secrets Management calls out API keys, database credentials, SSH
    keys, certificates, and similar secrets hardcoded in source/config as a
    common leak source:
    https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npx vitest run tests/scripts/repo-secret-hygiene.test.ts`
- `npx vitest run tests/store/secret-scrub.test.ts tests/store/canonical-indexing.test.ts tests/store/memory-repository.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`63` files passed, `2` skipped; `608` tests passed, `34` skipped)
- `git diff --check`

- Reviewed the backup/restore runbooks against the current Qdrant and pgvector
  paths.
  - `scripts/restore-smoke.ts` now passes the backup manifest's
    `qdrant.collectionName` to restore commands as
    `RESTORE_SMOKE_QDRANT_COLLECTION_NAME`, falling back to
    `QDRANT_COLLECTION_NAME` or `memory_chunks_v1` for older manifests.
  - The self-hosted restore examples now upload Qdrant snapshots to the
    manifest-derived collection and use `priority=snapshot`.
  - Public docs drift coverage now pins the restore command away from hardcoded
    `memory_chunks_v1`.
- Source rationale:
  - Qdrant's snapshot API recovers uploaded snapshots through the collection
    scoped `/collections/{collection_name}/snapshots/upload` endpoint and
    supports `priority=snapshot` for snapshot-led recovery:
    https://api.qdrant.tech/api-reference/snapshots/recover-from-uploaded-snapshot

Verification:
- `npx vitest run tests/scripts/restore-smoke.test.ts tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`63` files passed, `2` skipped; `611` tests passed, `34` skipped)
- `git diff --check`

- Implemented public docs index drift coverage:
  - `tests/scripts/public-docs-drift.test.ts` now discovers tracked public
    markdown under `docs/`, excluding `docs/superpowers/**` and the docs index
    files.
  - The guard checks every English public doc has a `.ko.md` sibling, every
    Korean doc has an English sibling, and both docs indexes contain the pair
    in English-first / Korean-first order.
  - No CI workflow change is needed because CI already runs `npm test`.

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`19` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`63` files passed, `2` skipped; `612` tests passed, `34` skipped)
- `git diff --check`
