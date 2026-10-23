# DECISIONS

## 2026-10-23 — Separate User Delivery From Client Research Outcomes

The current user request is usable implementation, required verification, Git
delivery, safe owned-resource cleanup, and truthful portfolio evidence. The user
does not currently use Claude Code. The earlier two-client research objective
therefore does not govern completion of this delivery. `goal.md` now reflects
the user request; Claude remains unverified and is not a delivery blocker.

Retain the 15% benchmark threshold, the failed MCP result, and the separate
successful CLI-prefetch result. A negative experiment is valid evidence, not a
passed benchmark. This scope correction does not waive required local checks,
public contracts, data preservation, or the unresolved anonymous-volume incident.

## 2026-08-31 — Gate Product Value Before More Architecture Extraction

Superseded for delivery scope by the 2026-10-23 decision above. The research
protocol, thresholds, and historical findings below remain unchanged.

Decision: make `goal.md` the canonical objective and require evidence in
`GATES.md` that the default stack retrieves relevant project and user memory and
reduces real client input tokens without outcome regression.

Why:
- The implementation exposes durable storage, search, context packs, and MCP
  integration, but presence of those surfaces does not prove retrieval quality
  or token savings.
- The prior transformers + pgvector fixture passed aggregate recall but missed
  both user-scope answers, and its small context pack was larger than raw memory.
- Further transport/module extraction would not resolve those product-value
  failures.

Implementation:
- Regression smoke thresholds are recall@5 >= 0.90, MRR@5 >= 0.55,
  user-scope recall@5 = 1.00, cross-org leakage = 0, and pinned-runner warmed
  p50/p95 <= 100/250 ms.
- Codex and Claude are evaluated separately with paired successful on/off runs;
  the token target is a median reduction of at least 15% with no success loss
  or required-decision omission.
- Code intelligence, external deployment, paid execution, and credential
  changes remain outside the local implementation scope.

Tradeoff:
- The initial quality gate is a regression smoke anchored to a small corpus,
  not enough for a broad product claim. `GATES.md` records the larger evidence
  bar separately.

## 2026-08-31 — Let Retrieval Evidence Outrank Unrelated Metadata

Decision: keep project scope as a score-tie breaker and raise vector and lexical
maximum bonuses from 50 to 100 in the shared ranker.

Why:
- The default-stack gate showed the q09 user fact at rank 6 even though it was
  the strongest vector and lexical match; unrelated decision metadata had a
  90-point head start.
- Doubling the two query-evidence signals moves the answer above the `k=5`
  cutoff without adding a user quota, changing schemas, or weakening gates.
- Metadata-only callers retain the same metadata, recency, and generic-note
  weights. Because project preference is now tie-only, stronger user-scope
  metadata can correctly move ahead of weaker project-scope metadata.

Tradeoff:
- Strong hybrid relevance can now outrank authoritative-looking but unrelated
  decisions. The checked-in 20-query gate protects the measured behavior, but
  broader product claims still require the larger corpus defined in
  `GATES.md`.

## 2026-08-31 — Keep Qdrant Versions Compatible And Audit Fail-Closed

Superseded on 2026-10-22 by PR #25: Transformers 4.3.1 and the refreshed
lockfile pass native npm audit without exceptions. The app image now uses
Debian because ONNX requires a glibc loader that Alpine does not provide. The
Qdrant client/server compatibility decision remains unchanged.

Decision: keep the bundled Qdrant server at 1.13.2, constrain the JavaScript
client to compatible 1.14.x patches, and allow only the exact unresolved
`sharp` advisory through a checked audit policy.

Why:
- Qdrant's client check supports at most one minor of difference. The old
  `^1.13.0` range silently resolved to client 1.19.0 and emitted an
  incompatibility warning against the bundled 1.13.2 server.
- Jumping the named server volume from 1.13 directly to 1.19 would cross
  sequential storage migrations and risks irreversible data loss. Client
  1.14.1 remains compatible and can use fixed Undici 6.28.0.
- Transformers currently installs `sharp` 0.34.5, but Akasha accepts only text
  for `feature-extraction`; it exposes no attacker-controlled image path. The
  audit policy matches that one advisory exactly and rejects every other
  moderate-or-higher finding or any change in fix status.

