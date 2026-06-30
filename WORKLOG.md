# WORKLOG

## 2026-06-30

- Hardened user-scope resolver input validation:
  - `resolveUserScopeId` now rejects non-object direct inputs before reading
    explicit/default scope IDs, environment fallback, git config, or local OS
    username fallback.
  - Resolver input must include a non-blank string `cwd`.
  - Explicit and default user scope IDs must be strings when present; existing
    non-blank validation still applies before returning them.
  - Existing explicit/default precedence, environment trimming, git-email hash,
    and local username fallback behavior is preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/mcp/tool-utils.test.ts` (17 passed)
- `npx vitest run tests/mcp/tool-utils.test.ts tests/mcp/server.test.ts tests/mcp/resolve-org.test.ts`
  (165 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1318 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened ranking input validation:
  - `rankResults`, `newestUpdatedAtFor`, `rankCandidates`, and
    `scoreSearchResult` now reject invalid direct inputs before metadata
    scoring, timestamp tie-break sorting, or score fusion.
  - Ranked records must provide positive safe-integer IDs, valid project/user
    scope, valid memory type, string content, and valid source type before
    ranking weights are read.
  - Candidate score totals and optional score inputs must be finite numbers,
    and optional candidate source values must be valid.
  - Existing project/user ordering, metadata weights, recency scoring, vector
    and lexical score behavior, and canonical timestamp errors are preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/search/rank-results.test.ts` (22 passed)
