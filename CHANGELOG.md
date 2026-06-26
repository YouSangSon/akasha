> **English** | [한국어](CHANGELOG.ko.md)

# Changelog

All notable changes to Akasha are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once a 1.0 is released. Pre-1.0 minor versions may still contain breaking
changes; CHANGELOG entries call those out explicitly.

## [Unreleased]

- PR #19 added MCP Streamable HTTP at `/mcp`, MCP resources, MCP prompts, and
  structured MCP tool output for clients that consume typed results.
- Docs: public docs now describe descriptor-shared validation, non-root
  container runtime defaults, production credential replacement, and atomic
  archive-cleanup claim semantics; stale pgvector reindex follow-up comments
  removed to match current behavior.

Post-release audit cycle. v1.0.0 shipped with 0 OSS users, so this window
was the safe time to tighten default-strict behavior on multi-tenancy
boundaries and harden the secret-scrubber surface — all the changes below
were merged during that window. The next release will bundle them together;
strict SemVer suggests `2.0.0` (breaking default behavior on the org guard),
but a `1.1.0`-with-prominent-breaking-warning is also defensible given the
small actual impact surface.

### Added

- **pgvector backend — Postgres-only deploy option** — a `VectorIndex` port
  (`src/vector/vector-index.ts`) abstracts the vector backend so either Qdrant
  or pgvector can be selected at startup via `VECTOR_BACKEND`. The new
  `pgvector` adapter (`src/vector/pgvector-index.ts`) stores embeddings in a
  `memory_vectors` table using the Postgres `vector` extension (HNSW index,
  cosine ops) and provides the same `upsert`/`query`/`delete` interface with
  org/scope filter parity. Setting `VECTOR_BACKEND=pgvector` removes the
  Qdrant service dependency entirely; the `compose.pgvector.yaml` overlay
  (`docker compose -f compose.yaml -f compose.pgvector.yaml up -d`) swaps in
  `pgvector/pgvector:pg16` for local development. Switching backends requires
  `reindex_memory`.
- **Persistent entity and temporal graph foundation** — `add_memory` now
  extracts deterministic mentions (code symbols, paths, URLs, dates, and named
  concepts) into `entities` and `memory_entity_mentions`, and records same-row
  co-mentions plus date context in `entity_relationships`. `search_memory`
  uses that graph as an exact rescue/boost path alongside Postgres FTS,
  substring fallback, and vector retrieval. Migration range is now `001-011`.
- **MCP roots, elicitation, and sampling helpers** — MCP transports now register
  `list_workspace_roots` for client-advertised `roots/list` and
  `add_memory_interactive` for form-based elicitation before storing accepted
  memory through the normal `add_memory` path. `classify_memory_candidate` uses
  client sampling to suggest a memory kind and concise summary without storing
  anything. Unsupported clients receive explicit structured results instead of
  failed requests. The TypeScript MCP SDK minimum is now `^1.28.0`, the first
  locked version this project verifies for these server-to-client APIs.
- **Encrypted backup artifacts** — `backup:create` now honors
  `BACKUP_ENCRYPTION_KEY_FILE` and encrypts Postgres dumps plus Qdrant snapshots
  with AES-256-GCM before off-host copy. The manifest is rewritten to `.enc`
  artifacts with ciphertext checksums, plaintext artifacts are removed by
  default, and `backup:decrypt` can restore one artifact for operator restore
  commands. KMS remains external: provide a 32-byte data key through the key
  file from your scheduler or secret manager.
- **Context-pack prompt-injection hardening** — generated context packs now
  start with a trust-boundary notice stating that retrieved memories are
  untrusted notes, not instructions. Excerpts containing prompt-injection-like
  phrases such as "ignore previous instructions" are labeled with a warning.
- **Lifecycle init automation** — the CLI now includes `init` to generate
  `.akasha/` MCP client snippets, a `.env`-sourcing MCP stdio wrapper, and
  session-start/session-end hook scripts. The new `remember` command lets hooks
  store short durable summaries through the existing `add_memory` path without
  requiring the HTTP server. `install.sh` runs init after build and migrations.

### Security

- **OAuth/OIDC JWT validation for HTTP transports** — `/mcp` and `/v1/*` now
  accept OAuth/OIDC JWT access tokens in addition to static
  `MEMORY_API_TOKENS`. Tokens are verified against configured authorization
  servers, JWKS, `MCP_OAUTH_RESOURCE_URL` audience, expiry / not-before,
  algorithm allowlist, and tool-specific scopes (`akasha:read`,
  `akasha:write`, `akasha:admin`, or compatibility `akasha:memory`). JWT
  organization claims default to `organization_id` and act like token-org
  bindings when present; insufficient OAuth scopes return 403 with a Bearer
  `insufficient_scope` challenge.