Tradeoff:
- Raw `npm audit` remains nonzero until the supported Transformers line ships
  `sharp >= 0.35.0`. The policy and paired security docs must be removed when
  that fix becomes available.

## 2026-08-31 — Use Chunk-Derived UUID Vector Point IDs

Decision: encode each positive safe `memory_chunks.id` injectively in a
deterministic UUIDv8-shaped string and use that literal in both Qdrant and
pgvector.

Why:
- Qdrant 1.13.2 rejects the previous arbitrary `chunk:<id>` strings.
- The chunk ID is already the global canonical identity, so hashing, random
  UUIDs, and a SQL migration are unnecessary.
- A shared builder keeps add, refresh, retry, reindex, rollback, and unarchive
  paths consistent.

Tradeoff:
- Legacy points converge through record-scoped reindex. Delete failures are not
  converted to silent success because that could falsely report cleanup.

## 2026-07-05 — Split Compact Tool Handler

Decision: move the `compact_memory` service tool adapter into
`src/compact/tool-handlers.ts`.

Why:
- `compact_memory` is the public adapter for compaction dry-run/apply behavior,
  and the planning/apply domain implementation already lives in `src/compact/`.
- Existing tests characterize direct registry validation, legacy override
  dry-run behavior, apply rejection, canonical apply, semantic dedup,
  HTTP routing, MCP registration, and output schema.
- Moving this adapter completes the compaction tool boundary without changing
  shared descriptors or transport entrypoints.

Implementation:
- `createToolHandlers` now composes `createCompactionToolHandlers` for both
  `compact_memory` and `unarchive_memory`.
- Shared repository fallback/canonical repository access now lives in
  `src/mcp/tool-repository-access.ts` and is reused by MCP and compact
  adapters.
- Tool names, shared schemas, JSON HTTP routes, MCP exposure, validation
  errors, and result fields remain unchanged.

Tradeoff:
- The compact adapter still reads `CreateToolRegistryOptions` because legacy
  repository override compatibility is part of the current public test surface.
  A new application-service abstraction would be larger than this loop needs.

## 2026-07-05 — Split Reindex Tool Handler

Decision: move the `reindex_memory` service tool adapter into
`src/store/tool-handlers.ts`.

Why:
- `reindex_memory` is the public adapter for rebuilding canonical chunks into
  the active vector backend, and the implementation already lives in
  `src/store/canonical-indexing.ts`.
- Existing tests characterize required `organizationId`, direct registry
  dispatch, MCP registration/dispatch, output schema, and the underlying
  `reindexCanonicalMemory` normalization.
- Moving only this adapter keeps the loop small while reducing
  `src/mcp/tool-handlers.ts` ownership of store/indexing behavior.

Implementation:
- `createToolHandlers` now composes `createStoreToolHandlers`.
- Tool name, shared schema, JSON HTTP route `/v1/memory/reindex`, MCP exposure,
  validation errors, and result fields remain unchanged.

Tradeoff:
- `add_memory` still stays in `src/mcp/tool-handlers.ts`; moving the full write
  adapter is a larger boundary because it coordinates secret scrubbing, chunk
  writes, ingest jobs, embeddings, and vector upsert.

## 2026-07-05 — Split Unarchive Tool Handler

Decision: move the `unarchive_memory` service tool adapter into
`src/compact/tool-handlers.ts`.

Why:
- `unarchive_memory` is the public adapter for the compaction recovery flow,
  and the domain implementation already lives in `src/compact/`.
- Existing tests characterize direct registry validation, legacy override
  rejection, MCP registration/dispatch, output schema, and the underlying
  unarchive orchestration.
- Moving only this adapter keeps the loop small while still reducing
  `src/mcp/tool-handlers.ts` ownership of domain recovery behavior.

Implementation:
- `createToolHandlers` now composes `createCompactionToolHandlers`.
- Tool name, shared schema, JSON HTTP route `/v1/memory/unarchive`, MCP
  exposure, validation errors, and result fields remain unchanged.