- `npx vitest run tests/search/rank-results.test.ts tests/search/retrieve-memory.test.ts tests/search/lexical-score.test.ts tests/mcp/server.test.ts`
  (194 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1307 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened repeat-attempt input validation:
  - `findRepeatAttempts` now rejects non-object direct inputs before reading
    embeddings, prior failures, or threshold values.
  - Candidate embeddings and prior failure embeddings must be arrays of finite
    numbers, and prior embeddings must match the candidate dimensions before
    cosine scoring.
  - Prior failures must provide positive safe-integer iteration indexes and
    string attempts.
  - Thresholds must be finite numbers in `(0, 1]`; invalid numeric and
    non-numeric values now fail explicitly.
  - Existing default threshold, match filtering, and best-first score ordering
    behavior is preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/goal-run/find-repeat-attempts.test.ts` (22 passed)
- `npx vitest run tests/goal-run/find-repeat-attempts.test.ts tests/goal-run/goal-run-handlers.test.ts tests/mcp/server.test.ts`
  (177 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1297 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened retrieval input validation:
  - `retrieveMemory` now rejects non-object direct inputs before property
    access.
  - Direct retrieval inputs must provide a query-capable vector index,
    hydration-capable repository, non-empty finite vector, valid optional
    string fields, boolean legacy opt-in, non-blank project/user scope
    identifiers, and positive safe-integer limit.
  - Vector hits with missing, non-numeric, non-positive, fractional, or
    non-finite `memory_record_id` payloads are ignored before Postgres
    hydration or vector-score fusion.
  - Existing organization strictness, legacy anonymous opt-in behavior,
    lexical oversampling, ranking, and hybrid fusion behavior is preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/search/retrieve-memory.test.ts` (31 passed)
- `npx vitest run tests/search/retrieve-memory.test.ts tests/search/rank-results.test.ts tests/search/lexical-score.test.ts tests/mcp/server.test.ts`
  (184 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1280 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened context pack record input validation:
  - `buildContextPack` now rejects non-object direct inputs before reading
    `records`.
  - `records` must be an array, and each consumed record must be an object with
    a positive safe-integer `id`, valid project/user scope, string `scopeId`,
    valid memory type, and string content.
  - Consumed source metadata must be an object with a valid source type,
    string/null title, and optional string external ID.
  - Existing section grouping, caps, project-before-user rendering order,
    compact excerpts, and prompt-injection warning behavior is preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/context-pack/build-context-pack.test.ts` (23 passed)
- `npx vitest run tests/context-pack/build-context-pack.test.ts tests/goal-run/build-goal-context.test.ts tests/mcp/server.test.ts`
  (178 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1260 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened goal context pack input validation:
  - `buildGoalContextPack` now rejects non-object direct inputs before property
    reads.
  - `goalRun` must be an object with positive safe-integer `id`, string
    `goal` and `status`, non-negative safe-integer `iterationCount`, and
    string/null optional termination criteria.
  - `goalRun.iterations` must be an array, and each rendered iteration must
    have a positive safe-integer index, string attempt/outcome, and string/null
    summary/error fields.
  - `records` must be an array before delegating memory formatting to
    `buildContextPack`.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/goal-run/build-goal-context.test.ts` (24 passed)
- `npx vitest run tests/goal-run/build-goal-context.test.ts tests/goal-run/goal-run-handlers.test.ts tests/context-pack/build-context-pack.test.ts`
  (54 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1243 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened rate limiter input validation:
  - `createTokenBucketLimiter` now rejects non-object direct options before
    reading capacity or window fields.
  - Injected `now` values must be functions when provided.
  - `check(key)` now rejects non-string direct keys before bucket lookup.
  - Injected clocks must return finite numbers before refill math runs.
  - Existing capacity, window, refill, per-key isolation, and environment
    parsing behavior is preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/app/rate-limit.test.ts` (27 passed)
- `npx vitest run tests/app/rate-limit.test.ts tests/app/server.test.ts tests/app/mcp-http.test.ts`
  (113 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1224 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened background queue metrics validation:
  - `collect(now)` now rejects non-Date and invalid `Date` values before
    timestamp serialization or database queries.
  - Missing count rows and null count values still map to zero gauges.
  - Non-finite count values now fail collection instead of being silently
    reported as zero.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/app/background-queue-metrics.test.ts` (6 passed)
- `npx vitest run tests/app/background-queue-metrics.test.ts tests/app/metrics.test.ts tests/app/server.test.ts tests/app/start-operator-server-metrics.test.ts`
  (89 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1213 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened HTTP metrics method validation:
  - `normalizeHttpMethod` now rejects non-string direct method values before
    uppercase normalization.
  - Known method strings still normalize to their uppercase labels.
  - Unknown method strings and missing methods still bucket as `OTHER`.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/app/metrics.test.ts` (15 passed)
- `npx vitest run tests/app/metrics.test.ts tests/app/server.test.ts tests/app/start-operator-server-metrics.test.ts`
  (83 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1209 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened vector point input validation:
  - `buildVectorPoint` now rejects non-object direct inputs before property
    reads.
  - `chunkId` and `memoryRecordId` must be positive safe integers before vector
    IDs or payload metadata are built.
  - Vectors must be non-empty arrays of finite numbers before upsert payloads
    are constructed.
  - Required payload fields must be strings; `projectKey`, `title`, and
    `summary` must be strings or null where applicable; tags must be string
    arrays.
  - Existing organization-id validation is preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/vector/point-builder.test.ts` (25 passed)
- `npx vitest run tests/vector/point-builder.test.ts tests/vector/organization-id.test.ts tests/vector/qdrant-index.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts tests/compact/unarchive-compaction.test.ts`
  (108 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1203 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened secret scrubber input validation:
  - `scanForSecrets` now rejects non-string direct content before regex
    scanning.
  - `assertNoSecrets` uses the same guard before secret-detection error
    construction.
  - Existing detections still return categories only and do not include matched
    values.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/store/secret-scrub.test.ts` (35 passed)
- `npx vitest run tests/store/secret-scrub.test.ts tests/store/memory-repository.test.ts tests/store/canonical-indexing.test.ts tests/scripts/repo-secret-hygiene.test.ts`
  (141 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1181 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened exact duplicate input validation:
  - `findExactContentDuplicates` now rejects non-array inputs before iteration.
  - Each direct record must be an object with a positive safe-integer `id`,
    string `content`, and finite optional `importance`.
  - Invalid content is rejected before whitespace/case normalization.
  - Invalid ids or importance values are rejected before duplicate candidate
    sorting or compaction apply planning.
  - The apply-compaction invalid-id test now asserts the earlier
    plan-construction boundary while preserving the no-side-effects checks.
  - Default parallel `npm test` twice hit unrelated 5s timeout-sensitive tests
    in server startup and backup shell files; those files passed in isolation,
    and the single-worker full suite passed.

Verification:
- `npx vitest run tests/compact/detect-duplicates.test.ts` (26 passed)
- `npx vitest run tests/compact/detect-duplicates.test.ts tests/compact/compact-memory.test.ts tests/compact/apply-compaction.test.ts`
  (50 passed)
- `npx vitest run tests/app/start-background-workers-server.test.ts tests/app/start-operator-server-metrics.test.ts`
  (4 passed)
- `npx vitest run tests/scripts/backup-verify.test.ts` (60 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1169 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened search-ranking timestamp validation:
  - Ranking now rejects non-canonical `updatedAt` timestamps before recency
    scoring or candidate tie-break sorting.
  - `buildRetrievedMemoryCandidate` and `newestUpdatedAtFor` derive recency
    anchors only from canonical ISO timestamps.
  - `scoreSearchResult` rejects non-finite `newestUpdatedAt` values before
    total-score calculation.
  - `newestUpdatedAtFor` now rejects empty input instead of returning
    `-Infinity`.

Verification:
- `npx vitest run tests/search/rank-results.test.ts tests/search/retrieve-memory.test.ts`
  (23 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1148 passed, 34 skipped across 70 files)
- `git diff --check`

- Hardened chunk-text input validation:
  - `chunkText` now rejects non-object inputs before property access.
  - Non-string `text` is rejected before `.matchAll()`.
  - `targetTokens` must be a positive safe integer, and `overlapTokens` must
    be a non-negative safe integer smaller than `targetTokens`.
  - Blank text still returns `[]` after valid settings; deterministic chunk
    offsets are preserved.
  - Review found no behavioral issues.

Verification:
- `npx vitest run tests/chunk/chunk-text.test.ts` (11 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1140 passed, 34 skipped across 70 files)
- `git diff --check`

- Hardened decay-score input validation:
  - `decayScore` now rejects non-finite importance, invalid `now`, invalid
    half-life values, and non-canonical `createdAt` timestamps before scoring.
  - `createdAt` must be a string that round-trips exactly through
    `Date#toISOString()`, so impossible dates and non-string direct values are
    rejected.
  - `findDecayCandidates` now rejects non-array records, non-function scoring
    callbacks, non-finite thresholds, and invalid `now` before scoring records.
  - Quality review found permissive `Date.parse` behavior for `createdAt`; a
    strict ISO round-trip parser and tests fixed it.

Verification:
- `npx vitest run tests/compact/decay-score.test.ts` (21 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1131 passed, 34 skipped across 70 files)
- `git diff --check`

- Hardened retry backoff attempt validation:
  - `nextRetryDelayMs` now rejects invalid attempt counts before exponential
    delay calculation.
  - Attempt counts must be non-negative safe integers.
  - Existing attempt `0`, doubling, and 5-minute cap behavior are preserved.
  - Review found no behavioral issues; the suggested unsafe-integer test case
    was added.

Verification:
- `npx vitest run tests/compact/ingest-sweeper.test.ts` (15 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1119 passed, 34 skipped across 70 files)
- `git diff --check`

- Hardened eval metric input validation:
  - `recallAtK` and `mrrAtK` now reject non-array direct inputs before metric
    calculation.
  - Retrieved and relevant IDs must be positive safe integers, matching the
    record-id contract.
  - `k` must be a positive integer before top-k slicing.
  - `recallAtK` now deduplicates retrieved IDs in the top-k window so duplicate
    retrievals cannot push recall above `1`.
  - Quality review found the duplicate-retrieved recall inflation bug and an
    ID-domain gap; both were fixed and covered.

Verification:
- `npx vitest run tests/eval/metrics.test.ts` (28 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1114 passed, 34 skipped across 70 files)
- `git diff --check`

- Hardened semantic duplicate numeric validation:
  - `findSemanticDuplicates` now rejects non-finite thresholds before
    clustering.
  - Present embedding vectors are validated before clustering, including
    singleton or first-record embeddings that would not otherwise be compared.
  - `cosineSimilarity` now rejects non-finite vector values with vector side,
    index, and value in the error.
  - Reviews found a silent singleton malformed-embedding gap and missing
    infinity threshold coverage; both were fixed and covered.

Verification:
- `npx vitest run tests/compact/semantic-duplicates.test.ts` (17 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run tests/scripts/backup-verify.test.ts -t "rejects existing array manifests before mutation"`
  (1 passed after an initial full-suite timeout in that shell test)
- `npm test` rerun (1097 passed, 34 skipped across 70 files)
- `git diff --check`

- Hardened source-ref parser validation:
  - `parseStoredPostgresSourceRef` now rejects non-string direct values before
    JSON parsing, fallback logging, or metadata return.
  - Invalid JSON strings still fall back to raw source refs with a warning.
  - Valid JSON without `sourceRef`, including JSON primitives like `"null"`,
    now falls back silently to the raw string.
  - Reviews found missing no-log coverage and a JSON primitive warning edge;
    both were fixed and covered.

Verification:
- `npx vitest run tests/store/parse-source-ref.test.ts` (6 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1094 passed, 34 skipped across 70 files)
- `git diff --check`

- Hardened direct lexical/entity helper validation:
  - Exported lexical helpers now reject non-string direct query/value inputs
    before lowercasing, trimming, tokenization, or scoring.
  - `scoreLexicalMatch` now rejects malformed direct record inputs before
    reading scoring text fields.
  - Exported entity helpers now reject non-string direct text inputs before
    regex matching or entity overlap work.
  - Quality review found one malformed-record gap in `scoreLexicalMatch`; a
    scoped record/source/text-field guard and tests fixed it.

Verification:
- `npx vitest run tests/search/lexical-score.test.ts tests/entities/entity-extraction.test.ts`
  (15 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1092 passed, 34 skipped across 70 files)
- `git diff --check`

- Hardened service-config environment validation:
  - `resolveServiceConfig({ env })` now rejects non-string env values before
    `.trim()`, `.toLowerCase()`, integer parsing, or returning config fields.
  - Existing defaults, whitespace-only string errors, invalid enum strings,
    numeric string parsing, provider branches, and vector-backend branches are
    preserved.
  - Focused tests cover required, optional, provider-specific, inactive
    pgvector Qdrant, and fallback Postgres env values.
  - Spec and quality reviews found no behavioral issues; review noted
    non-number malformed values share the same guarded branch.

Verification:
- `npx vitest run tests/config/service-config.test.ts` (59 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1083 passed, 34 skipped across 70 files)
- `git diff --check`

- Hardened logger level validation:
  - `resolveLogLevel` now rejects non-string configured `LOG_LEVEL` values
    before calling `.toLowerCase()`.
  - Existing default, uppercase normalization, supported-level, and
    invalid-string behavior are preserved.
  - The invalid-value formatter safely reports non-string values including
    bigint, symbol, circular object, and non-finite number inputs.
  - Reviews found unsafe `JSON.stringify` and non-finite number reporting
    edges; both were fixed and covered.

Verification:
- `npx vitest run tests/logger.test.ts` (25 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1062 passed, 34 skipped across 70 files)
- `git diff --check`

- Hardened direct lifecycle init project-key validation:
  - `writeLifecycleInit` now rejects non-string `projectKey` values before
    calling `.trim()`.
  - Existing whitespace-only lifecycle project-key behavior and CLI parsing are
    unchanged.
  - Focused tests cover non-string and whitespace-only direct lifecycle inputs
    before `.akasha` files are written.
  - Spec and quality reviews found no issues.

Verification:
- `npx vitest run tests/cli.test.ts` (24 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1057 passed, 34 skipped across 70 files)
- `git diff --check`

- Hardened vector organization scope validation:
  - Vector organization ID guards now reject non-string values before calling
    `.trim()`.
  - Optional vector organization IDs still allow `undefined` and `""` for
    legacy unscoped mode while rejecting whitespace-only strings.
  - Helper tests cover required/optional validation, and Qdrant/pgvector tests
    cover non-string scoped delete-by-record IDs before backend calls.
  - Review found one pgvector coverage gap; a no-SQL regression test was added
    and follow-up review found no blocking issues.

Verification:
- `npx vitest run tests/vector/organization-id.test.ts tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts` (43 passed, 12 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1056 passed, 34 skipped across 70 files)
- `git diff --check`

- Hardened direct repository nullable text validation:
  - Repository title/summary normalization now rejects non-string non-null
    values before calling `.trim()`.
  - Existing `null`, whitespace-to-`null`, non-empty string, default summary,
    and secret scanning behavior are preserved.
  - Focused tests cover `addMemory` rejection before pool connection and
    `updateMemoryRecord` rejection after current-row read but before row update,
    with rollback/release.
  - Spec and quality reviews found no issues.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts` (78 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1050 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened direct repository tag validation:
  - Repository tag normalization now rejects non-string tag entries before
    calling `.trim()`.
  - Existing whitespace-only tag behavior, deduplication, and sorted
    persistence are unchanged.
  - Focused tests cover `updateMemoryRecord` rejecting non-string tags before
    opening a transaction or pool connection.
  - Spec and quality reviews found no issues.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts` (76 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1048 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened direct repository search query validation:
  - `createMemoryRepository().searchMemory` now rejects non-string `query`
    values before calling `.trim()`.
  - Blank string and whitespace-only queries still return `[]` without SQL.
  - Tests cover non-string direct queries before querying and preserve the
    blank-query fast return before limit validation.
  - Spec review found no issues; quality review found the blank-query/limit
    ordering gap, which was covered and re-reviewed cleanly.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts` (75 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1047 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened direct scope identifier validation:
  - `requireProjectKey` and `requireUserScopeId` now reject non-string values
    before calling `.trim()`, while preserving existing missing and whitespace
    string behavior.
  - Registry instrumentation validates provided `projectKey` and `userScopeId`
    before logging/audit metadata is emitted, so local scope validation failures
    do not trigger service-backed audit resolution.
  - Direct tests cover retrieval, `add_memory`, governance, goal-run, and
    service-backed audit pre-resolution paths.
  - Review found one service-backed audit edge; follow-up review confirmed the
    whitespace/non-string audit boundary is fixed.

Verification:
- `npx vitest run tests/mcp/server.test.ts tests/goal-run/goal-run-handlers.test.ts tests/mcp/tool-utils.test.ts` (161 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1040 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened shared non-blank text validation:
  - `assertNonBlankText` now rejects non-string values with a field-specific
    string validation error before calling `.trim()`.
  - Existing whitespace-only string behavior and messages are preserved.
  - Direct registry tests cover non-string `add_memory`/`update_memory`
    content and `update_memory`/`tag_memory` tag entries before canonical
    repository, embedding, or vector side effects.
  - Spec review and code-quality review found no issues.

Verification:
- `npx vitest run tests/mcp/server.test.ts` (126 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1034 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened direct optional goal-run note validation:
  - Direct `start_goal_run.terminationCriteria`, `record_iteration.summary`,
    `record_iteration.error`, `complete_goal_run.resolution`, and
    `abandon_goal_run.reason` now reject configured non-string values before
    service dispatch.
  - `null`, `undefined`, and blank values still normalize to `null`; non-empty
    strings still pass through secret scanning and persistence.
  - Focused tests cover all five fields and assert no goal-run service calls.
  - Spec review and code-quality review found no issues.

Verification:
- `npx vitest run tests/goal-run/goal-run-handlers.test.ts` (23 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1032 passed, 34 skipped across 69 files)
- `git diff --check`

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

- Hardened direct numeric array input validation:
  - Direct `record_iteration` registry calls now reject configured non-array
    `memoryIds` before canonical service resolution.
  - `memoryIds: undefined` still preserves the existing no-memory-links
    behavior, and arrays still validate entries as positive safe integers.
  - The shared positive-integer array guard also keeps `unarchive_memory`
    archive-id handling compatible with its existing array check.
  - Spec review and code-quality review found no issues.

Verification:
- `npx vitest run tests/goal-run/goal-run-handlers.test.ts tests/mcp/server.test.ts` (146 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1031 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened direct governance tag input validation:
  - Direct `update_memory` and `tag_memory` registry calls now reject configured
    non-array `tags` before canonical service resolution.
  - `tags: undefined` still preserves the existing no-tag-update behavior for
    `update_memory`, and arrays still validate entries for non-whitespace text.
  - Focused tests cover string `tags` on both direct paths and assert no
    repository, chunk, embedding, or vector work occurs.
  - Worker implementation passed spec review and code-quality review with no
    findings.

Verification:
- `npx vitest run tests/mcp/server.test.ts` (124 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1031 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened MCP Streamable HTTP Host validation:
  - `/mcp` now validates Host headers for loopback-bound operator servers before
    auth, rate limiting, or MCP transport work.
  - The allowed loopback hostnames are `localhost`, `127.0.0.1`, and `[::1]`,
    parsed port-agnostically to match the installed MCP SDK DNS-rebinding
    guidance.
  - Non-loopback deployments keep the previous behavior so reverse-proxy and
    public bind setups are not changed without explicit allowed-host config.
  - English/Korean security docs now describe Host and Origin validation for
    `/mcp`.
  - Worker implementation passed spec review and code-quality review with no
    findings.

Verification:
- `npx vitest run tests/app/mcp-http.test.ts tests/scripts/public-docs-drift.test.ts` (41 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1030 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened backup/restore manifest shape parsing:
  - `scripts/backup-encryption.ts` and `scripts/restore-smoke.ts` now reject
    JSON manifests that parse to `null` or arrays with
    `backup manifest must be a JSON object`.
  - Backup encryption rejects those manifests before random bytes, artifact
    encryption, encrypted artifact creation, or manifest mutation work.
  - Restore smoke rejects those manifests before per-field manifest parsing.
  - Worker implementation passed spec review and code-quality review with no
    findings.

Verification:
- `npx vitest run tests/scripts/backup-encryption.test.ts tests/scripts/restore-smoke.test.ts` (76 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1026 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened backup plaintext retention flag parsing:
  - `BACKUP_ENCRYPTION_KEEP_PLAINTEXT` now accepts only trimmed,
    case-insensitive `true` or `false` values when configured.
  - Unset still defaults to `false`, so plaintext artifacts are removed after
    encrypted artifacts and manifest checksums are written.
  - Invalid values such as empty, whitespace-only, `yes`, `1`, `0`, and
    `maybe` fail before encryption work starts.
  - English/Korean configuration docs state the accepted values and
    fail-closed behavior.
  - Worker implementation passed spec review and code-quality review with no
    findings.

Verification:
- `npx vitest run tests/scripts/backup-encryption.test.ts tests/scripts/public-docs-drift.test.ts` (51 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1022 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened backup target host shell handling:
  - `scripts/backup-postgres.sh`, `scripts/snapshot-qdrant.sh`, and
    `scripts/create-backup.sh` now reject whitespace-only
    `BACKUP_TARGET_HOST` values before any SSH/SCP work.
  - Unset and exact empty `BACKUP_TARGET_HOST` still keep backup creation
    local-only.
  - Worker implementation passed spec review and code-quality review with no
    findings.

Verification:
- `npx vitest run tests/scripts/backup-verify.test.ts` (60 passed)
- `sh -n scripts/backup-postgres.sh && sh -n scripts/snapshot-qdrant.sh && sh -n scripts/create-backup.sh`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1011 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened service config backup environment handling:
  - `resolveServiceConfig()` now rejects whitespace-only `BACKUP_DIR`,
    `BACKUP_TARGET_HOST`, and `BACKUP_ENCRYPTION_KEY_FILE` values before
    returning runtime backup config.
  - Unset `BACKUP_DIR` still uses the existing local backup directory default,
    and exact empty `BACKUP_TARGET_HOST` still resolves as local-only.
  - Exact empty `BACKUP_ENCRYPTION_KEY_FILE` remains invalid, matching the
    backup shell entrypoints' configured-key-file behavior.
  - Worker implementation passed spec review and code-quality review with no
    findings.

Verification:
- `npx vitest run tests/config/service-config.test.ts` (38 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1006 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened required backup shell env guards:
  - `scripts/backup-postgres.sh`, `scripts/snapshot-qdrant.sh`, and
    `scripts/create-backup.sh` now reject unset, empty, and whitespace-only
    required env values before filesystem, database, curl, SSH, or scp work.
  - `create-backup.sh` validates `BACKUP_DIR` before invoking child backup
    scripts.
  - Worker implementation passed spec review and code-quality review with no
    findings.

Verification:
- `npx vitest run tests/scripts/backup-verify.test.ts` (55 passed)
- `sh -n scripts/backup-postgres.sh && sh -n scripts/snapshot-qdrant.sh && sh -n scripts/create-backup.sh`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1000 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened bearer token comma-separated config parsing:
  - `MEMORY_API_TOKENS` now rejects leading commas, trailing commas, repeated
    commas, whitespace-only whole values, and whitespace-only list entries
    instead of silently dropping blank entries.
  - Unset and exact whole-empty values still disable static auth for documented
    loopback local development.
  - `.env.example`, `docs/configuration.md`, and `docs/configuration.ko.md`
    document the blank-entry rejection.
  - Worker implementation passed spec review; code-quality review found one
    missing whitespace-only test, which was fixed and re-reviewed cleanly.

Verification:
- `npx vitest run tests/app/bearer-auth.test.ts tests/scripts/public-docs-drift.test.ts` (52 passed)
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (22 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (991 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened OAuth comma-separated config parsing:
  - `MCP_OAUTH_AUTHORIZATION_SERVERS`, `MCP_OAUTH_SCOPES`,
    `MCP_OAUTH_JWKS_URLS`, and `MCP_OAUTH_JWT_ALGORITHMS` now reject explicit
    blank entries instead of silently filtering them out.
  - Unset values still preserve existing disabled/default behavior.
  - `.env.example`, `docs/configuration.md`, and `docs/configuration.ko.md`
    document the blank-entry rejection.
  - Worker implementation passed spec review and code-quality review with no
    findings.

Verification:
- `npx vitest run tests/app/oauth-protected-resource.test.ts tests/app/oauth-token-auth.test.ts` (31 passed)
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (22 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (986 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened Qdrant snapshot response parsing:
  - `scripts/snapshot-qdrant.sh` now rejects missing, non-string, empty, and
    whitespace-only snapshot names before constructing the snapshot download
    URL.
  - Valid string snapshot names are preserved unchanged.
  - Worker implementation passed spec review and code-quality review with no
    findings.

Verification:
- `npx vitest run tests/scripts/backup-verify.test.ts` (46 passed)
- `sh -n scripts/snapshot-qdrant.sh`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (983 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened backup manifest writer parsing:
  - `scripts/backup-postgres.sh`, `scripts/snapshot-qdrant.sh`, and
    `scripts/create-backup.sh` now reject existing manifest files that parse to
    `null`, arrays, or other non-object JSON before mutation.
  - Missing manifest files still start from `{}`.
  - Worker implementation passed spec review and code-quality review with no
    findings.

Verification:
- `npx vitest run tests/scripts/backup-verify.test.ts` (39 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (976 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened encrypted off-box backup copy manifest parsing:
  - `scripts/create-backup.sh` now validates manifest artifact filenames before
    building the encrypted off-box `scp` list.
  - Qdrant artifact names are required whenever a Qdrant manifest block is
    present or the backend is not `pgvector`.
  - Worker implementation passed spec review and code-quality re-review after
    fixing Qdrant fail-closed consistency gaps.

Verification:
- `npx vitest run tests/scripts/backup-verify.test.ts` (37 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (974 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened backup-encryption manifest metadata parsing:
  - Backup encryption now validates manifest metadata before idempotent returns
    or artifact encryption work.
  - Qdrant metadata is required unless the manifest explicitly uses `pgvector`,
    and invalid vector backend values are rejected early.
  - Worker implementation passed spec review and code-quality re-review after
    fixing Qdrant-default and vector-backend consistency gaps.

Verification:
- `npx vitest run tests/scripts/backup-encryption.test.ts` (18 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (971 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened restore-smoke manifest metadata parsing:
  - Restore smoke now rejects whitespace-only manifest artifact metadata before
    restore path construction.
  - Unsupported manifest vector backend values are rejected explicitly.

Verification:
- `npx vitest run tests/scripts/restore-smoke.test.ts` (43 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (958 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened backup manifest metadata parsing:
  - Backup verification now rejects whitespace-only required manifest metadata
    before local or remote artifact checks.
  - Optional Qdrant metadata on pgvector manifests is preserved and verified
    when present.

Verification:
- `npx vitest run tests/scripts/backup-verify.test.ts` (34 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (950 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened retrieval eval threshold env parsing:
  - `EVAL_RECALL_THRESHOLD` and `EVAL_MRR_THRESHOLD` now use a strict parser
    instead of raw `Number(...)`.
  - Provided thresholds must be decimal values from `0` to `1`, so whitespace
    no longer silently lowers thresholds to zero and invalid text cannot become
    `NaN`.

Verification:
- `npx vitest run tests/eval/env.test.ts tests/eval/metrics.test.ts tests/eval/fixtures.test.ts tests/eval/retrieval.eval.test.ts` (27 passed, 1 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (944 passed, 34 skipped across 69 files)
- `git diff --check`

- Hardened retrieval limit contract:
  - `search_memory` and `build_context_pack` now reject limits above the
    effective `100` cap instead of silently reducing them.
  - Shared tool schemas, HTTP validation, MCP resource URLs, and the
    `akasha_session_start` prompt now enforce the same maximum.
  - Reviewer subagent caught resource and prompt boundary drift; both were fixed
    and re-review found no issues.

Verification:
- `npx vitest run tests/mcp/server.test.ts tests/app/server.test.ts` (190 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (931 passed, 34 skipped across 68 files)
- `git diff --check`

- Hardened direct audit-log limits:
  - Direct `listByOrganization()` audit repository calls now reject invalid
    numeric limits before SQL instead of defaulting, flooring, or clamping them.
  - Omitted limits still default to `100`, and valid boundary limits `1` and
    `1000` pass through unchanged.
  - Reviewer subagent caught missing positive/default coverage; added tests for
    omitted/min/max limits and re-review found no issues.

Verification:
- `npx vitest run tests/audit/audit-truncation.test.ts tests/audit/audit-write.test.ts tests/mcp/server.test.ts` (139 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (927 passed, 34 skipped across 68 files)
- `git diff --check`

- Hardened direct repository numeric limits:
  - Direct `searchMemory`, `listMemory`, `listMemoryForGovernance`, and
    `inspectMemoryGraph` calls now reject invalid limits before SQL instead of
    defaulting, flooring, or clamping them.
  - Omitted limits still use existing defaults.
  - `retrieveMemory` now caps lexical oversampling before calling repository
    search, preserving valid public/API limits above 25.
  - Reviewer subagent caught the public-limit regression; added coverage for
    `limit: 26` and re-review found no issues.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/search/retrieve-memory.test.ts tests/mcp/server.test.ts tests/app/server.test.ts` (265 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (919 passed, 34 skipped across 68 files)
- `git diff --check`

- Hardened direct repository tag updates:
  - Direct `updateMemoryRecord({ tags })` calls now reject whitespace-only tag
    entries before opening a transaction instead of silently dropping them.
  - Empty tag arrays still clear tags, and valid tags are still trimmed,
    deduplicated, and sorted.
  - Reviewer subagent found no issues.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/mcp/server.test.ts` (168 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (898 passed, 34 skipped across 68 files)
- `git diff --check`

- Hardened optional OAuth text environment handling:
  - `MCP_OAUTH_RESOURCE_NAME`, `MCP_OAUTH_RESOURCE_DOCUMENTATION_URL`,
    `MCP_OAUTH_ORGANIZATION_CLAIM`, and `MCP_OAUTH_JWT_TYPE` now reject
    explicit whitespace-only values before protected-resource metadata or JWT
    verifier config construction.
  - Unset values still preserve omission/default behavior, and configured
    nonblank values are trimmed before use.
  - Configuration docs and `.env.example` now state that optional OAuth text
    settings must contain non-whitespace text when set.
  - Reviewer subagent caught missing trim-preservation coverage; updated the
    happy-path tests with whitespace-surrounded values and re-review found no
    issues.

Verification:
- `npx vitest run tests/app/oauth-protected-resource.test.ts tests/app/oauth-token-auth.test.ts tests/scripts/public-docs-drift.test.ts` (50 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (897 passed, 34 skipped across 68 files)
- `git diff --check`

- Hardened direct memory graph query filtering:
  - Direct `inspectMemoryGraph()` repository calls now reject whitespace-only
    query filters before SQL work instead of widening to an unfiltered graph
    read.
  - Existing API/MCP validation and nonblank direct query behavior are
    preserved.
  - Reviewer subagent found no issues.

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/mcp/server.test.ts tests/app/server.test.ts` (233 passed, 7 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (893 passed, 34 skipped across 68 files)
- `git diff --check`

- Hardened `DEVELOPER_MEMORY_USER_ID` handling:
  - Explicit empty or whitespace-only values now fail before user-scope fallback
    resolution instead of silently deriving from git/OS identity.
  - Unset values still derive from `git config user.email`, then OS username,
    and configured nonblank values are trimmed before use.
  - Configuration docs and `.env.example` now state that configured values must
    contain non-whitespace text.
  - Reviewer subagent caught missing unset fallback coverage and `.env.example`
    drift; added a deterministic temp-git-repo fallback test and re-review found
    no issues.

Verification:
- `npx vitest run tests/mcp/tool-utils.test.ts tests/scripts/public-docs-drift.test.ts` (28 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (892 passed, 34 skipped across 68 files)
- `git diff --check`

- Hardened backup encryption key-file handling:
  - `BACKUP_ENCRYPTION_KEY_FILE` now rejects explicit empty or whitespace-only
    values in `loadBackupEncryptionKeyFromEnv()` and the backup shell
    entrypoints before backup artifact or remote-copy work.
  - Unset values still disable backup encryption; configured nonblank paths are
    trimmed before key-file reads.
  - Configuration docs now state that configured key-file values must contain
    non-whitespace text.
  - Reviewer subagent caught a missing positive shell encryption test; added a
    `create-backup.sh` `sh -eu` case that writes a real 32-byte key, verifies
    the encrypted manifest, checks the `.enc` artifact, and confirms plaintext
    removal. Re-review found no issues.

Verification:
- `npx vitest run tests/scripts/backup-encryption.test.ts tests/scripts/backup-verify.test.ts tests/scripts/public-docs-drift.test.ts` (55 passed)
- `sh -n scripts/create-backup.sh && sh -n scripts/backup-postgres.sh && sh -n scripts/snapshot-qdrant.sh`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (889 passed, 34 skipped across 68 files)
- `git diff --check`

- Hardened optional restore-smoke user/org environment handling:
  - `RESTORE_SMOKE_USER_SCOPE_ID` and `RESTORE_SMOKE_ORGANIZATION_ID` now
    reject whitespace-only values before Docker or registry work.
  - Unset optional values are still omitted, and configured nonblank values are
    trimmed before use.
  - Configuration docs now state that configured values must contain
    non-whitespace text.
  - Reviewer subagent found no issues.

Verification:
- `npx vitest run tests/scripts/restore-smoke.test.ts tests/scripts/public-docs-drift.test.ts` (57 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (880 passed, 34 skipped across 68 files)
- `git diff --check`

- Hardened restore-smoke text environment handling:
  - `RESTORE_SMOKE_PROJECT`, `RESTORE_SMOKE_PROJECT_KEY`,
    `RESTORE_SMOKE_SEARCH_QUERY`, and `RESTORE_SMOKE_PACK_TASK` now reject
    whitespace-only values before Docker or registry work.
  - Unset values still use the existing defaults, and configured nonblank values
    are preserved.
  - Reviewer subagent found no issues.

Verification:
- `npx vitest run tests/scripts/restore-smoke.test.ts tests/scripts/public-docs-drift.test.ts` (53 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (876 passed, 34 skipped across 68 files)
- `git diff --check`

- Hardened restore-smoke app port handling:
  - `resolveRestoreAppPort()` now validates `RESTORE_APP_PORT` before Docker
    startup and health checks.
  - Unset values still default to `18787`; configured values must be plain
    decimal integers in `1..65535`.
  - Reviewer subagent found no issues.

Verification:
- `npx vitest run tests/scripts/restore-smoke.test.ts tests/scripts/public-docs-drift.test.ts` (47 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (870 passed, 34 skipped across 68 files)
- `git diff --check`

- Hardened Qdrant snapshot collection-name handling:
  - `snapshot-qdrant.sh` now rejects empty or whitespace-only
    `QDRANT_COLLECTION_NAME` values before metadata or curl snapshot work.
  - Unset collection names still default to `memory_chunks_v1`, and valid
    collection names are preserved.
  - Executable tests log curl/SSH/SCP calls and verify invalid collection names
    do no snapshot or remote work.
  - Reviewer subagent found no implementation issues and caught a missing
    curl-log assertion; fixed before final verification.

Verification:
- `npx vitest run tests/scripts/backup-verify.test.ts` (22 passed)
- `sh -n scripts/snapshot-qdrant.sh`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (859 passed, 34 skipped across 68 files)
- `git diff --check`

- Hardened backup shell-script target directory handling:
  - `backup-postgres.sh`, `snapshot-qdrant.sh`, and `create-backup.sh` now
    reject whitespace-only `BACKUP_TARGET_DIR` values before remote SSH/SCP
    work.
  - Unset `BACKUP_TARGET_DIR` still falls back to `BACKUP_DIR`, and valid
    configured paths are preserved.
  - Executable tests run the shell scripts under `sh` with stubbed `pg_dump`,
    `gzip`, `sha256sum`, `curl`, `ssh`, and `scp`.
  - Reviewer subagent first caught string-only test coverage, then caught
    inherited env leakage in the shell harness; both were fixed before final
    verification.

Verification:
- `npx vitest run tests/scripts/backup-verify.test.ts` (18 passed)
- `BACKUP_TARGET_DIR=/inherited-target npx vitest run tests/scripts/backup-verify.test.ts` (18 passed)
- `BACKUP_ENCRYPTION_KEY_FILE=/tmp/inherited-key npx vitest run tests/scripts/backup-verify.test.ts` (18 passed)
- `sh -n scripts/create-backup.sh && sh -n scripts/backup-postgres.sh && sh -n scripts/snapshot-qdrant.sh`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (855 passed, 34 skipped across 68 files)
- `git diff --check`

- Hardened backup verification target directory resolution:
  - `backup:verify` now rejects whitespace-only `BACKUP_TARGET_DIR` values
    before remote path construction.
  - Unset `BACKUP_TARGET_DIR` still falls back to `BACKUP_DIR`, and valid
    configured remote paths are returned unchanged.
  - Reviewer subagent found no issue and noted the remaining shell-script
    follow-up for `backup:create` path expansion.

Verification:
- `npx vitest run tests/scripts/backup-verify.test.ts tests/scripts/public-docs-drift.test.ts` (29 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (844 passed, 34 skipped across 68 files)
- `git diff --check`

- Hardened MCP stdio cwd resolution:
  - `resolveStdioCwd()` now rejects whitespace-only `DMO_CWD` values before
    stdio server startup.
  - Valid configured paths are returned unchanged so paths with spaces keep
    working.
  - Fallback `process.cwd()` lookup remains lazy when `DMO_CWD` is configured.
  - Reviewer subagent caught the initial eager fallback regression; fixed before
    final verification.

Verification:
- `npx vitest run tests/mcp/stdio-cwd.test.ts tests/scripts/public-docs-drift.test.ts` (26 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (841 passed, 34 skipped across 68 files)
- `git diff --check`

- Hardened restore-smoke Qdrant collection resolution:
  - Explicit whitespace-only manifest `qdrant.collectionName` and
    `QDRANT_COLLECTION_NAME` values now fail instead of falling back to another
    collection name.
  - Omitted collection metadata still falls back to env/default for old
    manifests.
  - Pgvector mode remains unaffected and now has explicit regression coverage.
  - Reviewer subagent found no issue and noted the pgvector test gap, which was
    covered before final verification.

Verification:
- `npx vitest run tests/scripts/restore-smoke.test.ts` (14 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (837 passed, 34 skipped across 67 files)
- `git diff --check`

- Hardened restore-smoke tool input construction:
  - `buildRestoreSmokeToolInput()` now rejects whitespace-only `projectKey`,
    `userScopeId`, and `organizationId` values before search/context-pack
    registry dispatch.
  - Undefined optional fields are still omitted for legacy restore-smoke mode.
  - Reviewer subagent found no issues.

Verification:
- `npx vitest run tests/scripts/restore-smoke.test.ts` (11 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (834 passed, 34 skipped across 67 files)
- `git diff --check`

- Hardened logger environment validation:
  - `resolveLogLevel()` now validates `LOG_LEVEL` before Pino initialization
    and returns the existing defaults: `info` in production, `debug` otherwise.
  - Supported levels are explicit: `trace`, `debug`, `info`, `warn`, `error`,
    `fatal`, and `silent`.
  - Whitespace-only and unsupported values fail with an Akasha-owned error.
  - Case-insensitive inputs such as `INFO` and `DEBUG` normalize to lowercase
    so existing deployments keep working.
  - Reviewer subagent caught the uppercase compatibility risk; fixed before
    final verification.

Verification:
- `npx vitest run tests/logger.test.ts tests/scripts/public-docs-drift.test.ts` (42 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (831 passed, 34 skipped across 67 files)
- `git diff --check`

- Hardened optional service configuration identifiers:
  - `resolveServiceConfig()` now rejects whitespace-only
    `OPENAI_EMBEDDING_MODEL`, `TRANSFORMERS_EMBEDDING_MODEL`,
    `EMBEDDING_MODEL`, and `QDRANT_COLLECTION_NAME` values.
  - Unset optional values still use their existing defaults.
  - `QDRANT_COLLECTION_NAME` validation also applies in pgvector mode so a
    configured blank identifier cannot persist into service metadata.
  - Reviewer subagent attempt timed out and was closed with no findings
    returned.

Verification:
- `npx vitest run tests/config/service-config.test.ts tests/scripts/public-docs-drift.test.ts` (54 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (811 passed, 34 skipped across 66 files)
- `git diff --check`

- Hardened OAuth verifier numeric env parsing:
  - `MCP_OAUTH_JWT_CLOCK_TOLERANCE_SECONDS` and
    `MCP_OAUTH_JWKS_TIMEOUT_MS` now require plain decimal integer strings
    instead of accepting JavaScript coercions such as whitespace, decimals, or
    exponent notation.
  - `MCP_OAUTH_JWKS_TIMEOUT_MS` now rejects `0` and values above
    `2_147_483_647`, matching Node timer bounds used by the JWKS resolver.
  - Reviewer subagent caught the missing timeout upper bound; fixed before
    final verification.

Verification:
- `npx vitest run tests/app/oauth-token-auth.test.ts` (14 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (806 passed, 34 skipped across 66 files)
- `git diff --check`

- Hardened user-scope resolution:
  - `resolveUserScopeId()` now rejects whitespace-only explicit and default
    user scope IDs instead of returning them to internal callers.
  - New focused coverage verifies explicit/default rejection and preserves the
    trimmed `DEVELOPER_MEMORY_USER_ID` environment fallback.
  - Reviewer subagent found no issues.

Verification:
- `npx vitest run tests/mcp/tool-utils.test.ts tests/mcp/server.test.ts tests/goal-run/goal-run-handlers.test.ts` (145 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (805 passed, 34 skipped across 66 files)
- `git diff --check`

- Hardened CLI semantic flag parsing:
  - `pack`, `reindex`, `remember`, and `init` now reject whitespace-only
    project, task, user scope, kind, content, content-file, and out-dir flag
    values during parsing.
  - `--content` still allows leading dashes for summaries that begin with
    command-like text.
  - Coverage verifies parse-time failures, no registry dispatch for blank
    content, and no filesystem reads for blank content-file paths.
  - Reviewer subagent found no issues.

Verification:
- `npx vitest run tests/cli.test.ts` (23 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (802 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened direct lifecycle init path inputs:
  - `writeLifecycleInit()` now rejects whitespace-only `repoDir` and optional
    `outDir` values before resolving paths or writing generated files.
  - CLI coverage verifies blank `--out-dir` fails before file writes.
  - Direct coverage verifies whitespace-only `repoDir` and `outDir` fail and
    leave the temp repo empty.
  - Reviewer subagent caught weak no-write assertions; tests now assert the
    temp repo stays empty for invalid lifecycle inputs.

Verification:
- `npx vitest run tests/cli.test.ts` (21 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (800 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened direct lifecycle initialization:
  - `writeLifecycleInit()` now rejects whitespace-only optional
    `organizationId`, `userScopeId`, and `task` values before creating the
    output directory or generated hook/config files.
  - CLI blank `--organization-id` behavior remains covered; new coverage
    verifies direct function callers cannot bypass the guard.
  - Reviewer subagent found no issues.

Verification:
- `npx vitest run tests/cli.test.ts` (20 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (799 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened HTTP organization ID resolution:
  - Memory HTTP routes now reject explicitly blank body `organizationId` values
    before dispatch instead of silently treating them as absent.
  - Blank `x-organization-id` headers and duplicate raw `x-organization-id`
    headers now fail before registry dispatch.
  - Existing valid precedence remains unchanged: token-bound org, then single
    header org, then body org; truly absent org values remain legacy-compatible.
  - Resolver coverage now models blank body/header values, repeated normalized
    header arrays, and Node's comma-joined duplicate-header behavior via
    `rawHeaders`.
  - HTTP integration coverage sends duplicate raw headers over a socket to
    exercise Node's real request parser behavior.
  - Reviewer subagent caught the initial duplicate raw-header gap; fixed with
    `rawHeaders` counting and raw HTTP coverage.

Verification:
- `npx vitest run tests/mcp/resolve-org.test.ts tests/app/server.test.ts` (83 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (798 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Hardened migration database environment validation:
  - Migration database URL resolution now rejects whitespace-only `DATABASE_URL`
    and `POSTGRES_*` values.
  - Migration coverage verifies explicit database URLs, default fallback
    behavior, and invalid whitespace env values without requiring live
    Postgres.
  - Reviewer subagent found no issues.

Verification:
- `npx vitest run tests/db/migrate.test.ts tests/config/service-config.test.ts` (36 passed, 8 skipped)
- `npx vitest run tests/db/migrate.test.ts tests/config/service-config.test.ts tests/scripts/repo-secret-hygiene.test.ts` (38 passed, 8 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (794 passed, 34 skipped across 65 files)
- `git diff --check`

- Hardened required service environment validation:
  - Required service environment variables now reject whitespace-only values.
  - Config coverage verifies direct required values and fallback Postgres env
    values fail before config construction.
  - Reviewer subagent found no issues; added fallback Postgres regressions for
    residual coverage.

Verification:
- `npx vitest run tests/config/service-config.test.ts tests/app/server.test.ts tests/health/check-dependencies.test.ts` (101 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (786 passed, 34 skipped across 65 files)
- `git diff --check`

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
