> **English** | [한국어](CHANGELOG.ko.md)

# Changelog

All notable changes to context-forge are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once a 1.0 is released. Pre-1.0 minor versions may still contain breaking
changes; CHANGELOG entries call those out explicitly.

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
- **Embeddings provider abstraction** — `EMBEDDING_PROVIDER=openai` (default,
  `text-embedding-3-small`) or `local` (deterministic SHA-256, offline /
  air-gapped).
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