Tradeoff:
- `compact_memory` stays in `src/mcp/tool-handlers.ts` for now because moving
  the full dry-run/apply adapter is a larger boundary with more dependencies.

## 2026-07-05 — Split Audit Tool Handler

Decision: move the `list_audit_log` service tool adapter into
`src/audit/tool-handlers.ts`.

Why:
- Audit-log listing is an audit capability, not a memory/governance handler.
- The audit domain folder already owns `audit_log` persistence.
- Existing tests characterize canonical-service audit listing, direct
  `options.auditLog` listing, trimmed organization ids, and the shared
  registry contract.

Implementation:
- `createToolHandlers` now composes `createAuditToolHandlers`.
- Tool names, shared schemas, JSON HTTP route `/v1/audit/list`, MCP exposure,
  and result fields remain unchanged.

Tradeoff:
- The adapter still depends on MCP tool types because this loop only moves the
  existing boundary. A separate application-service interface is still YAGNI.

## 2026-07-05 — Split Goal-Run Tool Handlers

Decision: move goal-run service tool adapters into
`src/goal-run/tool-handlers.ts`.

Why:
- `src/mcp/tool-handlers.ts` should not own every capability adapter as the
  codebase moves toward module boundaries.
- Goal-run tools already have a domain folder and focused handler tests for
  scope resolution, org defaults, close-note mapping, context-pack rendering,
  repeat-attempt detection, and validation-before-dispatch behavior.
- The public contract remains the same because tool names, shared schemas,
  registry keys, JSON HTTP routes, and MCP exposure still flow through the
  existing descriptors and registry.

Implementation:
- `createToolHandlers` now composes `createGoalRunToolHandlers`.
- Shared handler validation helpers moved to `src/mcp/tool-utils.ts`.
- `CONTRACTS.md`, API docs, and architecture docs list the new adapter module.

Tradeoff:
- Goal-run adapters still depend on MCP tool types because this loop moves an
  existing boundary; it does not introduce a new application-service interface.

## 2026-07-05 — Split MCP Service Tool Registration

Decision: move MCP service tool registration into `src/mcp/service-tools.ts`.

Why:
- `src/mcp/server.ts` should assemble the MCP server without owning the service
  tool registration loop.
- Service tool registration is public MCP surface because it exposes tool names,
  input/output schemas, and registry dispatch behavior.
- Existing MCP server tests already characterize registered service tool names,
  handler dispatch, output schemas, structured content, and MCP HTTP exposure.

Implementation:
- `createMcpServer` now calls `registerServiceTools`.
- `src/mcp/service-tools.ts` owns registration from `SERVICE_TOOL_DESCRIPTORS`
  and conversion through `toToolResult`.
- Architecture docs and `CONTRACTS.md` list the new module.

Tradeoff:
- The module still dispatches to the existing registry. No new application
  service abstraction was added in this loop.

## 2026-07-05 — Split MCP Context Tool Registration

Decision: move MCP-only context tool registration and helper parsing into
`src/mcp/context-tools.ts`.

Why:
- `src/mcp/server.ts` should assemble the MCP server and public registrations
  without owning every client-capability helper.
- Context tool names and result shapes are public MCP surface:
  `list_workspace_roots`, `add_memory_interactive`, and
  `classify_memory_candidate`.
- Existing MCP server tests already characterize roots, elicitation, sampling,
  unsupported-client results, validation before side effects, and OAuth scope
  enforcement through MCP HTTP.

Implementation:
- `createMcpServer` still calls `registerMcpContextTools`.
- `src/mcp/context-tools.ts` owns context tool descriptors, elicitation schema
  construction, sampling JSON parsing, and registry dispatch to `add_memory`.
- Architecture docs and `CONTRACTS.md` list the new module.

Tradeoff:
- The context tools remain MCP-specific. No JSON HTTP route or application
  abstraction was added because there is no non-MCP caller.

## 2026-07-05 — Split MCP Prompt Registration

Decision: move MCP prompt registration and prompt argument schemas into
`src/mcp/prompts.ts`.

