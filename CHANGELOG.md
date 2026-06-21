> **English** | [한국어](CHANGELOG.ko.md)

# Changelog

All notable changes to context-forge are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once a 1.0 is released. Pre-1.0 minor versions may still contain breaking
changes; CHANGELOG entries call those out explicitly.

## [Unreleased]

Post-release audit cycle. v1.0.0 shipped with 0 OSS users, so this window
was the safe time to tighten default-strict behavior on multi-tenancy
boundaries and harden the secret-scrubber surface — all the changes below
were merged during that window. The next release will bundle them together;
strict SemVer suggests `2.0.0` (breaking default behavior on the org guard),
but a `1.1.0`-with-prominent-breaking-warning is also defensible given the
small actual impact surface.

### Security

- **Secret scrubber now covers `title` and `summary`, not only `content`** —
  `writeCanonicalMemory` previously only scanned `content` for credential
  shapes (AWS key, GitHub PAT, OpenAI key, PEM, JWT, etc.); a caller could
  pass a secret in `title` or `summary` and bypass the guard the README and
  `docs/security.md` headline as "blocks API keys / PEM / bearer / JWT
  before any record hits Postgres or Qdrant". The guard now scans all three
  user-controlled fields and raises one `SecretDetectedError` with the
  union of categories found. (PR #5,
  [`f033903`](https://github.com/YouSangSon/context-forge/commit/f033903))
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
  [`809eb87`](https://github.com/YouSangSon/context-forge/commit/809eb87))

### Fixed

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
  [`5764323`](https://github.com/YouSangSon/context-forge/commit/5764323))

### Performance

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
  (PR #8, [`7b5afac`](https://github.com/YouSangSon/context-forge/commit/7b5afac))

### Security (audit cycle 2)

- **`reindex_memory` is now org-scoped and strict** — requires `organizationId` (throws without
  it), matching the existing guard on `search_memory`. The CLI `reindex` command gained an
  optional `--organization-id` flag (default `"default"`). Previously the reindex path ran
  org-blind, silently touching every tenant's chunks.
  ([`c2a76dd`](https://github.com/YouSangSon/context-forge/commit/c2a76dd),
  [`9c8ab3b`](https://github.com/YouSangSon/context-forge/commit/9c8ab3b))
- **`deleteMemoryRecord` now enforces org guard** — the cleanup helper introduced in PR #7
  previously accepted any `memoryRecordId` without verifying it belongs to the calling org.
  Added `organizationId` guard to close the cross-tenant deletion path (SEC-5).
  ([`4a36aba`](https://github.com/YouSangSon/context-forge/commit/4a36aba))
- **HTTP error handling hardened** — generic 500 responses now return a static
  `"internal server error"` body (no internal detail leak). `compact_memory` rate-limit now
  returns HTTP **429** with a `Retry-After` header instead of 500. Removed a `as never` cast
  that suppressed a type-level exhaustiveness check.
  ([`6b2a36e`](https://github.com/YouSangSon/context-forge/commit/6b2a36e))
- **`RATE_LIMIT_PER_MINUTE` default added to `compose.yaml`** — rate limiting is now on out of
  the box for Compose deployments (value: 60 req/min). Previously the env var was absent from
  the Compose file, leaving new deployments with no rate cap unless operators set it manually.
  ([`6b2a36e`](https://github.com/YouSangSon/context-forge/commit/6b2a36e))
- **Secret scrubber expanded** — now also blocks GCP API keys, Stripe secret/publishable keys,
  Slack tokens (`xoxb-`, `xoxp-`, `xoxa-`), and database connection strings (`postgres://`,
  `mysql://`, `mongodb+srv://`), in addition to the existing AWS, GitHub PAT, OpenAI, Anthropic,
  PEM, Bearer, and JWT patterns.
  ([`e96c367`](https://github.com/YouSangSon/context-forge/commit/e96c367))
- **Security unit tests added** — new test suite covers rate-limit enforcement, bearer-auth
  paths, and `resolveOrganizationId` logic; the SEC-1 isolation assertion was tightened to catch
  AND/OR SQL precedence bugs.
  ([`bc5c391`](https://github.com/YouSangSon/context-forge/commit/bc5c391),
  [`f1b0cf1`](https://github.com/YouSangSon/context-forge/commit/f1b0cf1))

### Fixed (audit cycle 2)

- **MCP stdio transport now registers all 7 tools** — `reindex_memory` and `unarchive_memory`
  were missing from the stdio transport, leaving MCP clients (Claude Code, Codex CLI) with only
  5 of the 7 tools available over HTTP. Now matches HTTP and CLI parity.
  ([`77db4ea`](https://github.com/YouSangSon/context-forge/commit/77db4ea))
- **Silent failures surfaced** — parse errors, DB error messages stripped of stack traces, and
  `audit_log.error_message` capped to prevent oversized payloads. Previously these failed
  silently or exposed internal stack details.
  ([`0b0a953`](https://github.com/YouSangSon/context-forge/commit/0b0a953))

### Performance (audit cycle 2)

- **Migration 007: `ingest_jobs` outbox columns** (foundational, in-progress) — adds
  `status`, `retry_count`, `last_error`, `process_after`, and `processed_at` columns to
  `ingest_jobs` for the option-B outbox sweeper. Schema file is on `main` (#12, part 1 of 5);
  sweeper registration and retry loop are in-flight on the #12 branch.
  (#12, [`28b63d1`](https://github.com/YouSangSon/context-forge/commit/28b63d1))
- **Migration 008: FK index on `memory_chunks`** — `008_chunks_fk_index.sql` adds
  `idx_memory_chunks_record` on `memory_chunks(memory_record_id)`, eliminating sequential scans
  on the FK join path. Migrations are now 001–008.
  ([`2c87949`](https://github.com/YouSangSon/context-forge/commit/2c87949))
- **`listMemory` is now bounded** — enforces a `LIMIT` (default 1000, max 5000) on browse
  queries. Previously unbounded queries could return the full table for large tenants.
  ([`22e4028`](https://github.com/YouSangSon/context-forge/commit/22e4028))
- **Batched N+1 DB writes** — chunk inserts and upserts are now issued in a single round-trip
  rather than per-item, complementing the existing `embedBatch` change (PR #8).
  ([`3afb3eb`](https://github.com/YouSangSon/context-forge/commit/3afb3eb))

### Documentation (audit cycle 2)

- **Documentation accuracy pass** — fixed pre-existing drift across `docs/architecture.md`,
  `docs/configuration.md`, `docs/api-reference.md`, `CONTRIBUTING.md`, and `README.md`:
  `OPENAI_API_KEY` marked optional (only needed when `EMBEDDING_PROVIDER=openai`); embedding
  default corrected to `transformers`; migration range updated to 001–008; `ingest_jobs` outbox
  columns added to schema diagram; `/readyz` probe list corrected against actual
  `check-dependencies.ts` behavior; MCP tool list updated to 7 tools.
  ([`a066dc6`](https://github.com/YouSangSon/context-forge/commit/a066dc6),
  [`1902c2f`](https://github.com/YouSangSon/context-forge/commit/1902c2f),
  [`1ffcc30`](https://github.com/YouSangSon/context-forge/commit/1ffcc30))
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
  ([`a3b456a`](https://github.com/YouSangSon/context-forge/commit/a3b456a))
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

Initial public release. context-forge graduates from internal hardening
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
- **Health probes** — `/healthz` (liveness, no auth) and `/readyz` (PG +
  Qdrant + OpenAI reachability, returns 503 to drain orchestrators).
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