- **Secret scrubber now covers `title` and `summary`, not only `content`** —
  `writeCanonicalMemory` previously only scanned `content` for credential
  shapes (AWS key, GitHub PAT, OpenAI key, PEM, JWT, etc.); a caller could
  pass a secret in `title` or `summary` and bypass the guard the README and
  `docs/security.md` headline as "blocks API keys / PEM / bearer / JWT
  before any record hits Postgres or Qdrant". The guard now scans all three
  user-controlled fields and raises one `SecretDetectedError` with the
  union of categories found. (PR #5,
  [`f033903`](https://github.com/YouSangSon/akasha/commit/f033903))
- **`retrieveMemory` refuses org-blind reads by default** — when
  `organizationId` was undefined on a request (no token-org binding, no
  `x-organization-id` header, no body field), the function fell through to
  org-blind Qdrant queries + org-blind PG hydration. The legacy single-tenant
  behavior was documented but trivially easy to fall into accidentally,
  silently leaking cross-org data once the operator added a second tenant.
  Default is now strict — the function throws with operational guidance.
  Set `LEGACY_ANONYMOUS_SEARCH=true` to opt back into the historical behavior.
  **BREAKING** for any deployment that relied on the implicit fallback;
  one-line `.env` migration. (PR #6,
  [`809eb87`](https://github.com/YouSangSon/akasha/commit/809eb87))

### Fixed

- **Backend-aware readiness and tenant attribution fixes** — `/readyz` now
  probes Qdrant only when `VECTOR_BACKEND=qdrant`, so `VECTOR_BACKEND=pgvector`
  deployments no longer fail readiness because Qdrant is absent. Qdrant
  bootstrap now calls the non-destructive `ensureCollection(dimensions)` path.
  `ingest_jobs` and `context_pack_runs` now write `organization_id`
  explicitly instead of relying on the database default.
- **Paged reindexing for large scopes** — `reindex_memory` now reads chunks,
  embeds, upserts, and updates point IDs in bounded pages instead of loading an
  entire project/user scope into memory. Stale-vector deletes still complete
  before any upsert page starts, preserving shrink-reindex semantics.
- **Rollback PG state when `writeCanonicalMemory` hits a downstream failure** —
  embedding 5xx, OpenAI rate-limit, or Qdrant upsert errors used to leave
  orphan `memory_records` + `memory_chunks` rows behind with no Qdrant points
  pointing at them. Search couldn't find them, compaction wouldn't clean them
  up (compaction targets duplicates / decay, not orphans), and `reindex_memory`
  only repaired them if the operator noticed. The catch block now calls a new
  `deleteMemoryRecord` repository method which leverages schema-level
  `ON DELETE CASCADE` to atomically remove `memory_chunks`, `ingest_jobs`,
  and `relationships` in the same Postgres transaction — best-effort cleanup
  that re-throws the original error if cleanup itself fails. The audit's
  recommended outbox sweeper (option B, schema migration + retry loop) is
  deferred as a follow-up; this is the schema-unchanged option A. (PR #7,
  [`5764323`](https://github.com/YouSangSon/akasha/commit/5764323))

### Added

- **Ingest outbox sweeper — crash-resilient Qdrant indexing (#12, parts 3-5)** —
  `writeCanonicalMemory` now records a write-ahead `qdrant_status='pending'` row
  (via `markQdrantPending`) immediately after chunks are committed to Postgres,
  before touching Qdrant. On success the row is cleared by `markQdrantCompleted`;
  in-process failures still go through the option-A catch block (CASCADE delete,
  no orphan) so `add_memory` success/failure semantics are unchanged. Only a true
  process crash between the write-ahead and completion leaves a pending row — the
  background ingest sweeper (`src/compact/ingest-sweeper.ts`) picks those up,
  re-embeds the already-committed chunks, and upserts the points to Qdrant. The
  sweeper uses the same exponential backoff as the compaction sweeper (1 s base,
  cap 5 min, give up after 5 attempts). Opt in via `INGEST_SWEEP_ENABLED=true`
  (default false) on a single continuously-running replica; set tick cadence with
  `INGEST_SWEEP_INTERVAL_MS` (default 30 000 ms).

### Performance

- **Postgres full-text lexical retrieval** — `search_memory` lexical candidates
  now use a generated `memory_records.search_vector` column, a GIN index, and
  `ts_rank_cd` scoring before merging with vector candidates. The previous
  substring matching remains as a fallback for exact file paths, env vars, and
  short code identifiers.
- **`embedBatch` API to collapse N HTTP RTTs into one** — `writeCanonicalMemory`
  and `reindexCanonicalMemory` used `Promise.all(map(embed))` to embed each
  chunk individually. For OpenAI that meant N round-trips per ingest and per
  reindex sweep — 100 chunks at ~200ms RTT = ~20s of pure round-trip latency,
  plus N times the rate-limit pressure, at the same per-token cost. The new
  `embedBatch(inputs: string[])` method is part of `EmbeddingProvider`:
  OpenAI implements it natively (single `embeddings.create` with array input);
  Transformers and Local providers loop sequentially since neither pays
  per-call overhead. Both call sites verify post-batch that `embeddings.length
  === chunks.length` so a misbehaving provider cannot silently misalign.
  (PR #8, [`7b5afac`](https://github.com/YouSangSon/akasha/commit/7b5afac))

### Security (audit cycle 2)

- **`reindex_memory` is now org-scoped and strict** — requires `organizationId` (throws without
  it), matching the existing guard on `search_memory`. The CLI `reindex` command gained an
  optional `--organization-id` flag (default `"default"`). Previously the reindex path ran
  org-blind, silently touching every tenant's chunks.
- **`deleteMemoryRecord` now enforces org guard** — the cleanup helper introduced in PR #7
  previously accepted any `memoryRecordId` without verifying it belongs to the calling org.
  Added `organizationId` guard to close the cross-tenant deletion path (SEC-5).
- **HTTP error handling hardened** — generic 500 responses now return a static
  `"internal server error"` body (no internal detail leak). `compact_memory` rate-limit now
  returns HTTP **429** with a `Retry-After` header instead of 500. Removed a `as never` cast
  that suppressed a type-level exhaustiveness check.
- **`RATE_LIMIT_PER_MINUTE` default added to `compose.yaml`** — rate limiting is now on out of
  the box for Compose deployments (value: 60 req/min). Previously the env var was absent from
  the Compose file, leaving new deployments with no rate cap unless operators set it manually.
- **Secret scrubber expanded** — now also blocks GCP API keys, Stripe secret/publishable keys,
  Slack tokens (`xoxb-`, `xoxp-`, `xoxa-`), and database connection strings (`postgres://`,
  `mysql://`, `mongodb+srv://`), in addition to the existing AWS, GitHub PAT, OpenAI, Anthropic,
  PEM, Bearer, and JWT patterns.
- **Security unit tests added** — new test suite covers rate-limit enforcement, bearer-auth
  paths, and `resolveOrganizationId` logic; the SEC-1 isolation assertion was tightened to catch
  AND/OR SQL precedence bugs.
- **Strict org guard extended to the remaining read paths** — PR #6 made `retrieveMemory`
  (search) strict, but `listMemory` and `getMemoryRecordsByIds` still filtered `organization_id`
  only when defined, so an unbound token running `compact_memory` (dry-run) read memories
  org-blind across tenants. Both read methods now apply the same strict guard via a shared
  `assertOrganizationId` helper and take an `allowLegacyAnonymous` flag the handlers source from
  `LEGACY_ANONYMOUS_SEARCH`. **BREAKING** for unbound-token deployments that relied on org-blind
  reads; same one-line `LEGACY_ANONYMOUS_SEARCH=true` migration as PR #6.

### Fixed (audit cycle 2)

- **MCP stdio transport now registers all 7 tools** — `reindex_memory` and `unarchive_memory`
  were missing from the stdio transport, leaving MCP clients (Claude Code, Codex CLI) with only
  5 of the 7 tools available over HTTP. Now matches HTTP and CLI parity.
- **Silent failures surfaced** — parse errors, DB error messages stripped of stack traces, and
  `audit_log.error_message` capped to prevent oversized payloads. Previously these failed
  silently or exposed internal stack details.

### Added (audit cycle 2)

- **`/readyz` now wires real dependency probes** — `startOperatorServer` builds
  and passes a `DependencyProbes` set automatically: Postgres (`SELECT 1`) and
  Qdrant (`GET /healthz`) are always active; the OpenAI probe (`GET /v1/models`)
  is included only when `EMBEDDING_PROVIDER=openai`, so `transformers`/`local`
  deployments without an API key are unaffected. Returns 503 when any dependency
  is unreachable, making `/readyz` a true readiness gate for orchestrators.
  A dedicated single-connection pool is created for the Postgres probe and torn
  down on server close. The conditional selection logic lives in an exported
  `selectDependencyProbes(config, pool)` helper for testability.

### Performance (audit cycle 2)

- **Migration 007: `ingest_jobs` outbox columns** (foundational, in-progress) — adds
  `status`, `retry_count`, `last_error`, `process_after`, and `processed_at` columns to
  `ingest_jobs` for the option-B outbox sweeper. Schema file is on `main` (#12, part 1 of 5);
  sweeper registration and retry loop are in-flight on the #12 branch.
- **Migration 008: FK index on `memory_chunks`** — `008_chunks_fk_index.sql` adds
  `idx_memory_chunks_record` on `memory_chunks(memory_record_id)`, eliminating sequential scans
  on the FK join path. Migrations are now 001-009.
- **`listMemory` is now bounded** — enforces a `LIMIT` (default 1000, max 5000) on browse
  queries. Previously unbounded queries could return the full table for large tenants.
- **Batched N+1 DB writes** — chunk inserts and upserts are now issued in a single round-trip
  rather than per-item, complementing the existing `embedBatch` change (PR #8).

### Documentation (audit cycle 2)

- **Documentation accuracy pass** — fixed pre-existing drift across `docs/architecture.md`,
  `docs/configuration.md`, `docs/api-reference.md`, `CONTRIBUTING.md`, and `README.md`:
  `OPENAI_API_KEY` marked optional (only needed when `EMBEDDING_PROVIDER=openai`); embedding
  default corrected to `transformers`; migration range updated to 001-009; `ingest_jobs` outbox
  columns added to schema diagram; `/readyz` probe list corrected against actual
  `check-dependencies.ts` behavior; MCP tool list updated to 7 tools.
- **`AGENTS.md` dangling references removed** — replaced broken `.vibe/context-index.md` and
  `.pi/skills/vibe-workflow/SKILL.md` references (both absent) with accurate contributor
  guidance pointing to `README.md`, `CONTRIBUTING.md`, and `docs/`.
- **`docs/README.md` documentation index added** — new index linking every doc with a one-line
  description, listing both English and Korean mirrors.
- **`docs/self-hosted-operations.ko.md` added** — Korean mirror of `self-hosted-operations.md`
  (the only doc that was missing a `.ko.md` counterpart).

### Documentation
  `docs/migrations/openai-to-transformers.{md,ko.md}` retitled from
  "Migration: OpenAI → Transformers default (v1.0.x → next)" to "Switching
  between OpenAI and Transformers embedding providers". The v1.0.x framing
  was anachronistic after collapsing the transformers + default-flip work
  into the v1.0.0 release; the operational steps are now a reference for
  switching in either direction, not a one-time migration.
  ([`a3b456a`](https://github.com/YouSangSon/akasha/commit/a3b456a))
- **README landing tightened for 30-second value comprehension** — added
  CI / License / MCP-compatible / Node ≥20 badges, leading tagline
  "Persistent memory for AI coding agents — free, local, self-hosted" +
  elevator paragraph surfacing the differentiator (no API key, $0 cost,
  data stays on your box). Quick-start fix: "fill in `OPENAI_API_KEY` at
  minimum" → "defaults work — `OPENAI_API_KEY` only needed if you set
  `EMBEDDING_PROVIDER=openai` later". (Same `a3b456a`)
- **`package.json` keywords expanded 9 → 19** — added `mcp-server`,
  `agent-memory`, `embeddings`, `rag`, `onnx`, `transformers`,
  `huggingface`, `claude-code`, `self-hosted`, `local-first` to surface
  the project for the right npm and GitHub topic searches. (Same `a3b456a`)

## [1.0.0] — 2026-04-26

Initial public release. Akasha graduates from internal hardening
work to a publishable open-source project.

### Added — OSS packaging

- **`LICENSE`** (MIT), comprehensive **`.env.example`**, expanded **`README.md`**
  with quick-start and architecture overview, **`install.sh`** one-command
  setup, **`CONTRIBUTING.md`**, **`CHANGELOG.md`**, GitHub Actions CI
  (matrix Node 20+22 + Postgres service container).
- **Documentation suite** — `docs/configuration.md`, `docs/api-reference.md`,
  `docs/deployment.md`, `docs/architecture.md`, `docs/security.md`,
  `docs/operations.md`, `docs/troubleshooting.md`.
- **GitHub governance** — issue templates (bug/feature + config), PR template,
  `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md` policy.
- **Bilingual docs** — every user-visible doc shipped in both English and
  한국어 with cross-link toggles.

### Added — Core

- **MCP + HTTP tool surface** — `add_memory`, `search_memory`,
  `build_context_pack`, `reindex_memory`, `compact_memory`, `unarchive_memory`,
  `list_audit_log`. Identical tool semantics across stdio (Claude/Codex CLI)
  and JSON-over-HTTP.
- **Multi-tenancy** — `organization_id` on every record; bearer tokens may
  bind to an org (`token:org` syntax). Cross-org reads/writes refused with
  403; org filter applied in SQL and Qdrant filter.
- **Audit log** — every tool invocation produces a row in `audit_log`
  (org, actor, tool, outcome, duration, request id).
- **Compaction v2** — exact-content + semantic (cosine) duplicate detection,
  exponential decay scoring, dry-run plan output. Apply path archives
  records to `memory_archive` (with original timestamps + `qdrant_point_ids`),
  hard-deletes the canonical row, and upserts Qdrant point removal. TOCTOU
  guard via `updated_at <= planGeneratedAt`. Idempotent via UUID
  `idempotency_key`. Per-org rate limit (default 1/hour).
- **Background sweeper** — `COMPACTION_SWEEP_ENABLED=true` enables a
  setInterval loop that retries pending Qdrant cleanups with exponential
  backoff (max 5 attempts, then `qdrant_status='failed'` for ops review).
- **Unarchive recovery** — restores archived records to canonical state,
  preserving original timestamps and source linkage. Re-chunks content,
  re-embeds, re-upserts to Qdrant. Idempotent (`unarchived_at` column).
  Per-archive failure isolation.
- **Embeddings provider abstraction** — three swappable providers via
  `EMBEDDING_PROVIDER`: `transformers` (default, free local ONNX via
  `@huggingface/transformers`, `Xenova/all-MiniLM-L6-v2`, 384-dim — the
  same model Chroma and txtai default to, picked to align with the MCP
  memory ecosystem norm of free-local default), `openai` (paid,
  `text-embedding-3-small`, 1536-dim — opt-in via `OPENAI_API_KEY`), and
  `local` (deterministic SHA-256 stub for CI / plumbing tests; semantically
  meaningless). Switching providers requires `reindex_memory` after
  recreating the Qdrant collection at the new vector dimension — see
  [docs/migrations/openai-to-transformers.md](docs/migrations/openai-to-transformers.md)
  for the operational playbook.
- **Auth + rate limit** — bearer token via `MEMORY_API_TOKENS` (multi-token
  rotation, optional org binding); token-bucket rate limiter
  (`RATE_LIMIT_PER_MINUTE`); fail-closed startup gate refuses to bind to
  non-loopback hosts without tokens.
- **Health probes** — `/healthz` (liveness, no auth) and `/readyz` (returns
  200 unconditionally in the default server; dependency-probe builders for PG,
  Qdrant, and OpenAI are implemented in `src/health/check-dependencies.ts` but
  are not wired into `startOperatorServer` — probes are opt-in via the
  `dependencyProbes` option on `createOperatorServer`).
- **Backup + restore** — `npm run backup:create` snapshots Postgres
  (pg_dump) + Qdrant (snapshot API) to `BACKUP_DIR`. `npm run restore:smoke`
  validates the latest backup against an isolated compose stack.
- **Test suite** — 219 unit tests, 9 skipped (eval harness gated by
  `RUN_EVAL=1`). 3 PG-dependent integration test files skip when local
  Postgres on 5432 isn't reachable.

### Security

- HTTP body validation rejects `dryRun: "false"` (string), `dryRun: 0`, etc. —
  only strict booleans accepted for the destructive compaction trigger.
- `getMemoryRecordsByIds` accepts `organizationId` for org-scoped hydration
  (defense-in-depth at the search post-Qdrant step).
- `MEMORY_API_TOKENS` empty + non-loopback bind = startup throw.
- Cascade-delete indexes on `relationships` and `ingest_jobs` FK columns
  prevent sequential scans during P17 apply on populated DBs.
- Secret scrubber blocks API keys / PEM blocks / bearer tokens / JWTs at
  `writeCanonicalMemory` before any record hits Postgres or Qdrant.