Why:
- `src/mcp/server.ts` should assemble the MCP server and public registrations
  without owning every prompt template.
- Prompt names and argument validation are public MCP surface because clients
  can list and request `akasha_session_start` and `akasha_store_memory`.
- Existing MCP server tests already characterize prompt names, argument
  validation, session prompt limit coercion, and rendered text.

Implementation:
- `createMcpServer` still calls `registerAkashaPrompts`.
- `src/mcp/prompts.ts` owns prompt templates and prompt argument schemas.
- Architecture docs and `CONTRACTS.md` list the new module.

Tradeoff:
- MCP context tools remain in `src/mcp/server.ts`; splitting those is a larger
  boundary because they depend on client capabilities and authorization.

## 2026-07-05 — Split MCP Resource Registration

Decision: move MCP resource template registration and resource URI parsing into
`src/mcp/resources.ts`.

Why:
- `src/mcp/server.ts` should assemble the MCP server and public registrations
  without owning every resource handler detail.
- Resource templates are public MCP surface because clients can list/read
  `recent-project-memory` and `context-pack`.
- Existing MCP server tests already characterize template names, default recent
  query behavior, context-pack reads, and invalid resource params.

Implementation:
- `createMcpServer` still calls `registerAkashaResources`.
- `src/mcp/resources.ts` owns resource templates and URI query/path validation.
- Architecture docs and `CONTRACTS.md` list the new module.

Tradeoff:
- MCP context tools and prompts remain in `src/mcp/server.ts`; they can be split
  later behind their own focused contract checks.

## 2026-07-05 — Split Tool Registry Audit Instrumentation

Decision: move tool-boundary audit/log instrumentation into
`src/mcp/tool-registry-instrumentation.ts`.

Why:
- `src/mcp/tool-registry.ts` should assemble canonical services, handlers, and
  registry wrapping without owning the audit wrapper implementation.
- Audit rows are contract-sensitive because they capture org, actor, tool,
  outcome, duration, request id, and error messages.
- Existing audit tests already characterize ok/error rows, trimmed org ids,
  default org behavior, and best-effort failure handling.

Implementation:
- `createToolRegistry` now imports `instrumentToolRegistry`.
- Architecture docs and drift guards point at the new instrumentation module.
- `CONTRACTS.md` lists the new file and audit contract test.

Tradeoff:
- The wrapper still enumerates each tool explicitly. That keeps current typing
  and avoids a generic registry mapper in this loop.

## 2026-07-05 — Split CLI Argument Parsing

Decision: move CLI argument parsing into `src/cli-args.ts` and keep
`src/cli.ts` as the compatibility export plus command dispatch entrypoint.

Why:
- `src/cli.ts` mixed public process entrypoint behavior, parser logic, command
  dispatch, file reading, and lifecycle init calls.
- CLI flags and parse errors are public contract behavior, so the existing
  `tests/cli.test.ts` coverage should guard the move.
- This creates a small CLI boundary without changing scripts, flags, defaults,
  output JSON, or import paths.

Implementation:
- `src/cli.ts` imports and re-exports `parseCliArgs` and `ParsedCliArgs`.
- `CONTRACTS.md` and the contract-baseline drift guard list `src/cli-args.ts`
  and `tests/cli.test.ts`.

Tradeoff:
- No generic command framework was added. The hand-rolled parser is still the
  smallest code that preserves current CLI behavior.

## 2026-07-05 — Split MCP Streamable HTTP Auth Guarding

Decision: move MCP Streamable HTTP authenticated registry guarding and MCP-only
tool authorization into `src/app/middleware/mcp-http-auth.ts`.

Why:
- `src/app/mcp-http.ts` should focus on HTTP transport setup, request parsing,
  rate limiting, and MCP transport lifecycle.
- The auth guard is contract-sensitive because it injects bound
  `organizationId`, rejects mismatches, and maps insufficient OAuth scopes to
  MCP tool errors.
- Existing MCP HTTP tests already cover those behaviors for service tools and
  MCP-only context tools.

Implementation:
- `handleMcpHttpRequest` imports `withAuthenticatedRegistry` and
  `createMcpToolAuthorizer`.
- `CONTRACTS.md` and the contract-baseline drift guard list the new middleware
  file.

Tradeoff:
- The registry wrapper still lists service tools explicitly. That is verbose,
  but it preserves current dispatch typing without adding a generic registry
  abstraction.

## 2026-07-05 — Split JSON HTTP Tool Handler Execution

Decision: move JSON HTTP tool execution from `src/app/routes/memory.ts` into
`src/app/routes/tool-handler.ts`, with route types in
`src/app/routes/types.ts`.

Why:
- `src/app/routes/memory.ts` should stay focused on route table construction
  from `TOOL_ROUTES`.
- The tool execution pipeline combines body parsing, organization resolution,
  OAuth scope checks, schema validation, registry dispatch, and HTTP envelope
  responses; that is a clear boundary for future application-service seams.
- Direct route handler tests now characterize the dispatch and validation
  behavior before the move.

Implementation:
- `createMemoryRoutes` now calls `buildToolRouteHandler`.
- `Route` and `RouteContext` remain exported from `src/app/routes/memory.ts`
  through a compatibility re-export.
- `CONTRACTS.md` and the contract-baseline drift guard list the new route
  modules.

Tradeoff:
- This keeps JSON HTTP orchestration in the route layer for now. It does not yet
  introduce a shared application use-case interface across MCP and JSON HTTP.

## 2026-07-05 — Split MCP Tool Result Formatting

Decision: move MCP tool response formatting into `src/mcp/tool-result.ts`.

Why:
- `src/mcp/server.ts` should focus on server construction, tool registration,
  resources, and prompts.
- MCP response shape is public contract behavior because clients receive both
  `structuredContent` and text `content`.
- A narrow formatter module lets future transport or tool-dispatch refactors
  change internals without rediscovering the response envelope rules.

Implementation:
- `src/mcp/server.ts` now imports `toToolResult`.
- `CONTRACTS.md` lists `src/mcp/tool-result.ts` as an MCP contract source.
- `tests/mcp/server.test.ts` continues to guard the structured output plus JSON
  text response shape.

Tradeoff:
- The formatter keeps the existing `Record<string, unknown>` cast instead of
  introducing a broader MCP response type abstraction in this loop.

## 2026-07-05 — Share HTTP JSON Body Parsing Without Status Drift

Decision: move bounded JSON body parsing into
`src/app/middleware/json-body.ts` and reuse it from JSON HTTP routes and MCP
Streamable HTTP.

Why:
- Both HTTP transports already had the same parser logic and 1 MB cap.
- Body parsing is transport-boundary behavior, so keeping it outside route and
  MCP transport orchestration makes the next architecture splits smaller.
- The two transports have different existing oversized-body statuses, so the
  shared helper must preserve call-site status mapping.

Implementation:
- JSON HTTP calls `readJsonBody(req)` and keeps oversized bodies as 400.
- MCP Streamable HTTP calls `readJsonBody(req, { oversizedStatus: 413 })`.
- `tests/app/server.test.ts` now characterizes the JSON HTTP oversized-body
  status before and after the refactor.

Tradeoff:
- The helper intentionally exposes only the current status override. No
  configurable content-type policy or alternate size cap was added.

## 2026-07-05 — Extract Organization Resolution Behind Route Compatibility

Decision: move JSON HTTP `organizationId` resolution into
`src/app/middleware/organization-resolution.ts` while keeping
`src/app/routes/memory.ts` as the compatibility export path.

Why:
- `organizationId` precedence and validation are transport-boundary behavior,
  not route table construction.
- The clean architecture transition needs smaller HTTP boundary modules before
  deeper application/domain splits.
- Existing tests and downstream imports may already use the route module path,
  so a re-export preserves the current public TypeScript surface.

Implementation:
- `src/app/routes/memory.ts` imports the resolver from the middleware boundary
  and re-exports `resolveOrganizationId`.
- `CONTRACTS.md` lists the new middleware file as a JSON HTTP contract source.
- Existing route and resolver characterization tests continue to exercise the
  old import path.

Tradeoff:
- This is only a boundary extraction. It does not yet introduce application
  service interfaces or customer/module-specific domain packages.

## 2026-07-05 — Freeze Public Contracts Before Architecture Refactors

Decision: create a root `CONTRACTS.md` baseline before clean architecture, DDD,
customer-module, or MSA-readiness refactors.

Why:
- The current public surface spans MCP stdio, MCP Streamable HTTP, JSON HTTP,
  CLI/package scripts, migration filenames, and DB-facing schema behavior.
- The user goal makes request/response contract preservation the top priority.
- A small contract inventory plus drift guard is cheaper and safer than starting
  with a broad module rewrite.

Implementation:
- `CONTRACTS.md` records contract sources, transport envelopes, service tools,
  JSON HTTP routes, MCP-only tools, operator endpoints, and compatibility rules.
- `tests/scripts/public-docs-drift.test.ts` checks `CONTRACTS.md` against
  `TOOL_ROUTES` and core endpoint strings.

Tradeoff:
- This is not a full OpenAPI replacement. Per-tool schema detail remains in
  `docs/api-reference.md` and `src/mcp/tool-schemas.ts`.

## 2026-06-28 — Keep Dedicated Worker Metrics As Guidance

Decision: document the current boundary instead of adding an HTTP metrics
listener to `npm run start:worker`.

Why:
- The dedicated worker already logs compaction and ingest sweeper ticks.
- HTTP `/metrics` can still expose Postgres backlog gauges because it scrapes
  shared database state from the HTTP process.
- Prometheus scrape configs define configured scrape targets; a dedicated
  worker process without an HTTP listener is not a target.

Implementation:
- Operations docs separate in-process HTTP sweeper tick metrics from dedicated
  worker log/backlog-gauge guidance.
- API and operations docs state that a worker-local metrics endpoint or sidecar
  should be added only if operators need Prometheus to scrape per-worker tick
  counters from that process.
- `tests/scripts/public-docs-drift.test.ts` guards the English/Korean wording.

Source:
- Prometheus scrape configuration:
  https://prometheus.io/docs/prometheus/latest/configuration/configuration/#scrape_config

## 2026-06-28 — Guard Public Docs Index Coverage In Existing Test Suite

Decision: add docs index coverage to `tests/scripts/public-docs-drift.test.ts`
instead of adding a separate CI job.

Why:
- Public docs are paired English/Korean markdown files under `docs/`, plus the
  migrations subdirectory.
- `docs/superpowers/**` contains historical/planning docs and is not a public
  docs surface.
- CI already runs `npm test`, so putting the guard in the existing drift suite
  covers CI without new workflow or dependency surface.

Implementation:
- Discover tracked markdown under `docs/`, excluding `docs/superpowers/**` and
  `docs/README*.md`.
- Assert every non-Korean public doc has a `.ko.md` sibling and every Korean
  doc has an English sibling.
- Assert `docs/README.md` lists pairs English-first and `docs/README.ko.md`
  lists pairs Korean-first.

## 2026-06-27 — Separate Sweeper Lifecycle From HTTP Serving

Decision: add a dedicated background worker entrypoint while preserving the
existing opt-in sweeper behavior inside the HTTP server.

Why:
- Sweepers are operational background work, not request handling.
- Multi-replica HTTP deployments need a simple way to run many web replicas
  while keeping recovery workers on one continuously running process.
- Existing sweeper claim queries already use visibility windows and
  `FOR UPDATE SKIP LOCKED`, so the worker can reuse the same domain logic.

Implementation:
- `startBackgroundWorkers()` bootstraps canonical services once and starts the
  enabled compaction and ingest loops.
- `src/app/worker.ts` runs that lifecycle in fail-fast mode.
- `startOperatorServer()` keeps log-and-continue behavior and shares the same
  metrics registry with in-process sweepers.

Tradeoff:
- The dedicated worker currently logs sweeper activity but does not expose its
  own HTTP metrics endpoint. Existing HTTP `/metrics` still exposes queue
  backlog gauges from Postgres; add a worker metrics endpoint only when
  operators need to scrape per-worker tick counters from a separate process.

Sources checked:
- Node HTTP docs: `server.close()` stops accepting new connections and closes
  idle connections, which supports a small `closeOperatorServer()` wrapper for
  app-owned cleanup after HTTP close:
  https://nodejs.org/api/http.html#serverclosecallback
- Redis `agent-memory-server` documents separate production API and background
  worker processes for non-blocking background work, which supports Akasha's
  one-web-replica-or-one-worker guidance without adding a new queue system:
  https://github.com/redis/agent-memory-server

## 2026-06-27 — Keep Node Runtime Support Under Review

Decision: move Akasha's minimum supported Node runtime from Node 20 to Node 22,
and test Node 22 plus Node 24 in CI.

Why:
- The Node.js release schedule marks Node 20 as End-of-Life on 2026-04-30.
- The June 2026 Node.js security release covers supported 22.x, 24.x, and 26.x
  lines, not Node 20.

Sources:
- Node release schedule: https://github.com/nodejs/release#release-schedule
- June 2026 Node.js security release:
  https://nodejs.org/en/blog/vulnerability/june-2026-security-releases

Implementation:
- `package.json` and lockfile root metadata use `engines.node: >=22`.
- `@types/node` is on the Node 22 line to match the oldest supported runtime.
- `.github/workflows/ci.yml` tests Node 22 and 24.
- `install.sh` refuses Node majors below 22.

## 2026-06-28 — Guard Tracked Secret-Shaped Literals Without Reporting Values

Decision: add a repo-level Vitest script that scans tracked text files with the
existing `scanForSecrets` helper, while reporting only file path and category.

Why:
- Runtime memory writes are already blocked by `src/store/secret-scrub.ts`, but
  tracked tests, fixtures, docs, env examples, YAML, JSON, TOML, Docker, and
  CI files can still contain high-confidence secret-shaped literals.
- GitHub push protection is designed to stop hardcoded credentials before they
  reach a repository, so synthetic contiguous examples can block pushes even
  when fake.
- OWASP Secrets Management identifies API keys, database credentials, SSH keys,
  certificates, and similar values hardcoded in source/config as a common
  secret-leak source.

Implementation:
- `tests/scripts/repo-secret-hygiene.test.ts` scans `git ls-files` text files.
- The test excludes `src/store/secret-scrub.ts` and
  `tests/store/secret-scrub.test.ts`, where detector regexes and examples are
  intentional.
- The test allowlists only exact placeholder database URL userinfo pairs such as
  `memory:memory`, `user:pass`, `user:pw`, `postgres:test`, `memory:STRONG_PW`,
  and the exact `${POSTGRES_USER:-memory}:${POSTGRES_PASSWORD:-memory}` form;
  other embedded DB credentials still fail.
- Non-scrubber store tests now build fake AWS/GitHub tokens from string
  fragments at runtime so the tracked source does not contain contiguous
  secret-shaped literals.

Sources:
- GitHub push protection:
  https://docs.github.com/en/code-security/concepts/secret-security/push-protection
- OWASP Secrets Management Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html

## 2026-06-28 — Restore Qdrant Snapshots Into The Manifest Collection

Decision: restore smoke commands receive the Qdrant collection name captured in
the backup manifest as `RESTORE_SMOKE_QDRANT_COLLECTION_NAME`.

Why:
- `scripts/snapshot-qdrant.sh` already records `manifest.qdrant.collectionName`,
  so restore smoke should not assume the default `memory_chunks_v1` collection.
- Operators can set `QDRANT_COLLECTION_NAME` during embedding/model migrations,
  and a restore drill should validate the exact backed-up collection path.

Implementation:
- `scripts/restore-smoke.ts` prefers `manifest.qdrant.collectionName`, then
  falls back to `QDRANT_COLLECTION_NAME`, then `memory_chunks_v1` for older
  manifests.
- Self-hosted restore examples call Qdrant's uploaded-snapshot endpoint with
  `$RESTORE_SMOKE_QDRANT_COLLECTION_NAME` and `priority=snapshot`.

Source:
- Qdrant uploaded snapshot recovery API:
  https://api.qdrant.tech/api-reference/snapshots/recover-from-uploaded-snapshot
