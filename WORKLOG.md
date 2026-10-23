# WORKLOG

## 2026-10-23

- Real PostgreSQL/Qdrant admin validation exposed a sequential archive invariant
  violation: Save preserved canonical `archived` but recreated its vector.
  Shared refresh now performs scoped cleanup only; reindex keeps its full cleanup
  pass and filters archived chunks only during insertion; pending ingest retries
  clean archived records and complete without embedding. Six regressions reproduce
  the three entry points and cleanup failures. Actual Save/Tag, reindex, latest-body
  reactivation/rearchive/search, and a rearmed real retry passed; focused tests passed
  310/310. API docs describe committed-edit failure and concurrency boundaries.
  The test fixture's initial wrong pagination cursor caused a worker OOM; correcting
  it to `afterChunkId` produced the expected RED before the production change.
  The local full run retained seven timeouts; isolated recheck still had four
  timeout/cleanup failures under heavy host load. Source `1631146` then passed all
  five CI jobs, including 2667 tests on both Node 22/24, 35 skips each. No timeout
  or check was weakened. Owned DB resources and exact failed-test leftovers were
  removed after evidence capture. See `GATES.md` for remaining limitations.

- Resumed browser validation completed archive approval with pending cleanup,
  successful archive, archive no-op, and focus fallback to the next record or
  Reload. Isolated HTTP logs contain exactly IDs 1, 2, and 3. Desktop and
  390x844 mobile captures were visually inspected with no horizontal overflow.
  Inspection exposed archived details showing ephemeral; one native option now
  displays archived while the existing disabled controls and payload guard stay
  intact. The corrected display and pending outcome were verified in-browser.
  Both fixture servers exited 0, ports 64313/51867 are closed, the owned tab is
  closed, and the temporary viewport was reset. This is fixture-registry UI
  evidence, not database E2E or a screen-reader test. Typecheck and three focused
  files passed (119 tests); final CI and integration evidence belong to PR #27.
- PR #26 merged at `5e7770f` after all five final CI jobs passed: Node 22/24
  each 2625 tests (35 skips), PostgreSQL 246, pgvector 115, and real default
  retrieval 5. The initial CI convention failure was fixed before merging;
  new tracked files must be included when running the Git-file-based checks.
  Its merged branch was removed only after proving no unique commits and no
  worktree use. The UI change remains in a separate unmerged branch.
- PR #25 merged at `79c7fd6` after Node 22/24, PostgreSQL, and pgvector CI
  passed. It fixes Qdrant point identity, refreshes dependencies with zero
  native npm-audit findings, and supplies ONNX's glibc runtime in the non-root
  Debian image. These checks do not prove an OS-image vulnerability assessment.
- Real recovery exposed a harness contract error: `add_memory` returns a bare
  record ID, while context packs select `scopeType:scopeId:recordId`. Two
  regression tests reproduced the mismatch; both recovery and A/B preflight
  now compare the scoped identity without changing the public API. Focused
  checks passed all 78 cases, and independent read-only review found no blocker.
- The owned PostgreSQL/Qdrant recovery run passed after the correction. It
  compared the restored Qdrant point ID, payload, and vector with the source,
  then exercised authenticated HTTP MCP search and context-pack selection.
  Neither source nor restore project `15810` retains containers, volumes, or
  networks. Logs and cleanup receipts are under the local Git evidence folder.
- An earlier anonymous-volume deletion lacked an exact ownership receipt.
  The user was informed; its impact remains unknown. Subsequent cleanup uses
  recorded project/container mounts and exact resource identities.
- Final local checks passed on Node 24.14.0: typecheck, build (reused from the
  successful restore run), native dependency audit with zero findings, staged
  diff hygiene, and the full suite (87 files; 2628 passed, 35 skipped). Local
  database/eval skips remain distinct from the real-stack evidence and CI.
- The first free fixed-SHA preflight exposed flattened seed metadata: decisions
  and summaries were all inserted as facts, unlike the tracked source corpus.
  Corpus v3 preserves original kinds. Its run at `fab19fe` passed all three
  tasks over 82 seeded records with required seeds/anchors retained and zero
  foreign leakage. Raw/pack word estimates are not client-token measurements.
  The 19 harness cases and typecheck passed after this correction.
- After explicit user approval, local Brave testing exercised the real admin
  shell and HTTP routes with an in-memory fixture registry. Auth failure,
  update/tag success and no-op, sanitized server errors, loading/empty states,
  keyboard selection, selection retention, focus restoration, and archive
  cancellation passed. The cancellation made no archive request. At 390px,
  document width did not exceed the viewport; desktop capture was retained.
- Browser control then timed out repeatedly before archive approval and
  pending-cleanup could be verified. The temporary viewport was reset and the
  owned fixture server stopped with exit 0; port 58622 is no longer listening.
  UI changes remain unmerged. No paid model run, deployment, or token-saving result.

## 2026-08-31

- Reproduced the default Qdrant write blocker: Qdrant 1.13.2 rejects arbitrary
  string point IDs.
- Added one deterministic, injective UUIDv8-shaped mapping in the shared vector
  point builder and removed the unarchive-only ID override.
- Verified canonical write, retry, rollback, delete, reindex, and recovery
  expectations; created local checkpoint `e8f9136` without pushing.
- Reconstructed `goal.md`, `GATES.md`, `CONTEXT.md`, and `DESIGN.md` around
  measurable Codex/Claude relevance and context-token value.
- Added the paired Codex navigation guide and updated documentation indexes.
- Recorded current RED gates instead of promoting partial results: user-scope
  retrieval, context/token value, dependency audit, and admin UI truth/a11y.
- Added a destructive-safety-guarded default-stack eval and disposable local
  runner. The first Qdrant + transformers run produced recall@5 0.90,
  MRR@5 0.5625, user recall 0, leakage 0, and warmed p50/p95 9.48/10.89 ms;
  q08/q09 were the only misses and the context-pack flow passed.
- Confirmed the miss is contract drift: public API docs promise project-first
  ordering only for score ties, while the ranker adds an absolute +1000 boost.
- Replaced the absolute scope boost with the documented score-tie ordering. The
  second run recovered q08 but left q09 at rank 6 because unrelated
  decision/decision metadata had a 90-point advantage over fact/document.
- Kept metadata, recency, and generic-note weights intact and raised only
  vector/lexical maximum bonuses from 50 to 100. Added focused score and
  five-result cutoff coverage; stronger user-scope metadata can now outrank
  weaker project-scope metadata because project preference is tie-only.
- The dependency-aligned final Qdrant + transformers run produced recall@5
  1.00, MRR@5 0.7267, user recall 1.00, leakage 0, no misses, and warmed
  p50/p95/max 8.32/11.48/15.78 ms across 60 samples. Context-pack flow passed
  and the runner removed its containers, network, and volumes.
- Refreshed supported dependency versions in the lockfile. Raw audit moved from
  12 vulnerability nodes (including critical `tar`) to the two-node
  `sharp`/Transformers representation of GHSA-f88m-g3jw-g9cj.
- Prevented Qdrant client drift by changing `^1.13.0` to `~1.14.1`; the bundled
  server stays at 1.13.2 to avoid unsafe multi-minor storage migration. The
  installed client 1.14.1 and Undici 6.28.0 passed typecheck, focused adapter
  tests, and the real default-stack gate without a compatibility warning.
- Added a fail-closed dependency audit policy and tests. It permits only the
  exact unresolved `sharp` advisory on the unexposed image path and rejects new
  moderate-or-higher findings, advisory drift, or an available upstream fix.
- Made admin save/tag/archive outcomes reflect `updated`, `archived`, and
  `qdrantPointsPending` instead of unconditional success. Native confirmation,
  preserved selection, focus restoration, live count/status regions, response
  validation, and narrow-screen error wrapping stay in the existing static
  shell without a new browser dependency.
- A read-only final review found no blocking retrieval/dependency issue. It did
  identify local `.env` credential drift in the default-stack runner and an
  overbroad metadata-ordering claim; the runner now pins its disposable
  credentials before Compose startup and the decision text states the actual
  tie-only scope behavior.

Verification so far:
- Focused UUID batch: 6 files, 449 tests passed.
- `npm run typecheck` passed.
- `npm run build` passed.
- Full suite: 83 files passed, one skipped; 2,580 tests passed, 34 skipped.
- Documentation drift: 1 file, 48 tests passed.
- Default-stack eval before the ranking fix: 1 expected failed quality gate,
  1 context-pack test passed; all owned compose resources were removed.
- Focused retrieval closeout: 3 files passed; 67 tests passed and 2 eval tests
  skipped outside `RUN_EVAL=1`. Real default-stack eval: 4 tests passed.
- Dependency focused checks: 9 package/runtime files, 364 tests passed; Qdrant
  compatibility checks, 155 tests and typecheck passed; audit/docs/CI policy,
  114 tests and `npm run audit:dependencies` passed.
- Dependency closeout: 85 files passed; 2,591 tests passed and 35 skipped;
  typecheck, build, the fail-closed audit policy, diff hygiene, and package
  dry-run passed. The package dry-run excludes the contributor-only dependency
  audit implementation from the runtime tarball.
- Admin UI RED: 3 focused assertions failed on the unconditional status,
  confirmation/focus, and live/wrapping gaps. GREEN: 2 focused files and 71
  tests passed with typecheck; direct headless Chrome/CDP checks passed for two
  records, both no-op paths, confirmation cancel, two pending vector points,
  post-archive focus, live counts, and a 320 px viewport. A reviewer then found
  the include-archived edge where the retained Archive button is disabled;
  after the focused fix, a second real Chrome run kept two records, disabled
  the archived controls, and restored focus to memory list item `#1`.
- The first current-branch full-suite closeout hit only 5-second timeouts in
  `tests/scripts/backup-verify.test.ts`; 85 files/2,588 tests had otherwise
  passed and 35 were skipped. A 15-second diagnostic run proved all 60 backup
  tests and assertions pass while unrelated user-owned CPU-heavy jobs were
  active. The shell-heavy file now sets and resets a file-local 15-second test
  timeout; its normal focused command subsequently passed all 60 tests. A new
  full closeout remains required before merge.
- `git diff --check` passed.
- Raw `npm audit` remains nonzero by design: one reviewed `sharp` advisory is
  represented by the `sharp` and `@huggingface/transformers` nodes; no other
  moderate-or-higher finding remains.

## 2026-07-05

- 11:49 KST - Split compact tool handler:
  - Moved the `compact_memory` service tool adapter into
    `src/compact/tool-handlers.ts` alongside `unarchive_memory`.
  - Kept public tool name, JSON HTTP route `/v1/memory/compact`, MCP exposure,
    shared schema, validation errors, registry key, legacy override behavior,
    and result fields unchanged by composing the compact adapter from
    `createToolHandlers`.
  - Reused legacy repository/canonical repository access through
    `src/mcp/tool-repository-access.ts`.
  - Updated architecture docs, API docs, `CONTRACTS.md`, `PLAN.md`,
    `BACKLOG.md`, and `DECISIONS.md` for the compact adapter boundary.

Verification:
- `npm test -- tests/mcp/server.test.ts -t "compact_memory|compacts memory|compaction limits|compaction thresholds|semantic dedup|apply path|user memory|registers all service and context tools|advertises output schemas" --reporter=dot`
  (`1` file passed; `15` tests passed, `120` skipped)
- `npm test -- tests/compact/compact-memory.test.ts tests/compact/apply-compaction.test.ts --reporter=dot`
  (`2` files passed; `77` tests passed)
- `npm test -- tests/app/server.test.ts -t "compact_memory|/v1/memory/compact|CompactionRateLimitError|routes /v1/memory/reindex and /v1/memory/compact" --reporter=dot`
  (`1` file passed; `6` tests passed, `62` skipped)
- `npm test -- tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`1` file passed; `48` tests passed)
- `npm test -- tests/scripts/source-conventions.test.ts --reporter=dot`
  (`1` file passed; `6` tests passed)
- `npm test -- tests/mcp/tool-registry.test.ts tests/app/memory-routes-boundary.test.ts --reporter=dot`
  (`2` files passed; `35` tests passed)
- `npm test -- tests/app/mcp-http.test.ts -t "serves MCP tools over Streamable HTTP|compact_memory" --reporter=dot`
  (`1` file passed; `1` test passed, `20` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=high`
  (`0` vulnerabilities)
- `git diff --check`

- 11:42 KST - Split canonical reindex tool handler:
  - Added `src/store/tool-handlers.ts` for the `reindex_memory` service tool
    adapter.
  - Kept public tool name, JSON HTTP route `/v1/memory/reindex`, MCP exposure,
    shared schema, validation errors, registry key, and result fields unchanged
    by composing the new adapter from `createToolHandlers`.
  - Updated architecture docs, API docs, `CONTRACTS.md`, `PLAN.md`,
    `BACKLOG.md`, and `DECISIONS.md` for the store reindex adapter boundary.

Verification:
- `npm test -- tests/mcp/server.test.ts -t "reindex_memory|registers all service and context tools" --reporter=dot`
  (`1` file passed; `3` tests passed, `132` skipped)
- `npm test -- tests/store/canonical-indexing.test.ts -t "reindexCanonicalMemory" --reporter=dot`
  (`1` file passed; `2` tests passed, `82` skipped)
- `npm test -- tests/mcp/tool-registry.test.ts --reporter=dot`
  (`1` file passed; `19` tests passed)
- `npm test -- tests/app/memory-routes-boundary.test.ts tests/app/server.test.ts --reporter=dot`
  (`2` files passed; `84` tests passed)
- `npm test -- tests/app/mcp-http.test.ts -t "serves MCP tools over Streamable HTTP|reindex_memory" --reporter=dot`
  (`1` file passed; `1` test passed, `20` skipped)
- `npm test -- tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`1` file passed; `48` tests passed)
- `npm test -- tests/scripts/source-conventions.test.ts --reporter=dot`
  (`1` file passed; `6` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=high`
  (`0` vulnerabilities)
- `git diff --check`

- 11:36 KST - Split unarchive recovery tool handler:
  - Added `src/compact/tool-handlers.ts` for the `unarchive_memory` service
    tool adapter.
  - Kept public tool name, JSON HTTP route `/v1/memory/unarchive`, MCP
    exposure, shared schema, validation errors, registry key, and result fields
    unchanged by composing the new adapter from `createToolHandlers`.
  - Updated architecture docs, API docs, `CONTRACTS.md`, `PLAN.md`,
    `BACKLOG.md`, and `DECISIONS.md` for the compact recovery adapter boundary.

Verification:
- `npm test -- tests/mcp/server.test.ts -t "unarchive_memory|rejects invalid archive ids|registers all service and context tools" --reporter=dot`
  (`1` file passed; `3` tests passed, `132` skipped)
- `npm test -- tests/compact/unarchive-compaction.test.ts --reporter=dot`
  (`1` file passed; `32` tests passed)
- `npm test -- tests/mcp/tool-registry.test.ts --reporter=dot`
  (`1` file passed; `19` tests passed)
- `npm test -- tests/app/memory-routes-boundary.test.ts tests/app/server.test.ts --reporter=dot`
  (`2` files passed; `84` tests passed)
- `npm test -- tests/app/mcp-http.test.ts -t "serves MCP tools over Streamable HTTP|unarchive_memory|compact_memory" --reporter=dot`
  (`1` file passed; `1` test passed, `20` skipped)
- `npm test -- tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`1` file passed; `48` tests passed)
- `npm test -- tests/scripts/source-conventions.test.ts --reporter=dot`
  (`1` file passed; `6` tests passed)
- `npm run typecheck`
- `npm run build`
- `git diff --check`

- 11:29 KST - Split audit-log read tool handler:
  - Added `src/audit/tool-handlers.ts` for the `list_audit_log` service tool
    adapter.
  - Kept public tool name, JSON HTTP route `/v1/audit/list`, MCP exposure,
    shared schema, registry key, and result fields unchanged by composing the
    new adapter from `createToolHandlers`.
  - Updated architecture docs, API docs, `CONTRACTS.md`, `PLAN.md`,
    `BACKLOG.md`, and `DECISIONS.md` for the audit adapter boundary.

Verification:
- `npm test -- tests/audit/audit-write.test.ts tests/mcp/tool-registry.test.ts --reporter=dot`
  (`2` files passed; `27` tests passed)
- `npm test -- tests/mcp/server.test.ts -t "registers all service and context tools|list_audit_log|structuredContent while retaining" --reporter=dot`
  (`1` file passed; `2` tests passed, `133` skipped)
- `npm test -- tests/app/mcp-http.test.ts -t "serves MCP tools over Streamable HTTP|list_memory|inspect_memory_graph|update_memory" --reporter=dot`
  (`1` file passed; `1` test passed, `20` skipped)
- `npm test -- tests/app/memory-routes-boundary.test.ts --reporter=dot`
  (`1` file passed; `16` tests passed)
- `npm test -- tests/app/server.test.ts --reporter=dot`
  (`1` file passed; `68` tests passed)
- `npm test -- tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`1` file passed; `48` tests passed)
- `npm test -- tests/scripts/source-conventions.test.ts --reporter=dot`
  (`1` file passed; `6` tests passed)
- `npm run typecheck`
- `git diff --check`

- 11:21 KST - Split goal-run tool handlers:
  - Added `src/goal-run/tool-handlers.ts` for the goal-run service tool
    adapters: run start/iteration/get/list/complete/abandon/context/repeat.
  - Kept public tool names, JSON HTTP routes, MCP exposure, shared schemas, and
    registry keys unchanged by composing the new adapter from
    `createToolHandlers`.
  - Moved shared handler validation helpers into `src/mcp/tool-utils.ts`.
  - Updated architecture docs, API docs, `CONTRACTS.md`, `PLAN.md`,
    `BACKLOG.md`, and `DECISIONS.md` for the goal-run module boundary.

Verification:
- `npm test -- tests/goal-run/goal-run-handlers.test.ts tests/mcp/tool-registry.test.ts tests/app/memory-routes-boundary.test.ts --reporter=dot`
  (`3` files passed; `60` tests passed)
- `npm test -- tests/mcp/server.test.ts -t "registers all service and context tools|dispatches reindex_memory|dispatches unarchive_memory|advertises output schemas|structuredContent while retaining" --reporter=dot`
  (`1` file passed; `5` tests passed, `130` skipped)
- `npm test -- tests/app/mcp-http.test.ts -t "serves MCP tools over Streamable HTTP" --reporter=dot`
  (`1` file passed; `1` test passed, `20` skipped)
- `npm test -- tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`1` file passed; `48` tests passed)
- `npm test -- tests/scripts/source-conventions.test.ts --reporter=dot`
  (`1` file passed; `6` tests passed)
- `npm run typecheck`
- `git diff --check`

- 11:09 KST - Split MCP service tool registration:
  - Added `src/mcp/service-tools.ts` for MCP service tool registration from
    `SERVICE_TOOL_DESCRIPTORS` and `toToolResult` conversion.
  - Kept `src/mcp/server.ts` focused on MCP server assembly, registry creation,
    context tools, resources, prompts, and stdio startup.
  - Updated architecture docs, `CONTRACTS.md`, `PLAN.md`, `BACKLOG.md`, and
    `DECISIONS.md` for the new service registration module.

Verification:
- `npm test -- tests/mcp/server.test.ts -t "registers all service and context tools|dispatches reindex_memory|dispatches unarchive_memory|advertises output schemas|structuredContent while retaining" --reporter=dot`
  (`1` file passed; `5` tests passed, `130` skipped)
- `npm test -- tests/app/mcp-http.test.ts -t "serves MCP tools over Streamable HTTP" --reporter=dot`
  (`1` file passed; `1` test passed, `20` skipped)
- `npm test -- tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`1` file passed; `48` tests passed)
- `npm test -- tests/scripts/source-conventions.test.ts --reporter=dot`
  (`1` file passed; `6` tests passed)
- `npm run typecheck`
- `git diff --check`

- 11:05 KST - Split MCP-only context tool registration:
  - Added `src/mcp/context-tools.ts` for `list_workspace_roots`,
    `add_memory_interactive`, and `classify_memory_candidate` registration plus
    their capability, elicitation, and sampling helpers.
  - Kept `src/mcp/server.ts` focused on MCP server assembly, service tool
    registration, resources, prompts, and stdio startup.
  - Updated architecture docs, `CONTRACTS.md`, `PLAN.md`, `BACKLOG.md`, and
    `DECISIONS.md` for the new context tool module.

Verification:
- `npm test -- tests/mcp/server.test.ts -t "workspace roots|add_memory_interactive|classifies candidate memory|classification content|sampling is not advertised|context tool" --reporter=dot`
  (`1` file passed; `9` tests passed, `126` skipped)
- `npm test -- tests/app/mcp-http.test.ts -t "OAuth scopes for MCP-only context tools" --reporter=dot`
  (`1` file passed; `1` test passed, `20` skipped)
- `npm test -- tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`1` file passed; `48` tests passed)
- `npm test -- tests/scripts/source-conventions.test.ts --reporter=dot`
  (`1` file passed; `6` tests passed)
- `npm run typecheck`
- `git diff --check`

- 10:59 KST - Split MCP prompt registration:
  - Added `src/mcp/prompts.ts` for Akasha MCP prompt templates and prompt
    argument schemas.
  - Kept `src/mcp/server.ts` focused on MCP server assembly, service tool
    registration, context tools, resources, and stdio startup.
  - Updated architecture docs, `CONTRACTS.md`, `PLAN.md`, `BACKLOG.md`, and
    `DECISIONS.md` for the new prompt module.

Verification:
- `npm test -- tests/mcp/server.test.ts -t "lists and returns Akasha prompts|session prompt|prompt identifiers|store-memory prompt" --reporter=dot`
  (`1` file passed; `6` tests passed, `129` skipped)
- `npm test -- tests/app/mcp-http.test.ts -t "resources and prompts" --reporter=dot`
  (`1` file passed; `1` test passed, `20` skipped)
- `npm test -- tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`1` file passed; `48` tests passed)
- `npm test -- tests/scripts/source-conventions.test.ts --reporter=dot`
  (`1` file passed; `6` tests passed)
- `npm run typecheck`
- `git diff --check`

- 10:54 KST - Split MCP resource registration:
  - Added `src/mcp/resources.ts` for Akasha MCP resource templates and resource
    URI path/query validation.
  - Kept `src/mcp/server.ts` focused on MCP server assembly, service tool
    registration, context tools, prompts, and stdio startup.
  - Updated architecture docs, `CONTRACTS.md`, `PLAN.md`, `BACKLOG.md`, and
    `DECISIONS.md` for the new resource module.

Verification:
- `npm test -- tests/mcp/server.test.ts -t "resources and prompts" --reporter=dot`
  (`1` file passed; `30` tests passed, `105` skipped)
- `npm test -- tests/app/mcp-http.test.ts -t "resources and prompts" --reporter=dot`
  (`1` file passed; `1` test passed, `20` skipped)
- `npm test -- tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`1` file passed; `48` tests passed)
- `npm test -- tests/scripts/source-conventions.test.ts --reporter=dot`
  (`1` file passed; `6` tests passed)
- `npm run typecheck`
- `git diff --check`

- 10:48 KST - Split tool registry audit instrumentation:
  - Added `src/mcp/tool-registry-instrumentation.ts` for tool-boundary
    audit/log wrapping.
  - Kept `src/mcp/tool-registry.ts` focused on canonical service resolution,
    handler creation, and registry assembly.
  - Updated architecture docs, `CONTRACTS.md`, `PLAN.md`, `BACKLOG.md`,
    `DECISIONS.md`, and drift guards for the new instrumentation module.

Verification:
- `npm test -- tests/audit/audit-write.test.ts tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`2` files passed; `56` tests passed)
- `npm test -- tests/scripts/package-manifest.test.ts --reporter=dot`
  (`1` file passed; `39` tests passed)
- `npm test -- tests/mcp/server.test.ts -t "forwards auditLog" --reporter=dot`
  (`1` file passed; `1` test passed, `134` skipped)
- `npm run typecheck`
- `git diff --check`

- 10:42 KST - Split CLI argument parsing:
  - Added `src/cli-args.ts` for CLI flag parsing and parser-only validation.
  - Kept `src/cli.ts` as the public re-export, command dispatcher, process
    entrypoint, and content-file reader.
  - Updated `CONTRACTS.md`, `PLAN.md`, `BACKLOG.md`, `DECISIONS.md`, and the
    contract-baseline drift guard for the new CLI parser module.

Verification:
- `npm test -- tests/cli.test.ts tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`2` files passed; `78` tests passed)
- `npm test -- tests/scripts/package-manifest.test.ts --reporter=dot`
  (`1` file passed; `39` tests passed)
- `npm run typecheck`
- `git diff --check`

- 10:48 KST - Split MCP Streamable HTTP auth guarding:
  - Added `src/app/middleware/mcp-http-auth.ts` for authenticated registry
    guarding and MCP-only tool authorization.
  - Kept `src/app/mcp-http.ts` focused on request checks, auth lookup, rate
    limiting, server/transport lifecycle, and JSON-RPC error responses.
  - Updated `CONTRACTS.md`, `PLAN.md`, `BACKLOG.md`, `DECISIONS.md`, and the
    contract-baseline drift guard for the new middleware file.

Verification:
- `npm test -- tests/app/mcp-http.test.ts -t "bound token org|OAuth tokens for MCP tool calls|OAuth scopes for MCP-only context tools" --reporter=dot`
  (`1` file passed; `5` tests passed, `16` skipped)
- `npm test -- tests/app/mcp-http.test.ts tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`2` files passed; `69` tests passed)
- `npm run typecheck`
- `git diff --check`

- 10:46 KST - Ran the full test suite after the current boundary commits:
  - Verified the contract baseline, JSON HTTP route handler split, MCP tool
    result split, and existing repository behavior together.

Verification:
- `npm test -- --reporter=dot`
  (`83` files passed, `1` skipped; `2579` tests passed, `34` skipped)

- 10:42 KST - Split JSON HTTP tool handler execution:
  - Added `src/app/routes/tool-handler.ts` for JSON HTTP body parsing,
    organization resolution, OAuth scope checks, validation, registry dispatch,
    and envelope response handling.
  - Added `src/app/routes/types.ts` and preserved `Route`/`RouteContext`
    exports through `src/app/routes/memory.ts`.
  - Updated `CONTRACTS.md`, `PLAN.md`, `BACKLOG.md`, `DECISIONS.md`, and the
    contract-baseline drift guard for the new route modules.

Verification:
- `npm test -- tests/app/memory-routes-boundary.test.ts tests/app/server.test.ts tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`3` files passed; `132` tests passed)
- `npm run typecheck`
- `git diff --check`

- 10:38 KST - Added JSON HTTP route handler contract coverage:
  - `tests/app/memory-routes-boundary.test.ts` now invokes a generated route
    handler directly.
  - The new tests lock successful registry dispatch through the JSON HTTP
    envelope, header `organizationId` precedence over body input, and schema
    validation failure before registry calls.
  - Updated `CONTRACTS.md`, `PLAN.md`, and `BACKLOG.md` with the new contract
    evidence.

Verification:
- `npm test -- tests/app/memory-routes-boundary.test.ts --reporter=dot`
  (`1` file passed; `16` tests passed)
- `npm test -- tests/scripts/public-docs-drift.test.ts -t "contract baseline" --reporter=dot`
  (`1` file passed; `1` test passed, `47` skipped)
- `npm run typecheck`
- `git diff --check`

- 10:33 KST - Split MCP tool result formatting:
  - Added `src/mcp/tool-result.ts` for the shared `structuredContent` plus JSON
    text `content` response shape.
  - Updated `src/mcp/server.ts` to import the formatter instead of owning it
    inside server registration.
  - Registered the new file in `CONTRACTS.md`, `PLAN.md`, and the
    contract-baseline drift guard.

Verification:
- `npm test -- tests/mcp/server.test.ts -t "structuredContent while retaining JSON text content" --reporter=dot`
  (`1` file passed; `1` test passed, `134` skipped)
- `npm test -- tests/scripts/public-docs-drift.test.ts -t "contract baseline" --reporter=dot`
  (`1` file passed; `1` test passed, `47` skipped)
- `npm test -- tests/mcp/server.test.ts tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`2` files passed; `183` tests passed)
- `npm run typecheck`
- `git diff --check`

- 10:31 KST - Documented the existing MCP response contract guard:
  - Confirmed `tests/mcp/server.test.ts` already checks `structuredContent`
    while retaining JSON text `content`.
  - Updated `CONTRACTS.md` and the contract-baseline drift guard so future
    transport refactors treat that test as contract evidence.

Verification:
- `npm test -- tests/mcp/server.test.ts -t "structuredContent while retaining JSON text content" --reporter=dot`
  (`1` file passed; `1` test passed, `134` skipped)
- `npm test -- tests/scripts/public-docs-drift.test.ts -t "contract baseline" --reporter=dot`
  (`1` file passed; `1` test passed, `47` skipped)
- `npm test -- tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`1` file passed; `48` tests passed)
- `npm run typecheck`
- `git diff --check`

- 10:27 KST - Added JSON HTTP envelope contract guard:
  - `tests/app/envelope.test.ts` locks success/failure envelope shape,
    content-type, status pass-through, and field order for `sendOk`/`sendError`.
  - `CONTRACTS.md` now lists the envelope guard explicitly.

Verification:
- `npm test -- tests/app/envelope.test.ts --reporter=dot`
  (`1` file passed; `2` tests passed)
- `npm test -- tests/scripts/public-docs-drift.test.ts -t "contract baseline" --reporter=dot`
  (`1` file passed; `1` test passed, `47` skipped)
- `npm test -- tests/app/envelope.test.ts tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`2` files passed; `50` tests passed)
- `npm run typecheck`
- `git diff --check`

- 10:20 KST - Expanded the architecture transition handoff:
  - `PLAN.md` now records current structure, completed branch commits, known
    issues, target architecture, staged transition plan, contract gate, risks,
    rollback, and resume instructions.
  - This addresses the goal requirement that future agents can continue from
    repository documents and git history rather than chat context.

Verification:
- `npm test -- tests/scripts/public-docs-drift.test.ts -t "architecture transition plan" --reporter=dot`
  (`1` file passed; `1` test passed, `47` skipped)
- `npm test -- tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`1` file passed; `48` tests passed)
- `npm run typecheck`
- `git diff --check`

- 10:13 KST - Extracted shared HTTP JSON body parsing boundary:
  - Added `src/app/middleware/json-body.ts` for bounded JSON body parsing.
  - Reused it from JSON HTTP routes and MCP Streamable HTTP.
  - Preserved existing oversized-body behavior: JSON HTTP returns 400, MCP HTTP
    returns 413.
  - Added a JSON HTTP characterization test for the 1 MB cap.
  - Added the new middleware file to `CONTRACTS.md` and the contract-baseline
    drift guard.

Verification:
- `npm test -- tests/app/server.test.ts -t "JSON HTTP body exceeds" --reporter=dot`
  (`1` file passed; `1` test passed, `67` skipped)
- `npm test -- tests/app/server.test.ts -t "invalid JSON body|JSON HTTP body exceeds|JSON but not an object" --reporter=dot`
  (`1` file passed; `3` tests passed, `65` skipped)
- `npm test -- tests/app/mcp-http.test.ts -t "oversized POST bodies|POST JSON is invalid|POST body exceeds" --reporter=dot`
  (`1` file passed; `3` tests passed, `18` skipped)
- `npm test -- tests/app/memory-routes-boundary.test.ts --reporter=dot`
  (`1` file passed; `14` tests passed)
- `npm test -- tests/app/server.test.ts tests/app/mcp-http.test.ts tests/app/memory-routes-boundary.test.ts tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`4` files passed; `150` tests passed)
- `npm run typecheck`
- `git diff --check`

- 10:07 KST - Started first internal-boundary loop behind JSON HTTP routes:
  - Moved `organizationId` resolution from `src/app/routes/memory.ts` into
    `src/app/middleware/organization-resolution.ts`.
  - Preserved the existing `src/app/routes/memory.ts` re-export for
    `resolveOrganizationId` so tests and external imports keep the same path.
  - Added the new middleware file to `CONTRACTS.md` and the contract-baseline
    drift guard.

Verification:
- `npm test -- tests/mcp/resolve-org.test.ts tests/app/memory-routes-boundary.test.ts --reporter=dot`
  (`2` files passed; `31` tests passed)
- `npm test -- tests/scripts/public-docs-drift.test.ts -t "contract baseline" --reporter=dot`
  (`1` file passed; `1` test passed, `46` skipped)
- `npm test -- tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`1` file passed; `47` tests passed)
- `npm run typecheck`
- `git diff --check`

- 10:00 KST - Started contract-baseline loop for clean architecture / DDD goal:
  - New goal prioritizes preserving request/response contracts before internal
    refactors.
  - Switched from pending local dependency branch back to `main` and created
    `docs/contract-architecture-baseline`.
  - Inventoried public contract sources: `src/mcp/tool-schemas.ts`,
    `src/mcp/types.ts`, `src/app/routes/memory.ts`, `src/app/server.ts`,
    `package.json`, CLI files, docs, migrations, and existing drift tests.
  - Added `CONTRACTS.md` as the first architecture baseline artifact.
  - Added a public-docs drift guard to keep `CONTRACTS.md` aligned with
    `TOOL_ROUTES` and key public endpoints.

Verification:
- `npm test -- tests/scripts/public-docs-drift.test.ts -t "contract baseline" --reporter=dot`
  (`1` file passed; `1` test passed, `46` skipped)
- `npm test -- tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`1` file passed; `47` tests passed)
- `npm run typecheck`
- `git diff --check`

- 01:40 KST - Selected P2 README comparison positioning item:
  - External check: `DeusData/codebase-memory-mcp` is a code-intelligence MCP
    focused on repository graph/index/search workflows, so it is complementary
    to Akasha rather than a direct memory-store replacement.
  - README and README.ko now describe that distinction without relying on
    time-sensitive star, issue, or benchmark counts.
  - CHANGELOG and public-docs drift coverage were updated with the same
    positioning contract.
  - The new drift assertion collapses Markdown whitespace so wrapping changes
    do not create brittle failures.

RED:
- `npm test -- tests/scripts/public-docs-drift.test.ts -t "code-intelligence MCP" --reporter=dot`
  failed because README did not yet mention `codebase-memory-mcp`.

Verification:
- Focused GREEN: `npm test -- tests/scripts/public-docs-drift.test.ts -t "code-intelligence MCP" --reporter=dot`
  (`1` file passed; `1` test passed, `45` skipped)
- Docs drift: `npm test -- tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`1` file passed; `46` tests passed)
- Source conventions: `npm test -- tests/scripts/source-conventions.test.ts --reporter=dot`
  (`1` file passed; `6` tests passed)
- `git diff --check`

- 01:31 KST - Reset post-merge planning state:
  - Resumed the continuous-improvement goal after user approval; the goal tool
    still reports `blocked`, but no separate resume state is available.
  - Confirmed `main` tracks `origin/main` at `db93314`
    (`Hardening production boundaries and package surface`).
  - Replaced stale current-loop text from the pre-merge branch with a clean-main
    backlog discovery plan.
  - Collapsed the oversized branch-local `BACKLOG.md` done list into a concise
    PR #23 merge reference so open P0/P1/P2 state is readable again.

Verification:
- `git diff --check`
- `npm test -- tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`1` file passed; `45` tests passed)
- No root planning-doc-specific automated test is currently available.

- 01:03 KST - Fixed PR #23 pgvector CI batch fixture:
  - GitHub Actions `pgvector integration tests` failed on the HIGH 2 batch
    test because the 8500-row fixture generated `memory_record_id: 0`.
  - The fixture now uses positive record IDs (`i + 1`), matching the
    adapter's positive safe integer boundary contract.

Verification:
- RED from CI: `pgvector integration tests` failed on
  `HIGH 2 batch: upserts 8500 rows (>8191 per-batch limit) without bind-param overflow`
  with `point.payload.memory_record_id must be a positive safe integer`.
- GREEN focused: `PGVECTOR_TEST_URL=postgres://memory:memory@127.0.0.1:5433/memory_pgv npx vitest run tests/vector/pgvector-index.integration.test.ts -t "HIGH 2 batch" --reporter=dot`
  (`1` file passed; `1` test passed, `114` skipped).
- GREEN pgvector suite: `PGVECTOR_TEST_URL=postgres://memory:memory@127.0.0.1:5433/memory_pgv npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`1` file passed; `115` tests passed).
- Temporary Docker container `akasha-pgvector-ci` was removed after testing.

## 2026-07-04

- 01:21 KST - Hardened lexical source identifier fallback:
  - Lexical scoring now uses the first nonblank source identifier from
    `sourceRef` and `externalId`.
  - Blank `sourceRef` no longer hides a useful `externalId`.

RED/GREEN:
- RED: `npm test -- tests/search/lexical-score.test.ts -t "externalId when sourceRef is blank" --reporter=dot`
  failed `1` test because blank `sourceRef` prevented an `externalId` match.
- GREEN: same command passed (`1` file passed; `1` test passed, `10`
  skipped).

Verification:
- `npm test -- tests/search/lexical-score.test.ts tests/search/retrieve-memory.test.ts tests/search/rank-results.test.ts --reporter=dot`
  (`3` files passed; `73` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2571`
  tests passed, `34` skipped)

- 01:18 KST - Hardened context pack nonblank source label rendering:
  - Context pack rendering now picks the first nonblank label from
    `source.title`, `sourceRef`, and `externalId`.
  - Source labels are trimmed before markdown rendering.

RED/GREEN:
- RED: `npm test -- tests/context-pack/build-context-pack.test.ts -t "first nonblank source label" --reporter=dot`
  failed `1` test because a blank source title rendered instead of falling
  back to `sourceRef`.
- GREEN: same command passed (`1` file passed; `1` test passed, `25`
  skipped).

Verification:
- `npm test -- tests/context-pack/build-context-pack.test.ts --reporter=dot`
  (`1` file passed; `26` tests passed)
- `npm test -- tests/context-pack/build-context-pack.test.ts tests/mcp/server.test.ts -t "context pack|Context Pack|build_context_pack|source label" --reporter=dot`
  (`2` files passed; `6` tests passed, `155` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2570`
  tests passed, `34` skipped)

- 01:15 KST - Hardened context pack source label fallback:
  - Context pack rendering now falls back from `source.title` to `sourceRef`,
    `externalId`, then `unknown source`.
  - `sourceRef` is now validated as an optional string before rendering.

RED/GREEN:
- RED: `npm test -- tests/context-pack/build-context-pack.test.ts -t "sourceRef|source.sourceRef" --reporter=dot`
  failed `1` test because a title-less source without `externalId` rendered
  `source: undefined`.
- GREEN: same command passed (`1` file passed; `1` test passed, `24`
  skipped).

Verification:
- `npm test -- tests/context-pack/build-context-pack.test.ts --reporter=dot`
  (`1` file passed; `25` tests passed)
- `npm test -- tests/context-pack/build-context-pack.test.ts tests/mcp/server.test.ts -t "context pack|Context Pack|build_context_pack|sourceRef" --reporter=dot`
  (`2` files passed; `6` tests passed, `154` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2569`
  tests passed, `34` skipped)

- 01:10 KST - Hardened `retrieveMemory` direct scope identifier normalization:
  - `retrieveMemory` now trims direct `projectKey` and `userScopeId` once after
    validation.
  - Vector filters and lexical repository scopes now receive normalized scope
    identifiers.
  - Scoped reviewer agent timed out after interrupt; no reviewer PASS is
    recorded for this loop.

RED/GREEN:
- RED: `npm test -- tests/search/retrieve-memory.test.ts -t "scope identifiers" --reporter=dot`
  failed `1` test because raw `projectKey` whitespace reached vector filters.
- GREEN: same command passed (`1` file passed; `1` test passed, `38`
  skipped).

Verification:
- `npm test -- tests/search/retrieve-memory.test.ts tests/search/rank-results.test.ts tests/search/lexical-score.test.ts --reporter=dot`
  (`3` files passed; `72` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2567`
  tests passed, `34` skipped)

## 2026-07-03

- 23:32 KST - Hardened Qdrant hit record ID validation:
  - Qdrant query mapping now rejects object payloads with malformed
    `memory_record_id` before returning `VectorHit[]`.
  - Non-object Qdrant payloads still map to `{}` for existing compatibility.
  - Scoped reviewer passed the diff.

RED/GREEN:
- RED: `npm test -- tests/vector/qdrant-index.test.ts -t "Qdrant hit memory_record_id" --reporter=dot`
  failed `3` tests because malformed returned `memory_record_id` values leaked
  into `VectorHit.payload`.
- GREEN: same command passed (`1` file passed; `3` tests passed, `104`
  skipped).

Verification:
- `npm test -- tests/vector/qdrant-index.test.ts --reporter=dot`
  (`1` file passed; `107` tests passed)
- `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `247` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2566`
  tests passed, `34` skipped)

- 23:27 KST - Hardened vector adapter provided storage text validation:
  - Qdrant and PGVector upserts now reject provided `payload.updated_at` and
    `payload.embedding_version` unless they are explicit `null` or nonblank
    strings.
  - Missing storage text keys remain allowed for direct adapter compatibility.
  - Scoped reviewer passed the diff.

RED/GREEN:
- RED: `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts -t "point storage metadata" --reporter=dot`
  failed `12` tests because malformed provided storage text metadata reached
  Qdrant upsert or pgvector client paths.
- GREEN: same command passed (`2` files passed; `12` tests passed, `207`
  skipped).

Verification:
- `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `244` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2563`
  tests passed, `34` skipped)

- 23:18 KST - Hardened vector adapter provided text metadata validation:
  - Qdrant and PGVector upserts now reject provided `payload.title` and
    `payload.summary` unless they are explicit `null` or nonblank strings.
  - Missing title/summary keys remain allowed for direct adapter compatibility.
  - Scoped reviewer initially caught provided `undefined`; follow-up tests and
    key-aware helpers now reject it before backend paths.
  - Scoped re-review passed the diff.

RED/GREEN:
- RED: `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts -t "point text metadata" --reporter=dot`
  failed `8` tests because malformed provided text metadata reached Qdrant
  upsert or pgvector client paths.
- RED follow-up: same command failed `4` tests because provided `undefined`
  was still treated as missing.
- GREEN: same command passed (`2` files passed; `12` tests passed, `195`
  skipped).

Verification:
- `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `232` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2551`
  tests passed, `34` skipped)

- 23:09 KST - Hardened vector adapter provided tags validation:
  - Qdrant and PGVector upserts now reject provided `payload.tags` unless it is
    an array of nonblank strings.
  - Missing or `null` tags remain allowed for direct adapter compatibility.
  - Scoped reviewer agent passed the diff.

RED/GREEN:
- RED: `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts -t "point tags" --reporter=dot`
  failed `6` tests because malformed provided tags reached Qdrant upsert or
  pgvector client paths.
- GREEN: same command passed (`2` files passed; `6` tests passed, `189`
  skipped).

Verification:
- `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `220` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2539`
  tests passed, `34` skipped)

- 23:03 KST - Hardened vector point builder required metadata trimming:
  - `buildVectorPoint` now trims direct `updatedAt` and `embeddingVersion`
    metadata before building vector payloads.
  - Existing non-empty validation remains unchanged.
  - Timestamp parsing remains in store row mapping instead of being duplicated
    in the vector builder.
  - Scoped reviewer agent passed the diff.

RED/GREEN:
- RED: `npm test -- tests/vector/point-builder.test.ts -t "scope payload" --reporter=dot`
  failed `1` test because raw `updatedAt` whitespace reached payloads.
- GREEN: same command passed (`1` file passed; `1` test passed, `36`
  skipped).

Verification:
- `npm test -- tests/vector/point-builder.test.ts --reporter=dot`
  (`1` file passed; `37` tests passed)
- `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `214` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2533`
  tests passed, `34` skipped)

- 22:59 KST - Hardened vector point builder nullable text metadata normalization:
  - `buildVectorPoint` now trims direct nullable `title` and `summary`
    metadata before building vector payloads.
  - Direct blank `title` and `summary` metadata now normalize to `null`.
  - Existing nullable text type validation, tag validation, scope validation,
    and memory metadata enum validation remain unchanged.
  - Scoped reviewer agent passed the diff.

RED/GREEN:
- RED: `npm test -- tests/vector/point-builder.test.ts -t "nullable payload|scope payload" --reporter=dot`
  failed `2` tests because raw `title`/`summary` whitespace reached payloads
  and blank nullable text stayed non-null.
- GREEN: same command passed (`1` file passed; `2` tests passed, `35`
  skipped).

Verification:
- `npm test -- tests/vector/point-builder.test.ts --reporter=dot`
  (`1` file passed; `37` tests passed)
- `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `214` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2533`
  tests passed, `34` skipped)

- 22:54 KST - Hardened vector point builder tag metadata normalization:
  - `buildVectorPoint` now trims direct tag entries before building vector
    payloads.
  - Direct builder calls now reject blank tag entries before Qdrant/pgvector
    backend writes.
  - Existing tag type validation, scope validation, and memory metadata enum
    validation remain unchanged.
  - Scoped reviewer agent passed the diff.

RED/GREEN:
- RED: `npm test -- tests/vector/point-builder.test.ts -t "tags|scope payload" --reporter=dot`
  failed `2` tests because raw tag whitespace reached payloads and blank tag
  entries passed the builder.
- GREEN: same command passed (`1` file passed; `2` tests passed, `34`
  skipped).

Verification:
- `npm test -- tests/vector/point-builder.test.ts --reporter=dot`
  (`1` file passed; `36` tests passed)
- `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `213` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2532`
  tests passed, `34` skipped)

- 22:49 KST - Hardened vector point builder scope type enum validation:
  - `buildVectorPoint` now rejects direct `scopeType` values outside `user`
    and `project` before building vector payloads.
  - Existing scope payload trimming, blank scope validation, and
    `kind`/`durability` enum validation remain unchanged.
  - Scoped reviewer agent passed the diff.

RED/GREEN:
- RED: `npm test -- tests/vector/point-builder.test.ts -t "scopeType" --reporter=dot`
  failed `1` test because invalid direct `scopeType` values passed the
  builder.
- GREEN: same command passed (`1` file passed; `3` tests passed, `33`
  skipped).

Verification:
- `npm test -- tests/vector/point-builder.test.ts --reporter=dot`
  (`1` file passed; `36` tests passed)
- `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `213` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2532`
  tests passed, `34` skipped)

- 22:43 KST - Hardened vector point builder metadata enum validation:
  - `buildVectorPoint` now trims direct `kind` and `durability` metadata
    before building vector payloads.
  - Direct builder calls now reject `kind` values outside `decision`,
    `summary`, and `fact`, and `durability` values outside `ephemeral`,
    `durable`, and `archived`.
  - Existing scope, project, and organization metadata validation remains
    unchanged.
  - Spec and code-quality reviewer agents both passed the scoped diff.

RED/GREEN:
- RED: `npm test -- tests/vector/point-builder.test.ts -t "metadata" --reporter=dot`
  failed `3` tests because raw `kind`/`durability` values reached payloads and
  invalid enum values passed the builder.
- GREEN: same command passed (`1` file passed; `12` tests passed, `23`
  skipped).

Verification:
- `npm test -- tests/vector/point-builder.test.ts --reporter=dot`
  (`1` file passed; `35` tests passed)
- `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `212` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2531`
  tests passed, `34` skipped)

- 22:33 KST - Hardened ingest sweeper job organization normalization:
  - The ingest sweeper now trims claimed job organization IDs before vector
    delete filters are built.
  - Existing claimed-job blank organization validation remains unchanged.
  - `tests/compact/ingest-sweeper.test.ts` covers normalized vector delete
    organization filters.

RED/GREEN:
- RED: `npm test -- tests/compact/ingest-sweeper.test.ts -t "trims claimed job organization" --reporter=dot`
  failed `1` test because raw claimed job organization IDs reached vector
  delete filters.
- GREEN: same command passed (`1` file passed; `1` test passed, `52`
  skipped).

Verification:
- `npm test -- tests/compact/ingest-sweeper.test.ts --reporter=dot`
  (`1` file passed; `53` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2529`
  tests passed, `34` skipped)

- 22:29 KST - Hardened ingest sweeper chunk enum validation:
  - The ingest sweeper now rejects malformed chunk `scopeType`, `kind`, and
    `durability` enum values before embedding or vector side effects.
  - Existing malformed chunk retry behavior remains unchanged.
  - `tests/compact/ingest-sweeper.test.ts` covers malformed chunk enums in the
    no-vector-side-effects path.

RED/GREEN:
- RED: `npm test -- tests/compact/ingest-sweeper.test.ts -t "malformed chunks" --reporter=dot`
  failed `3` tests because malformed chunk enum values were treated as
  successful sweeps.
- GREEN: same command passed (`1` file passed; `8` tests passed, `44`
  skipped).

Verification:
- `npm test -- tests/compact/ingest-sweeper.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`2` files passed; `85` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2528`
  tests passed, `34` skipped)

- 22:25 KST - Hardened vector upsert durability validation:
  - Qdrant and PGVector upserts now reject provided `payload.durability`
    values outside `ephemeral`, `durable`, and `archived` before backend
    writes.
  - Missing durability remains allowed for direct adapter compatibility.
  - `tests/vector/qdrant-index.test.ts` and
    `tests/vector/pgvector-index.integration.test.ts` cover malformed
    provided durability metadata.

RED/GREEN:
- RED: `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts -t "point durability" --reporter=dot`
  failed `4` tests because blank or invalid provided durability values reached
  Qdrant or pgvector client paths.
- GREEN: same command passed (`2` files passed; `4` tests passed, `185`
  skipped).

Verification:
- `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `210` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2525`
  tests passed, `34` skipped)

- 22:21 KST - Hardened vector upsert kind validation:
  - Qdrant and PGVector upserts now reject direct point `payload.kind` values
    outside `decision`, `summary`, and `fact` before backend writes.
  - Existing missing and blank kind validation remains unchanged.
  - `tests/vector/qdrant-index.test.ts` and
    `tests/vector/pgvector-index.integration.test.ts` cover invalid vector
    point kinds.

RED/GREEN:
- RED: `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts -t "point kind" --reporter=dot`
  failed `2` tests because invalid `kind` values reached Qdrant or pgvector
  client paths.
- GREEN: same command passed (`2` files passed; `6` tests passed, `179`
  skipped).

Verification:
- `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `206` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2521`
  tests passed, `34` skipped)

- 22:18 KST - Hardened vector upsert project identity validation:
  - Qdrant and PGVector upserts now reject project-scope points when
    `payload.project_key` is `null` and `payload.scope_id` is missing or blank.
  - Existing project points with a nonblank `project_key` can still use
    nullable `scope_id`.
  - `tests/vector/qdrant-index.test.ts` and
    `tests/vector/pgvector-index.integration.test.ts` cover project points
    without usable vector filter identity.

RED/GREEN:
- RED: `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts -t "project_key or scope_id" --reporter=dot`
  failed `4` tests because project points without usable `project_key` or
  `scope_id` values reached Qdrant or pgvector client paths.
- GREEN: same command passed (`2` files passed; `4` tests passed, `179`
  skipped).

Verification:
- `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `204` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2519`
  tests passed, `34` skipped)

- 22:14 KST - Hardened vector upsert user-scope ID validation:
  - Qdrant and PGVector upserts now reject user-scope points with missing or
    blank `payload.scope_id` before backend writes.
  - Existing project-scope nullable `scope_id` behavior remains unchanged
    because project points can be filtered by `project_key`.
  - `tests/vector/qdrant-index.test.ts` and
    `tests/vector/pgvector-index.integration.test.ts` cover malformed
    user-scope point IDs.

RED/GREEN:
- RED: `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts -t "scope_id" --reporter=dot`
  failed `4` tests because user points without usable `scope_id` values
  reached Qdrant or pgvector client paths.
- GREEN: same command passed (`2` files passed; `4` tests passed, `175`
  skipped).

Verification:
- `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `200` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2515`
  tests passed, `34` skipped)

- 22:11 KST - Hardened vector upsert scope-type validation:
  - Qdrant and PGVector upserts now reject direct point `payload.scope_type`
    values outside `user` and `project` before backend writes.
  - Existing missing and blank scope-type validation remains unchanged.
  - `tests/vector/qdrant-index.test.ts` and
    `tests/vector/pgvector-index.integration.test.ts` cover invalid upsert
    scope types.

RED/GREEN:
- RED: `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts -t "scope_type" --reporter=dot`
  failed `2` tests because invalid `scope_type` values reached Qdrant or
  pgvector client paths.
- GREEN: same command passed (`2` files passed; `6` tests passed, `169`
  skipped).

Verification:
- `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `196` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2511`
  tests passed, `34` skipped)

- 22:06 KST - Hardened vector point payload metadata normalization:
  - `buildVectorPoint` now trims direct organization, scope type, scope ID,
    and project-key metadata before building vector payloads.
  - Existing blank scoping metadata validation remains unchanged.
  - `tests/vector/point-builder.test.ts` covers normalized vector point
    payload metadata.

RED/GREEN:
- RED: `npm test -- tests/vector/point-builder.test.ts -t "trims direct scope payload metadata" --reporter=dot`
  failed `1` test because raw scoping metadata reached vector payloads.
- GREEN: same command passed (`1` file passed; `1` test passed, `32`
  skipped).

Verification:
- `npm test -- tests/vector/point-builder.test.ts --reporter=dot`
  (`1` file passed; `33` tests passed)
- `npm test -- tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `194` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2509`
  tests passed, `34` skipped)

- 22:00 KST - Hardened canonical chunk scope normalization:
  - `listChunks` now trims direct scope IDs before canonical chunk SQL params
    are built.
  - Existing scope type and blank scope ID validation remains unchanged.
  - `tests/store/canonical-indexing.test.ts` covers normalized list scope
    params.

RED/GREEN:
- RED: `npm test -- tests/store/canonical-indexing.test.ts -t "listChunks trims scope IDs" --reporter=dot`
  failed `1` test because raw list scope IDs reached SQL params.
- GREEN: same command passed (`1` file passed; `1` test passed, `83`
  skipped).

Verification:
- `npm test -- tests/store/canonical-indexing.test.ts --reporter=dot`
  (`1` file passed; `84` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2508`
  tests passed, `34` skipped)

- 21:57 KST - Hardened vector project-key filter normalization:
  - Qdrant and PGVector query filters now trim direct `projectKey` values
    before backend query filters are built.
  - Existing project-key type and blank validation remains unchanged.
  - `tests/vector/qdrant-index.test.ts` and
    `tests/vector/pgvector-index.integration.test.ts` cover normalized
    project-key query filters.

RED/GREEN:
- RED: `npm test -- tests/vector/qdrant-index.test.ts -t "trims projectKey" --reporter=dot`
  failed `1` test because raw Qdrant project keys reached filter clauses.
- RED: `npm test -- tests/vector/pgvector-index.integration.test.ts -t "query trims projectKey" --reporter=dot`
  failed `1` test because raw PGVector project keys reached SQL params.
- GREEN: both focused commands passed (`1` test passed in each file).

Verification:
- `npm test -- tests/vector/qdrant-index.test.ts --reporter=dot`
  (`1` file passed; `81` tests passed)
- `npm test -- tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`1` file passed; `80` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2507`
  tests passed, `34` skipped)

- 21:53 KST - Hardened vector scope filter normalization:
  - Qdrant and PGVector query filters now trim direct scope type and scope ID
    values before backend query filters are built.
  - Direct vector filter `scopeType` values outside `user` and `project` are
    rejected before backend queries.
  - `tests/vector/qdrant-index.test.ts` and
    `tests/vector/pgvector-index.integration.test.ts` cover normalized scope
    filters and fail-fast invalid scope types.

RED/GREEN:
- RED: `npm test -- tests/vector/qdrant-index.test.ts -t "trims scope filters|invalid scopeType" --reporter=dot`
  failed `2` tests because raw Qdrant scope fields reached filter clauses and
  invalid scope types returned an empty result.
- RED: `npm test -- tests/vector/pgvector-index.integration.test.ts -t "query trims scope filters|invalid scopeType" --reporter=dot`
  failed `2` tests because raw PGVector scope fields reached SQL params and
  invalid scope types reached the query path.
- GREEN: both focused commands passed (`2` tests passed in each file).

Verification:
- `npm test -- tests/vector/qdrant-index.test.ts --reporter=dot`
  (`1` file passed; `80` tests passed)
- `npm test -- tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`1` file passed; `79` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2505`
  tests passed, `34` skipped)

- 21:46 KST - Hardened scope lock normalization:
  - `acquireScopeLock` now trims direct organization, scope type, and scope ID
    fields before advisory-lock query params are built.
  - Direct lock `scopeType` values outside `user` and `project` are rejected
    before querying.
  - `tests/store/memory-archive-repository.test.ts` covers normalized lock
    keys and fail-fast invalid lock scope types.

RED/GREEN:
- RED: `npm test -- tests/store/memory-archive-repository.test.ts -t "trims direct lock scope fields|rejects invalid scopeType" --reporter=dot`
  failed `2` tests because raw lock fields reached the advisory-lock key and
  invalid scope types returned `true`.
- GREEN: same command passed (`1` file passed; `2` tests passed, `152`
  skipped).

Verification:
- `npm test -- tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `154` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2501`
  tests passed, `34` skipped)

- 21:44 KST - Hardened compaction run scope-type validation:
  - `createCompactionRun` now rejects direct `scopeType` values outside `user`
    and `project` before querying.
  - Existing compaction-run scope trimming behavior remains unchanged.
  - `tests/store/memory-archive-repository.test.ts` covers fail-fast invalid
    direct run scope types.

RED/GREEN:
- RED: `npm test -- tests/store/memory-archive-repository.test.ts -t "rejects malformed direct run inputs" --reporter=dot`
  failed `1` test because invalid direct run `scopeType` reached the insert
  path and returned a pending run.
- GREEN: same command passed (`1` file passed; `5` tests passed, `147`
  skipped).

Verification:
- `npm test -- tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `152` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2499`
  tests passed, `34` skipped)

- 21:41 KST - Hardened graph scope normalization:
  - `inspectMemoryGraph` now validates direct scope types and scope IDs before
    querying.
  - Direct graph scope IDs are trimmed before entity and relationship SQL
    params are built.
  - `tests/store/memory-repository.test.ts` covers fail-fast malformed graph
    scopes and trimmed graph query scope params.

RED/GREEN:
- RED: `npm test -- tests/store/memory-repository.test.ts -t "inspectMemoryGraph rejects malformed direct scopes|inspectMemoryGraph trims direct scope IDs" --reporter=dot`
  failed `3` tests because malformed graph scopes reached the query path and
  raw scope IDs reached SQL params.
- GREEN: same command passed (`1` file passed; `3` tests passed, `204`
  skipped).

Verification:
- `npm test -- tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `200` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2498`
  tests passed, `34` skipped)

- 21:37 KST - Hardened list scope normalization:
  - `listMemory` and `listMemoryForGovernance` now validate direct scope types
    and scope IDs before querying.
  - Direct list scope IDs are trimmed before SQL scope filter params are
    built.
  - `tests/store/memory-repository.test.ts` covers fail-fast malformed list
    scopes and trimmed query scope params.

RED/GREEN:
- RED: `npm test -- tests/store/memory-repository.test.ts -t "listMemory rejects malformed direct scopes|listMemory trims direct scope IDs|listMemoryForGovernance rejects malformed direct scopes|listMemoryForGovernance trims direct scope IDs" --reporter=dot`
  failed `6` tests because malformed list scopes reached the query path and
  raw scope IDs reached SQL params.
- GREEN: same command passed (`1` file passed; `6` tests passed, `198`
  skipped).

Verification:
- `npm test -- tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `197` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2495`
  tests passed, `34` skipped)

- 21:31 KST - Hardened search scope normalization:
  - `searchMemory` now validates direct scope types and scope IDs before
    querying.
  - Direct search scope IDs are trimmed before SQL scope filter params are
    built.
  - `tests/store/memory-repository.test.ts` covers fail-fast malformed search
    scopes and trimmed query scope params.

RED/GREEN:
- RED: `npm test -- tests/store/memory-repository.test.ts -t "malformed direct scopes|trims direct scope IDs" --reporter=dot`
  failed `3` tests because malformed search scopes reached the query path and
  raw scope IDs reached SQL params.
- GREEN: same command passed (`1` file passed; `3` tests passed, `195`
  skipped).

Verification:
- `npm test -- tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `191` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2489`
  tests passed, `34` skipped)

- 21:27 KST - Hardened add-memory scope normalization:
  - `addMemory` now validates direct memory/source scope types and scope IDs
    before opening a transaction.
  - Direct memory/source scope IDs are trimmed before source lookup, source
    insert, memory insert, and entity graph persistence.
  - `tests/store/memory-repository.test.ts` covers fail-fast malformed scope
    values and trimmed SQL scope params.

RED/GREEN:
- RED: `npm test -- tests/store/memory-repository.test.ts -t "malformed scope values|trims direct memory and source scope" --reporter=dot`
  failed `5` tests because malformed scope values reached the transaction path
  and raw scope IDs reached SQL params.
- GREEN: same command passed (`1` file passed; `5` tests passed, `190`
  skipped).

Verification:
- `npm test -- tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `188` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2486`
  tests passed, `34` skipped)

- 21:21 KST - Hardened source metadata fail-fast validation:
  - `addMemory` now rejects non-string `source.title` and `source.uri` values
    before opening a transaction.
  - The early validation reuses the nullable text normalization used by
    `upsertPostgresSource`.
  - `tests/store/memory-repository.test.ts` covers non-string source metadata
    without opening a transaction.

RED/GREEN:
- RED: `npm test -- tests/store/memory-repository.test.ts -t "non-string source metadata" --reporter=dot`
  failed because invalid source metadata reached the transaction path.
- GREEN: same command passed (`1` file passed; `1` test passed, `189`
  skipped).

Verification:
- `npm test -- tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `183` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2481`
  tests passed, `34` skipped)

- 21:18 KST - Hardened source provenance write normalization:
  - `addMemory` now rejects blank source provenance before opening a
    transaction.
  - `upsertPostgresSource` trims direct `sourceRef`, `source.title`, and `uri`
    metadata before source lookup and insert SQL.
  - `tests/store/memory-repository.test.ts` covers trimmed SQL params and
    fail-fast blank source provenance validation.

RED/GREEN:
- RED: `npm test -- tests/store/memory-repository.test.ts -t "trims source provenance|whitespace-only source provenance" --reporter=dot`
  failed `2` tests because raw source provenance reached SQL params and blank
  provenance opened the transaction path.
- GREEN: same command passed (`1` file passed; `2` tests passed, `187`
  skipped).

Verification:
- `npm test -- tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `182` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2480`
  tests passed, `34` skipped)

- 21:13 KST - Hardened stored Postgres source metadata normalization:
  - `parseStoredPostgresSourceRef` now trims valid JSON `sourceRef` and `uri`
    fields before returning provenance metadata.
  - Blank parsed `sourceRef` values still fall back to the raw stored value
    instead of returning an empty provenance identifier.
  - `tests/store/parse-source-ref.test.ts` covers parsed metadata trimming.

RED/GREEN:
- RED: `npm test -- tests/store/parse-source-ref.test.ts -t "trims valid JSON" --reporter=dot`
  failed because raw parsed source metadata reached returned provenance fields.
- GREEN: same command passed (`1` file passed; `1` test passed, `6` skipped).

Verification:
- `npm test -- tests/store/parse-source-ref.test.ts tests/store/memory-repository.test.ts --reporter=dot`
  (`2` files passed; `187` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2478`
  tests passed, `34` skipped)

- 21:10 KST - Hardened memory repository row text normalization:
  - `src/store/memory-repository.ts` now trims stored hydrated memory,
    graph, and archive point-id text before returning mapped results.
  - Raw memory `content` remains unchanged so saved payload text is preserved.
  - `tests/store/memory-repository.test.ts` covers hydrated row, graph row,
    and archive point-id trimming.

RED/GREEN:
- RED: `npm test -- tests/store/memory-repository.test.ts -t "trims stored hydrated|trims stored graph|trims returned qdrant" --reporter=dot`
  failed `3` tests because raw stored row text reached returned results.
- GREEN: same command passed (`1` file passed; `3` tests passed, `184`
  skipped).

Verification:
- `npm test -- tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `180` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2477`
  tests passed, `34` skipped)

- 21:01 KST - Hardened canonical chunk metadata text normalization:
  - `src/store/canonical-indexing.ts` now trims stored chunk metadata text
    before returning reindexable rows.
  - Raw chunk `content` remains unchanged so offsets still refer to the stored
    text.
  - `tests/store/canonical-indexing.test.ts` covers metadata trimming while
    preserving content.

RED/GREEN:
- RED: `npm test -- tests/store/canonical-indexing.test.ts -t "trims stored metadata" --reporter=dot`
  failed because raw stored metadata reached returned chunk rows.
- GREEN: same command passed (`1` file passed; `1` test passed, `82`
  skipped).

Verification:
- `npm test -- tests/store/canonical-indexing.test.ts --reporter=dot`
  (`1` file passed; `83` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2474`
  tests passed, `34` skipped)

- 20:58 KST - Hardened goal-run row text normalization:
  - `src/goal-run/goal-run-repository.ts` now trims stored run and iteration
    row text before returning mapped results.
  - Existing blank-row validation remains unchanged for nullable nonblank
    fields.
  - `tests/goal-run/goal-run-repository.test.ts` covers stored run and
    iteration row trimming through `get`.

RED/GREEN:
- RED: `npm test -- tests/goal-run/goal-run-repository.test.ts -t "trims stored run" --reporter=dot`
  failed because raw stored row text reached returned goal-run entries.
- GREEN: same command passed (`1` file passed; `1` test passed, `69`
  skipped).

Verification:
- `npm test -- tests/goal-run/goal-run-repository.test.ts tests/goal-run/goal-run-handlers.test.ts tests/goal-run/build-goal-context.test.ts --reporter=dot`
  (`3` files passed; `119` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2473`
  tests passed, `34` skipped)

- 20:55 KST - Hardened ingest job error text normalization:
  - `src/jobs/ingest-job-repository.ts` now trims serialized ingest job
    errors before writing `last_error` / `qdrant_last_error`.
  - Ingest job row mapping now trims stored organization/error text and maps
    blank stored errors to `null`.
  - `tests/jobs/serialize-error.test.ts` and
    `tests/jobs/ingest-job-repository.test.ts` cover the storage and read
    mapping behavior.

RED/GREEN:
- RED: `npm test -- tests/jobs/serialize-error.test.ts tests/jobs/ingest-job-repository.test.ts -t "trims serialized|blank serialized|trims ingest job row" --reporter=dot`
  failed `3` tests because raw error text reached SQL params and returned job
  rows.
- GREEN: same command passed (`2` files passed; `3` tests passed, `15`
  skipped).

Verification:
- `npm test -- tests/jobs/serialize-error.test.ts tests/jobs/ingest-job-repository.test.ts tests/jobs/ingest-job-claim.test.ts --reporter=dot`
  (`3` files passed; `32` tests passed, `6` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2472`
  tests passed, `34` skipped)

- 20:51 KST - Hardened audit log row text normalization:
  - `src/audit/audit-log-repository.ts` now trims stored audit row text before
    returning list results.
  - Blank stored audit `error_message` values now map to `null`.
  - `tests/audit/audit-truncation.test.ts` covers trimmed row mapping.

RED/GREEN:
- RED: `npm test -- tests/audit/audit-truncation.test.ts -t "trims audit row" --reporter=dot`
  failed because raw stored row text reached returned audit entries.
- GREEN: `npm test -- tests/audit/audit-truncation.test.ts -t "trims audit row" --reporter=dot`
  (`1` file passed; `1` test passed, `55` skipped)

Verification:
- `npm test -- tests/audit/audit-truncation.test.ts tests/audit/audit-write.test.ts --reporter=dot`
  (`2` files passed; `64` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2469`
  tests passed, `34` skipped)

- 20:49 KST - Hardened audit log direct text normalization:
  - `src/audit/audit-log-repository.ts` now trims direct organization, actor,
    tool, project key, request ID, and error-message text before SQL writes.
  - `listByOrganization` now trims direct organization IDs before querying.
  - `tests/audit/audit-truncation.test.ts` covers trimmed SQL parameters and
    blank direct error-message nulling.

RED/GREEN:
- RED: `npm test -- tests/audit/audit-truncation.test.ts -t "trims direct|blank direct" --reporter=dot`
  failed `3` tests because raw audit text reached SQL parameters.
- GREEN: `npm test -- tests/audit/audit-truncation.test.ts -t "trims direct|blank direct" --reporter=dot`
  (`1` file passed; `3` tests passed, `52` skipped)

Verification:
- `npm test -- tests/audit/audit-truncation.test.ts tests/audit/audit-write.test.ts --reporter=dot`
  (`2` files passed; `63` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2468`
  tests passed, `34` skipped)

- 20:46 KST - Hardened memory archive error message normalization:
  - `src/store/memory-archive-repository.ts` now trims optional Qdrant status
    and compaction-run completion error messages before SQL writes.
  - `tests/store/memory-archive-repository.test.ts` covers trimmed nonblank
    messages and whitespace-only blank-to-null behavior.

RED/GREEN:
- RED: `npm test -- tests/store/memory-archive-repository.test.ts -t "records error message|schedules the next retry|updates run outcome counters"`
  failed the updated cases because raw error-message text reached SQL
  parameters.
- GREEN: `npm test -- tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `151` tests passed)

Verification:
- `npm test -- tests/scripts/backup-verify.test.ts --reporter=dot`
  (`1` file passed; `60` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2465`
  tests passed, `34` skipped)

## 2026-07-02

- 19:10 KST - Hardened add memory project key normalization:
  - `src/mcp/tool-handlers.ts` now trims direct `add_memory` project keys
    before legacy repository resolution and repository write input
    construction.
  - `tests/mcp/server.test.ts` covers trimmed project keys at the legacy
    `resolveRepository` boundary.

RED/GREEN:
- RED: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  failed the updated add-memory case because raw project key text reached
  `resolveRepository`.
- GREEN: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  (`1` file passed; `134` tests passed)

Verification:
- `npx vitest run tests/store/canonical-indexing.test.ts tests/audit/audit-write.test.ts --reporter=dot`
  (`2` files passed; `90` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2461`
  tests passed, `34` skipped)

- 19:08 KST - Hardened compaction project key normalization:
  - `src/mcp/tool-handlers.ts` now trims direct `compact_memory` project keys
    once and reuses the normalized value for repository resolution,
    compaction planning, and apply results.
  - `tests/mcp/server.test.ts` covers trimmed compaction project keys in the
    apply-path result.

RED/GREEN:
- RED: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  failed the updated compaction apply case because the result echoed a raw
  project key.
- GREEN: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  (`1` file passed; `134` tests passed)

Verification:
- `npx vitest run tests/compact/apply-compaction.test.ts tests/compact/compact-memory.test.ts --reporter=dot`
  (`2` files passed; `77` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2461`
  tests passed, `34` skipped)

- 19:03 KST - Hardened governance filter text normalization:
  - `src/mcp/tool-handlers.ts` now trims direct `list_memory` tag filters and
    `inspect_memory_graph` query filters before canonical repository calls.
  - `tests/mcp/server.test.ts` covers trimmed governance filter text at the
    direct registry boundary.

RED/GREEN:
- RED: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  failed the updated governance listing and graph cases because raw filter text
  reached repository calls.
- GREEN: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  (`1` file passed; `134` tests passed)

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/canonical-indexing.test.ts --reporter=dot`
  (`2` files passed; `259` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2461`
  tests passed, `34` skipped)

- 19:00 KST - Hardened context pack task normalization:
  - `src/mcp/tool-handlers.ts` now trims direct `build_context_pack` task text
    before retrieval, markdown rendering, and context-pack run persistence.
  - `tests/mcp/server.test.ts` covers trimmed service-backed context-pack task
    text in rendered markdown and persisted run rows.

RED/GREEN:
- RED: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  failed the updated context-pack case because raw task text reached rendered
  markdown.
- GREEN: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  (`1` file passed; `134` tests passed)

Verification:
- `npx vitest run tests/context-pack/build-context-pack.test.ts tests/mcp/tool-registry.test.ts --reporter=dot`
  (`2` files passed; `42` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2461`
  tests passed, `34` skipped)

- 18:57 KST - Hardened goal-run text normalization:
  - `src/mcp/tool-handlers.ts` now trims direct `goal`,
    `record_iteration.attempt`, and `check_repeat_attempt.attempt` text before
    service dispatch or embedding.
  - `tests/goal-run/goal-run-handlers.test.ts` covers trimmed goal and attempt
    text at the handler boundary.

RED/GREEN:
- RED: `npx vitest run tests/goal-run/goal-run-handlers.test.ts --reporter=dot`
  failed the updated goal/attempt cases because raw text reached goal-run
  service stubs and `embedBatch`.
- GREEN: `npx vitest run tests/goal-run/goal-run-handlers.test.ts --reporter=dot`
  (`1` file passed; `25` tests passed)

Verification:
- `npx vitest run tests/goal-run/goal-run-repository.test.ts tests/goal-run/build-goal-context.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`3` files passed; `227` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2461`
  tests passed, `34` skipped)

- 18:53 KST - Added a handler organization boundary guard:
  - `src/mcp/tool-handlers.ts` no longer contains raw direct
    `toolInput.organizationId` pass-through or raw defaulting patterns at MCP
    handler boundaries.
  - `search_memory` now passes the already-trimmed direct organization ID into
    record resolution.
  - `unarchive_memory` now normalizes direct organization IDs before calling
    `unarchiveCompaction`.
  - `tests/mcp/tool-registry.test.ts` includes a static regression guard for
    raw handler organization ID pass-through and defaulting patterns.

RED/GREEN:
- RED: `npx vitest run tests/mcp/tool-registry.test.ts --reporter=dot`
  failed the new static guard because raw direct organization ID patterns
  remained in `tool-handlers.ts`.
- GREEN: `npx vitest run tests/mcp/tool-registry.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`2` files passed; `153` tests passed)

Verification:
- `npx vitest run tests/compact/unarchive-compaction.test.ts tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`2` files passed; `181` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2461`
  tests passed, `34` skipped)

- 18:50 KST - Hardened search handler organization normalization:
  - `src/mcp/tool-handlers.ts` now trims direct organization identifiers before
    `search_memory` record resolution dispatches to retrieve overrides, legacy
    collection, or canonical retrieval.
  - `tests/mcp/tool-registry.test.ts` covers trimmed organization IDs at the
    retrieve override boundary.

RED/GREEN:
- RED: `npx vitest run tests/mcp/tool-registry.test.ts --reporter=dot`
  failed the updated search case because raw organization ID text reached
  `retrieveMemory`.
- GREEN: `npx vitest run tests/mcp/tool-registry.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`2` files passed; `152` tests passed)

Verification:
- `npx vitest run tests/search/retrieve-memory.test.ts tests/store/memory-repository.test.ts --reporter=dot`
  (`2` files passed; `215` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2460`
  tests passed, `34` skipped)

- 18:46 KST - Hardened add memory handler organization normalization:
  - `src/mcp/tool-handlers.ts` now trims direct organization identifiers before
    `add_memory` repository input construction for legacy and service-backed
    write paths.
  - `tests/mcp/server.test.ts` covers trimmed service-backed add organization
    IDs before repository writes and ingest job creation.

RED/GREEN:
- RED: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  failed the updated service-backed add case because raw organization ID text
  reached `repository.addMemory`.
- GREEN: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  (`1` file passed; `134` tests passed)

Verification:
- `npx vitest run tests/store/canonical-indexing.test.ts tests/audit/audit-write.test.ts --reporter=dot`
  (`2` files passed; `90` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2460`
  tests passed, `34` skipped)

- 18:44 KST - Hardened compaction handler organization normalization:
  - `src/mcp/tool-handlers.ts` now trims direct organization identifiers once
    in `compact_memory` and reuses the normalized value for memory listing and
    compaction apply calls.
  - `tests/mcp/server.test.ts` covers trimmed compaction organization IDs
    before list and apply paths.

RED/GREEN:
- RED: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  failed the updated compaction apply case because raw organization ID text
  reached `listMemory`.
- GREEN: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  (`1` file passed; `134` tests passed)

Verification:
- `npx vitest run tests/compact/apply-compaction.test.ts tests/compact/unarchive-compaction.test.ts tests/compact/outbox-sweeper.test.ts --reporter=dot`
  (`3` files passed; `105` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2460`
  tests passed, `34` skipped)

- 18:41 KST - Hardened goal context organization normalization:
  - `src/mcp/tool-handlers.ts` now trims direct organization identifiers before
    `build_goal_context` and `check_repeat_attempt` load goal runs and scoped
    memories.
  - `tests/goal-run/goal-run-handlers.test.ts` covers trimmed organization IDs
    across goal context and repeat-check handlers.

RED/GREEN:
- RED: `npx vitest run tests/goal-run/goal-run-handlers.test.ts --reporter=dot`
  failed the updated context/repeat cases because raw organization ID text
  reached `goalRuns.get`.
- GREEN: `npx vitest run tests/goal-run/goal-run-handlers.test.ts --reporter=dot`
  (`1` file passed; `25` tests passed)

Verification:
- `npx vitest run tests/goal-run/goal-run-repository.test.ts tests/goal-run/build-goal-context.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`3` files passed; `227` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2460`
  tests passed, `34` skipped)

- 18:38 KST - Hardened goal-run handler organization normalization:
  - `src/mcp/tool-handlers.ts` now trims direct organization identifiers before
    goal-run start, iteration, get, list, complete, and abandon service
    dispatch.
  - `tests/goal-run/goal-run-handlers.test.ts` covers trimmed organization IDs
    across the goal-run dispatch handlers.

RED/GREEN:
- RED: `npx vitest run tests/goal-run/goal-run-handlers.test.ts --reporter=dot`
  failed the updated goal-run dispatch cases because raw organization ID text
  reached goal-run service stubs.
- GREEN: `npx vitest run tests/goal-run/goal-run-handlers.test.ts --reporter=dot`
  (`1` file passed; `25` tests passed)

Verification:
- `npx vitest run tests/goal-run/goal-run-repository.test.ts tests/goal-run/build-goal-context.test.ts --reporter=dot`
  (`2` files passed; `93` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2460`
  tests passed, `34` skipped)

- 18:36 KST - Hardened MCP audit listing organization normalization:
  - `src/mcp/tool-handlers.ts` now trims direct organization identifiers before
    `list_audit_log` calls the audit log repository and echoes the
    organization ID in the response.
  - `tests/mcp/server.test.ts` covers trimmed audit listing organization IDs
    at the direct registry boundary.

RED/GREEN:
- RED: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  failed the updated audit listing case because the response echoed raw
  organization ID text.
- GREEN: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  (`1` file passed; `134` tests passed)

Verification:
- `npx vitest run tests/audit/audit-write.test.ts tests/audit/audit-truncation.test.ts --reporter=dot`
  (`2` files passed; `60` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2459`
  tests passed, `34` skipped)

- 18:33 KST - Hardened MCP mutation handler organization normalization:
  - `src/mcp/tool-handlers.ts` now trims direct organization identifiers before
    `update_memory`, `delete_memory`, and `tag_memory` call canonical mutation
    repository primitives and vector cleanup.
  - `tests/mcp/server.test.ts` covers trimmed mutation handler organization
    IDs at the direct registry boundary.

RED/GREEN:
- RED: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  failed the updated mutation handler cases because raw organization ID text
  reached `updateMemoryRecord` and `archiveMemoryRecord`.
- GREEN: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  (`1` file passed; `134` tests passed)

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/canonical-indexing.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `291` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2459`
  tests passed, `34` skipped)

- 18:31 KST - Hardened MCP graph inspection handler organization
  normalization:
  - `src/mcp/tool-handlers.ts` now trims direct organization identifiers before
    `inspect_memory_graph` calls canonical graph inspection repository
    primitives.
  - `tests/mcp/server.test.ts` covers trimmed graph inspection organization
    IDs at the direct registry boundary.

RED/GREEN:
- RED: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  failed the updated graph inspection case because raw organization ID text
  reached `inspectMemoryGraph`.
- GREEN: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  (`1` file passed; `134` tests passed)

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/canonical-indexing.test.ts --reporter=dot`
  (`2` files passed; `259` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2459`
  tests passed, `34` skipped)

- 18:27 KST - Hardened MCP governance handler organization normalization:
  - `src/mcp/tool-handlers.ts` now trims direct organization identifiers before
    `reindex_memory` canonical reindex calls and `list_memory` governance
    repository listing calls.
  - Whitespace-only `reindex_memory` organization IDs are rejected before
    canonical service resolution.
  - `tests/mcp/server.test.ts` covers trimmed reindex/list-memory inputs and
    the early whitespace-only reindex rejection path.

RED/GREEN:
- RED: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  failed the updated list-memory governance case because raw organization ID
  text reached `listMemoryForGovernance`.
- GREEN: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  (`1` file passed; `134` tests passed)

Verification:
- `npx vitest run tests/store/canonical-indexing.test.ts tests/audit/audit-write.test.ts --reporter=dot`
  (`2` files passed; `90` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2459`
  tests passed, `34` skipped)

- 18:22 KST - Hardened context pack handler organization normalization:
  - `src/mcp/tool-handlers.ts` now trims direct organization identifiers before
    `build_context_pack` runs service-backed retrieval and persists context
    pack run rows.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/mcp/server.test.ts` covers trimmed service-backed context pack run
    parameters.

RED/GREEN:
- RED: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  failed the updated context pack persistence case because raw organization ID
  text reached `createContextPackRun`.
- GREEN: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  (`1` file passed; `133` tests passed)

Verification:
- `npx vitest run tests/context-pack/build-context-pack.test.ts tests/audit/audit-write.test.ts --reporter=dot`
  (`2` files passed; `31` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2458`
  tests passed, `34` skipped)

- 18:20 KST - Hardened MCP audit wrapper organization normalization:
  - `src/mcp/tool-registry.ts` now trims direct organization identifiers before
    best-effort success or error audit rows are written.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/audit/audit-write.test.ts` covers trimmed successful audit rows.

RED/GREEN:
- RED: `npx vitest run tests/audit/audit-write.test.ts --reporter=dot`
  failed the new audit organization trimming case because raw organization ID
  text reached `auditLog.record`.
- GREEN: `npx vitest run tests/audit/audit-write.test.ts --reporter=dot`
  (`1` file passed; `8` tests passed)

Verification:
- `npx vitest run tests/mcp/tool-registry.test.ts tests/mcp/server.test.ts tests/audit/audit-truncation.test.ts --reporter=dot`
  (`3` files passed; `203` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2458`
  tests passed, `34` skipped)

- 18:14 KST - Hardened context pack run organization normalization:
  - `src/store/canonical-indexing.ts` now trims direct organization
    identifiers before `createContextPackRun` writes
    `context_pack_runs.organization_id`.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/store/canonical-indexing.test.ts` covers trimmed context pack run
    INSERT parameters.

RED/GREEN:
- RED: `npx vitest run tests/store/canonical-indexing.test.ts --reporter=dot`
  failed the new context pack run organization trimming case because raw
  organization ID text reached INSERT parameters.
- GREEN: `npx vitest run tests/store/canonical-indexing.test.ts --reporter=dot`
  (`1` file passed; `82` tests passed)

Verification:
- `npx vitest run tests/context-pack/build-context-pack.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`2` files passed; `156` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2457`
  tests passed, `34` skipped)

- 18:11 KST - Hardened canonical chunk listing organization normalization:
  - `src/store/canonical-indexing.ts` now trims direct organization
    identifiers before `listChunks` builds scoped reindex query parameters.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/store/canonical-indexing.test.ts` covers trimmed list query
    parameters.

RED/GREEN:
- RED: `npx vitest run tests/store/canonical-indexing.test.ts --reporter=dot`
  failed the new chunk listing organization trimming case because raw
  organization ID text reached query parameters.
- GREEN: `npx vitest run tests/store/canonical-indexing.test.ts --reporter=dot`
  (`1` file passed; `81` tests passed)

Verification:
- `npx vitest run tests/compact/ingest-sweeper.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`2` files passed; `182` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2456`
  tests passed, `34` skipped)

- 18:08 KST - Hardened canonical chunk replace organization normalization:
  - `src/store/canonical-indexing.ts` now trims direct record organization
    identifiers before `replaceChunksForRecord` transaction DELETE parameters.
  - `replaceChunksForRecordWithPendingIngest` also uses the normalized
    organization ID for transaction DELETE and pending ingest job INSERT
    parameters.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/store/canonical-indexing.test.ts` covers trimmed replace and
    pending-replace parameters.

RED/GREEN:
- RED: `npx vitest run tests/store/canonical-indexing.test.ts --reporter=dot`
  failed the new replace organization trimming cases because raw organization
  ID text reached DELETE parameters.
- GREEN: `npx vitest run tests/store/canonical-indexing.test.ts --reporter=dot`
  (`1` file passed; `80` tests passed)

Verification:
- `npx vitest run tests/compact/ingest-sweeper.test.ts tests/compact/unarchive-compaction.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`3` files passed; `214` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2455`
  tests passed, `34` skipped)

- 18:05 KST - Hardened canonical chunk insert organization normalization:
  - `src/store/canonical-indexing.ts` now trims direct record organization
    identifiers before `insertChunks` writes `memory_chunks.organization_id`.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/store/canonical-indexing.test.ts` covers trimmed chunk INSERT
    parameters.

RED/GREEN:
- RED: `npx vitest run tests/store/canonical-indexing.test.ts --reporter=dot`
  failed the new chunk insert organization trimming case because raw
  organization ID text reached INSERT parameters.
- GREEN: `npx vitest run tests/store/canonical-indexing.test.ts --reporter=dot`
  (`1` file passed; `79` tests passed)

Verification:
- `npx vitest run tests/compact/ingest-sweeper.test.ts tests/compact/unarchive-compaction.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`3` files passed; `214` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2454`
  tests passed, `34` skipped)

- 18:02 KST - Hardened canonical chunk delete organization normalization:
  - `src/store/canonical-indexing.ts` now trims direct organization
    identifiers before `deleteChunksForRecord` DELETE parameters.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/store/canonical-indexing.test.ts` covers trimmed chunk-delete
    parameters.

RED/GREEN:
- RED: `npx vitest run tests/store/canonical-indexing.test.ts --reporter=dot`
  failed the new chunk delete organization trimming case because raw
  organization ID text reached DELETE parameters.
- GREEN: `npx vitest run tests/store/canonical-indexing.test.ts --reporter=dot`
  (`1` file passed; `78` tests passed)

Verification:
- `npx vitest run tests/compact/ingest-sweeper.test.ts tests/compact/unarchive-compaction.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`3` files passed; `214` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2453`
  tests passed, `34` skipped)

- 17:59 KST - Hardened memory archive recent-apply organization normalization:
  - `src/store/memory-archive-repository.ts` now trims direct organization
    identifiers before `countRecentApplyRuns` rate-limit SQL queries.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/store/memory-archive-repository.test.ts` covers trimmed
    recent-apply count parameters.

RED/GREEN:
- RED: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  failed the new recent-apply count organization trimming case because raw
  organization ID text reached query parameters.
- GREEN: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `149` tests passed)

Verification:
- `npx vitest run tests/compact/apply-compaction.test.ts tests/compact/outbox-sweeper.test.ts --reporter=dot`
  (`2` files passed; `73` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2452`
  tests passed, `34` skipped)

- 17:58 KST - Stabilized operator server worker/metrics tests:
  - `src/app/server.ts` now allows tests to inject the background worker
    starter and readiness probe pool while production keeps the existing
    defaults.
  - `tests/app/start-background-workers-server.test.ts` and
    `tests/app/start-operator-server-metrics.test.ts` now avoid module-level
    mocks for worker, queue-metrics, and database modules.
  - This removes parallel full-suite mock interference that surfaced as
    operator server timeouts and duplicate worker-start calls.

RED/GREEN:
- RED: `npm test -- --reporter=dot` twice reproduced unrelated full-suite
  failures in operator server worker/metrics tests while those files passed in
  isolation.
- GREEN: `npx vitest run tests/app/start-background-workers-server.test.ts --reporter=dot`
  (`1` file passed; `4` tests passed)
- GREEN: `npx vitest run tests/app/start-operator-server-metrics.test.ts --reporter=dot`
  (`1` file passed; `1` test passed)

Verification:
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2452`
  tests passed, `34` skipped)

- 17:50 KST - Hardened unarchive compaction organization normalization:
  - `src/compact/unarchive-compaction.ts` now trims direct organization
    identifiers before archive lookup and carries the normalized value through
    canonical restore, chunk insertion, vector upsert, and compensation paths.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/compact/unarchive-compaction.test.ts` covers normalized repository
    calls, restored record metadata, and vector payload organization IDs.

RED/GREEN:
- RED: `npx vitest run tests/compact/unarchive-compaction.test.ts --reporter=dot`
  failed the new restored side-effect organization trimming case because raw
  organization ID text reached `findArchiveByIds`.
- GREEN: `npx vitest run tests/compact/unarchive-compaction.test.ts --reporter=dot`
  (`1` file passed; `32` tests passed)

Verification:
- `npx vitest run tests/store/memory-archive-repository.test.ts tests/compact/outbox-sweeper.test.ts --reporter=dot`
  (`2` files passed; `180` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2451`
  tests passed, `34` skipped)

- 17:47 KST - Hardened memory archive restore organization normalization:
  - `src/store/memory-archive-repository.ts` now trims direct organization
    identifiers before `restoreToCanonical` ownership checks and INSERT
    parameters.
  - Restored-record compensation deletes also trim organization identifiers
    before DELETE parameters.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/store/memory-archive-repository.test.ts` covers trimmed restore and
    compensation-delete parameters.

RED/GREEN:
- RED: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  failed the new restore/delete organization trimming cases because raw
  organization ID text reached the ownership check and DELETE parameters.
- GREEN: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `148` tests passed)

Verification:
- `npx vitest run tests/compact/unarchive-compaction.test.ts tests/compact/outbox-sweeper.test.ts --reporter=dot`
  (`2` files passed; `63` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2450`
  tests passed, `34` skipped)

- 17:44 KST - Hardened memory archive lookup organization normalization:
  - `src/store/memory-archive-repository.ts` now trims direct organization
    identifiers before `findArchiveByIds` queries archive rows by ID.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/store/memory-archive-repository.test.ts` covers trimmed archive
    lookup parameters.

RED/GREEN:
- RED: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  failed the new archive lookup organization trimming case because raw
  organization ID text reached query parameters.
- GREEN: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `146` tests passed)

Verification:
- `npx vitest run tests/compact/unarchive-compaction.test.ts tests/compact/outbox-sweeper.test.ts --reporter=dot`
  (`2` files passed; `63` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2448`
  tests passed, `34` skipped)

- 17:40 KST - Hardened lifecycle init project/task normalization:
  - `src/lifecycle/init.ts` now trims direct project keys and task text before
    generated hook scripts and README content are rendered.
  - Existing nonblank validation still rejects whitespace-only project keys and
    task text.
  - `tests/cli.test.ts` covers trimmed generated `DEFAULT_PROJECT_KEY`,
    `DEFAULT_TASK`, and README project defaults.

RED/GREEN:
- RED: `npx vitest run tests/cli.test.ts --reporter=dot` failed the new
  lifecycle init project/task trimming case because raw project/task text
  reached generated hook content.
- GREEN: `npx vitest run tests/cli.test.ts --reporter=dot`
  (`1` file passed; `30` tests passed)

Verification:
- `npx vitest run tests/cli.test.ts tests/scripts/package-manifest.test.ts --reporter=dot`
  (`2` files passed; `69` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2447`
  tests passed, `34` skipped)

- 17:36 KST - Hardened lifecycle init user scope normalization:
  - `src/lifecycle/init.ts` now trims direct user scope identifiers before
    generated hook scripts are rendered.
  - Existing nonblank validation still rejects whitespace-only user scope IDs.
  - `tests/cli.test.ts` covers trimmed generated `DEFAULT_USER_SCOPE_ID`
    values.

RED/GREEN:
- RED: `npx vitest run tests/cli.test.ts --reporter=dot` failed the new
  lifecycle init user scope trimming case because raw user scope text reached
  generated hook content.
- GREEN: `npx vitest run tests/cli.test.ts --reporter=dot`
  (`1` file passed; `30` tests passed)

Verification:
- `npx vitest run tests/cli.test.ts tests/scripts/package-manifest.test.ts --reporter=dot`
  (`2` files passed; `69` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2447`
  tests passed, `34` skipped)

- 17:30 KST - Hardened lifecycle init organization normalization:
  - `src/lifecycle/init.ts` now trims direct organization identifiers before
    generated hook scripts and README content are rendered.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/cli.test.ts` covers trimmed generated `DEFAULT_ORGANIZATION_ID`
    values and README defaults.

RED/GREEN:
- RED: `npx vitest run tests/cli.test.ts --reporter=dot` failed the new
  lifecycle init organization trimming case because raw organization ID text
  reached generated hook content.
- GREEN: `npx vitest run tests/cli.test.ts --reporter=dot`
  (`1` file passed; `30` tests passed)

Verification:
- `npx vitest run tests/cli.test.ts tests/scripts/package-manifest.test.ts --reporter=dot`
  (`2` files passed; `69` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2447`
  tests passed, `34` skipped)

- 17:27 KST - Hardened PGVector organization normalization:
  - `src/vector/pgvector-index.ts` now uses the shared optional vector org
    normalizer before query filters, point deletes, and record-id deletes.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs, and empty string still preserves legacy unscoped vector behavior.
  - `tests/vector/pgvector-index.integration.test.ts` covers trimmed SQL
    parameters with mock pools, so the guard runs even without PGVector.

RED/GREEN:
- RED: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new PGVector organization trimming cases because raw organization
  ID text reached SQL parameters.
- GREEN: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`1` file passed; `77` tests passed, `12` skipped)

Verification:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/vector/qdrant-index.test.ts tests/vector/organization-id.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`4` files passed; `191` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2447`
  tests passed, `34` skipped)

- 17:24 KST - Hardened Qdrant vector organization normalization:
  - `src/vector/organization-id.ts` now exposes
    `normalizeOptionalVectorOrganizationId` for optional vector org filters.
  - `src/vector/qdrant-index.ts` now trims direct organization identifiers
    before query filters, point deletes, and record-id deletes.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs, and empty string still preserves legacy unscoped vector behavior.
  - `tests/vector/qdrant-index.test.ts` covers trimmed query/delete selectors.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  failed the new Qdrant organization trimming cases because raw organization
  ID text reached backend filters.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  (`1` file passed; `78` tests passed)

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/organization-id.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `114` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2444`
  tests passed, `34` skipped)

- 17:20 KST - Hardened retrieval organization normalization:
  - `src/search/retrieve-memory.ts` now trims direct organization identifiers
    before vector queries, lexical repository search, and hydration calls.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs, and legacy anonymous search still maps absent organization IDs to the
    empty vector filter string.
  - `tests/search/retrieve-memory.test.ts` covers trimmed vector, lexical, and
    hydration parameters.

RED/GREEN:
- RED: `npx vitest run tests/search/retrieve-memory.test.ts --reporter=dot`
  failed the new retrieval organization trimming case because raw organization
  ID text reached vector filters.
- GREEN: `npx vitest run tests/search/retrieve-memory.test.ts --reporter=dot`
  (`1` file passed; `38` tests passed)

Verification:
- `npx vitest run tests/search/retrieve-memory.test.ts tests/search/lexical-score.test.ts tests/search/rank-results.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`4` files passed; `204` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2441`
  tests passed, `34` skipped)

- 17:17 KST - Hardened ingest job creation organization normalization:
  - `src/jobs/ingest-job-repository.ts` now trims direct organization
    identifiers before creating ingest job rows.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/jobs/ingest-job-repository.test.ts` covers trimmed create
    parameters.

RED/GREEN:
- RED: `npx vitest run tests/jobs/ingest-job-repository.test.ts --reporter=dot`
  failed the new ingest job create organization trimming case because raw
  organization ID text reached INSERT parameters.
- GREEN: `npx vitest run tests/jobs/ingest-job-repository.test.ts --reporter=dot`
  (`1` file passed; `7` tests passed, `6` skipped)

Verification:
- `npx vitest run tests/jobs/ingest-job-repository.test.ts tests/jobs/ingest-job-claim.test.ts tests/jobs/ingest-sweeper.test.ts tests/store/canonical-indexing.test.ts --reporter=dot`
  (`3` files passed; `104` tests passed, `6` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2440`
  tests passed, `34` skipped)

- 17:14 KST - Hardened canonical reindex organization normalization:
  - `src/store/canonical-indexing.ts` now trims direct organization
    identifiers before chunk paging and vector cleanup calls.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/store/canonical-indexing.test.ts` covers trimmed repository and
    vector cleanup parameters.

RED/GREEN:
- RED: `npx vitest run tests/store/canonical-indexing.test.ts --reporter=dot`
  failed the new reindex organization trimming case because raw organization
  ID text reached chunk paging parameters.
- GREEN: `npx vitest run tests/store/canonical-indexing.test.ts --reporter=dot`
  (`1` file passed; `77` tests passed)

Verification:
- `npx vitest run tests/store/canonical-indexing.test.ts tests/jobs/ingest-sweeper.test.ts tests/context-pack/build-context-pack.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `132` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2439`
  tests passed, `34` skipped)

- 17:11 KST - Hardened memory archive organization normalization:
  - `src/store/memory-repository.ts` now trims direct organization identifiers
    before `archiveMemoryRecord` queries.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/store/memory-repository.test.ts` covers trimmed archive parameters.

RED/GREEN:
- RED: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  failed the new memory archive organization trimming case because raw
  organization ID text reached query parameters.
- GREEN: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `177` tests passed, `7` skipped)

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/canonical-indexing.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`3` files passed; `386` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2438`
  tests passed, `34` skipped)

- 17:05 KST - Hardened memory deletion organization normalization:
  - `src/store/memory-repository.ts` now trims direct organization identifiers
    before `deleteMemoryRecord` queries.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/store/memory-repository.test.ts` covers trimmed delete parameters.

RED/GREEN:
- RED: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  failed the new memory delete organization trimming case because raw
  organization ID text reached query parameters.
- GREEN: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `176` tests passed, `7` skipped)

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/canonical-indexing.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`3` files passed; `385` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2437`
  tests passed, `34` skipped)

- 17:02 KST - Hardened single memory record lookup organization normalization:
  - `src/store/memory-repository.ts` now trims direct organization identifiers
    before `getMemoryRecordById` queries.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/store/memory-repository.test.ts` covers trimmed lookup parameters.

RED/GREEN:
- RED: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  failed the new memory record lookup organization trimming case because raw
  organization ID text reached query parameters.
- GREEN: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `175` tests passed, `7` skipped)

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/canonical-indexing.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`3` files passed; `384` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2436`
  tests passed, `34` skipped)

- 16:54 KST - Hardened memory update organization normalization:
  - `src/store/memory-repository.ts` now trims direct organization identifiers
    before update transaction reads, writes, tag replacement, and graph refresh.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/store/memory-repository.test.ts` covers trimmed update transaction
    parameters.

RED/GREEN:
- RED: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  failed the new update organization trimming case because raw organization ID
  text reached hydrate query parameters.
- GREEN: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `174` tests passed, `7` skipped)

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/canonical-indexing.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`3` files passed; `383` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2435`
  tests passed, `34` skipped)

- 16:51 KST - Hardened memory creation organization normalization:
  - `src/store/memory-repository.ts` now trims direct organization identifiers
    before source upsert and memory insert writes.
  - Default organization behavior is preserved, and existing nonblank
    validation still rejects whitespace-only organization IDs.
  - `tests/store/memory-repository.test.ts` covers trimmed add-memory write
    parameters.

RED/GREEN:
- RED: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  failed the new add-memory organization trimming case because raw
  organization ID text reached source query parameters.
- GREEN: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `173` tests passed, `7` skipped)

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/canonical-indexing.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`3` files passed; `382` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2434`
  tests passed, `34` skipped)

- 16:48 KST - Hardened graph inspection organization normalization:
  - `src/store/memory-repository.ts` now trims direct organization identifiers
    before memory graph entity and relationship queries.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/store/memory-repository.test.ts` covers trimmed graph query
    parameters.

RED/GREEN:
- RED: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  failed the new graph inspection organization trimming case because raw
  organization ID text reached entity query parameters.
- GREEN: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `172` tests passed, `7` skipped)

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`2` files passed; `305` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2433`
  tests passed, `34` skipped)

- 16:45 KST - Hardened governance listing organization normalization:
  - `src/store/memory-repository.ts` now trims direct organization identifiers
    before building governance list query parameters.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/store/memory-repository.test.ts` covers trimmed governance list
    parameters.

RED/GREEN:
- RED: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  failed the new governance list organization trimming case because raw
  organization ID text reached query parameters.
- GREEN: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `171` tests passed, `7` skipped)

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`2` files passed; `304` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2432`
  tests passed, `34` skipped)

- 16:42 KST - Hardened memory ID lookup organization normalization:
  - `src/store/memory-repository.ts` now trims direct organization identifiers
    before building ID lookup query parameters.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/store/memory-repository.test.ts` covers trimmed ID lookup
    parameters.

RED/GREEN:
- RED: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  failed the new ID lookup organization trimming case because raw organization
  ID text reached query parameters.
- GREEN: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `170` tests passed, `7` skipped)

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`2` files passed; `303` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2431`
  tests passed, `34` skipped)

- 16:40 KST - Hardened memory listing organization normalization:
  - `src/store/memory-repository.ts` now trims direct organization identifiers
    before building list query parameters.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/store/memory-repository.test.ts` covers trimmed list parameters.

RED/GREEN:
- RED: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  failed the new list organization trimming case because raw organization ID
  text reached query parameters.
- GREEN: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `169` tests passed, `7` skipped)

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`2` files passed; `302` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2430`
  tests passed, `34` skipped)

- 16:38 KST - Hardened memory lexical search organization normalization:
  - `src/store/memory-repository.ts` now trims direct organization identifiers
    before building search query parameters.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/store/memory-repository.test.ts` covers trimmed search parameters.

RED/GREEN:
- RED: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  failed the new search organization trimming case because raw organization ID
  text reached query parameters.
- GREEN: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `168` tests passed, `7` skipped)

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`2` files passed; `301` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2429`
  tests passed, `34` skipped)

- 16:35 KST - Hardened goal-run close organization normalization:
  - `src/goal-run/goal-run-repository.ts` now trims direct organization
    identifiers before updating completed or abandoned runs.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/goal-run/goal-run-repository.test.ts` covers trimmed close update
    parameters.

RED/GREEN:
- RED: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  failed the new close organization trimming case because raw organization ID
  text reached the update parameters.
- GREEN: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  (`1` file passed; `69` tests passed)

Verification:
- `npx vitest run tests/goal-run/goal-run-repository.test.ts tests/goal-run/goal-run-handlers.test.ts tests/goal-run/build-goal-context.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`4` files passed; `250` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2428`
  tests passed, `34` skipped)

- 16:33 KST - Hardened goal-run list identifier normalization:
  - `src/goal-run/goal-run-repository.ts` now trims direct organization and
    scope identifiers before querying.
  - Existing nonblank validation still rejects whitespace-only identifiers.
  - `tests/goal-run/goal-run-repository.test.ts` covers trimmed list query
    parameters with a status filter.

RED/GREEN:
- RED: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  failed the new list identifier trimming case because raw organization and
  scope ID text reached the query parameters.
- GREEN: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  (`1` file passed; `68` tests passed)

Verification:
- `npx vitest run tests/goal-run/goal-run-repository.test.ts tests/goal-run/goal-run-handlers.test.ts tests/goal-run/build-goal-context.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`4` files passed; `249` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2427`
  tests passed, `34` skipped)

- 16:31 KST - Hardened goal-run get organization normalization:
  - `src/goal-run/goal-run-repository.ts` now trims direct organization
    identifiers before run and iteration queries.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/goal-run/goal-run-repository.test.ts` covers trimmed get query
    parameters across both lookups.

RED/GREEN:
- RED: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  failed the new get organization trimming case because raw organization ID
  text reached the run query parameters.
- GREEN: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  (`1` file passed; `67` tests passed)

Verification:
- `npx vitest run tests/goal-run/goal-run-repository.test.ts tests/goal-run/goal-run-handlers.test.ts tests/goal-run/build-goal-context.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`4` files passed; `248` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2426`
  tests passed, `34` skipped)

- 16:29 KST - Hardened goal-run iteration organization normalization:
  - `src/goal-run/goal-run-repository.ts` now trims direct organization
    identifiers before run updates, iteration inserts, and memory linking.
  - Existing nonblank validation still rejects whitespace-only organization
    IDs.
  - `tests/goal-run/goal-run-repository.test.ts` covers trimmed organization
    parameters across iteration recording queries.

RED/GREEN:
- RED: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  failed the new iteration organization trimming case because raw organization
  ID text reached the active-run update parameters.
- GREEN: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  (`1` file passed; `66` tests passed)

Verification:
- `npx vitest run tests/goal-run/goal-run-repository.test.ts tests/goal-run/goal-run-handlers.test.ts tests/goal-run/build-goal-context.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`4` files passed; `247` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2425`
  tests passed, `34` skipped)

- 16:25 KST - Hardened goal-run start identifier normalization:
  - `src/goal-run/goal-run-repository.ts` now trims direct organization,
    scope, and project identifiers before insertion.
  - Existing nonblank validation still rejects whitespace-only identifiers.
  - `tests/goal-run/goal-run-repository.test.ts` covers trimmed start insert
    identifier parameters.

RED/GREEN:
- RED: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  failed the new start identifier trimming case because raw organization ID
  text reached the insert parameters.
- GREEN: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  (`1` file passed; `65` tests passed)

Verification:
- `npx vitest run tests/goal-run/goal-run-repository.test.ts tests/goal-run/goal-run-handlers.test.ts tests/goal-run/build-goal-context.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`4` files passed; `246` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2424`
  tests passed, `34` skipped)

- 16:22 KST - Hardened goal-run close note normalization:
  - `src/goal-run/goal-run-repository.ts` now trims direct completion and
    abandonment notes before updating.
  - Existing nonblank validation still rejects whitespace-only notes.
  - `tests/goal-run/goal-run-repository.test.ts` covers trimmed close note
    update parameters.

RED/GREEN:
- RED: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  failed the new close note trimming case because raw note text reached the
  update parameters.
- GREEN: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  (`1` file passed; `64` tests passed)

Verification:
- `npx vitest run tests/goal-run/goal-run-repository.test.ts tests/goal-run/goal-run-handlers.test.ts tests/goal-run/build-goal-context.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`4` files passed; `245` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2423`
  tests passed, `34` skipped)

- 16:19 KST - Hardened goal-run iteration text normalization:
  - `src/goal-run/goal-run-repository.ts` now trims direct attempt, summary,
    and error text before insertion.
  - Existing nonblank validation still rejects whitespace-only attempt and
    summary text.
  - `tests/goal-run/goal-run-repository.test.ts` covers trimmed iteration
    insert parameters.

RED/GREEN:
- RED: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  failed the new iteration text trimming case because raw attempt text reached
  the insert parameters.
- GREEN: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  (`1` file passed; `63` tests passed)

Verification:
- `npx vitest run tests/goal-run/goal-run-repository.test.ts tests/goal-run/goal-run-handlers.test.ts tests/goal-run/build-goal-context.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`4` files passed; `244` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2422`
  tests passed, `34` skipped)

- 16:16 KST - Hardened goal-run start text normalization:
  - `src/goal-run/goal-run-repository.ts` now trims direct goal and
    termination criteria text before insertion.
  - Existing nonblank validation still rejects whitespace-only goal text.
  - `tests/goal-run/goal-run-repository.test.ts` covers trimmed insert
    parameters.

RED/GREEN:
- RED: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  failed the new start text trimming case because raw goal text reached the
  insert parameters.
- GREEN: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  (`1` file passed; `62` tests passed)

Verification:
- `npx vitest run tests/goal-run/goal-run-repository.test.ts tests/goal-run/goal-run-handlers.test.ts tests/goal-run/build-goal-context.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`4` files passed; `243` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2421`
  tests passed, `34` skipped)

- 16:14 KST - Hardened governance tag filter normalization:
  - `src/store/memory-repository.ts` now validates and trims direct
    `listMemoryForGovernance` tag filters before querying.
  - Whitespace-only direct tag filters fail before any query is issued.
  - `tests/store/memory-repository.test.ts` covers tag trim and blank-tag
    rejection.

RED/GREEN:
- RED: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  failed the new tag filter cases because raw tags reached query parameters
  and whitespace-only tags queried instead of failing early.
- GREEN: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `167` tests passed, `7` skipped)

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`2` files passed; `300` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2420`
  tests passed, `34` skipped)

- 16:11 KST - Hardened store nullable text normalization:
  - `src/store/memory-repository.ts` now trims nonblank nullable text values
    before persistence.
  - Blank nullable text still normalizes to `null`.
  - `tests/store/memory-repository.test.ts` covers direct `updateMemoryRecord`
    title and summary trimming before the SQL update.

RED/GREEN:
- RED: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  failed the new nullable text trimming case because raw title/summary values
  reached the update parameters.
- GREEN: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `165` tests passed, `7` skipped)

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/canonical-indexing.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`3` files passed; `374` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2418`
  tests passed, `34` skipped)

- 16:07 KST - Hardened MCP optional text normalization:
  - `src/mcp/tool-handlers.ts` now trims nonblank values returned by shared
    optional text normalization.
  - Blank optional text still normalizes to `null`.
  - `tests/mcp/server.test.ts` covers direct `update_memory` title and summary
    trimming before repository dispatch.

RED/GREEN:
- RED: `npx vitest run tests/mcp/server.test.ts --reporter=dot` failed the new
  optional text trimming case because raw title/summary values reached the
  repository update call.
- GREEN: `npx vitest run tests/mcp/server.test.ts --reporter=dot` (`1` file
  passed; `133` tests passed)

Verification:
- `npx vitest run tests/mcp/server.test.ts tests/goal-run/goal-run-handlers.test.ts tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  (`3` files passed; `218` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2417`
  tests passed, `34` skipped)

- 16:03 KST - Hardened MCP scope identifier normalization:
  - `src/mcp/tool-utils.ts` now returns trimmed project keys and user scope IDs
    from `requireProjectKey` and `requireUserScopeId`.
  - Direct MCP handler paths using these helpers now receive normalized scope
    identifiers after nonblank validation.
  - `tests/mcp/tool-utils.test.ts` covers the direct utility boundary.

RED/GREEN:
- RED: `npx vitest run tests/mcp/tool-utils.test.ts --reporter=dot` failed the
  new scope identifier trimming case because raw identifiers were returned.
- GREEN: `npx vitest run tests/mcp/tool-utils.test.ts --reporter=dot` (`1`
  file passed; `31` tests passed)

Verification:
- `npx vitest run tests/mcp/tool-utils.test.ts tests/mcp/tool-registry.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`3` files passed; `181` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2416`
  tests passed, `34` skipped)

- 16:00 KST - Hardened MCP search_memory query normalization:
  - `src/mcp/tool-handlers.ts` now trims direct `search_memory` query values
    before resolving records.
  - Handler responses echo the same normalized query value used for retrieval.
  - `tests/mcp/tool-registry.test.ts` covers the direct handler boundary.

RED/GREEN:
- RED: `npx vitest run tests/mcp/tool-registry.test.ts --reporter=dot` failed
  the new query trimming case because raw query strings reached the retrieval
  service override.
- GREEN: `npx vitest run tests/mcp/tool-registry.test.ts --reporter=dot` (`1`
  file passed; `18` tests passed)

Verification:
- `npx vitest run tests/mcp/tool-registry.test.ts tests/mcp/server.test.ts tests/search/retrieve-memory.test.ts --reporter=dot`
  (`3` files passed; `187` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2415`
  tests passed, `34` skipped)

- 15:57 KST - Hardened retrieveMemory query normalization:
  - `src/search/retrieve-memory.ts` now trims direct lexical queries before
    repository search and lexical scoring.
  - Whitespace-only direct queries now skip lexical repository search instead
    of issuing an empty search.
  - `tests/search/retrieve-memory.test.ts` covers blank and trimmed direct
    query boundaries.

RED/GREEN:
- RED: `npx vitest run tests/search/retrieve-memory.test.ts --reporter=dot`
  failed the new query normalization cases because raw query strings reached
  `repository.searchMemory`.
- GREEN: `npx vitest run tests/search/retrieve-memory.test.ts --reporter=dot`
  (`1` file passed; `37` tests passed)

Verification:
- `npx vitest run tests/search/retrieve-memory.test.ts tests/search/lexical-score.test.ts tests/search/rank-results.test.ts tests/mcp/server.test.ts tests/eval/retrieval.eval.test.ts --reporter=dot`
  (`4` files passed, `1` skipped; `202` tests passed, `1` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2414`
  tests passed, `34` skipped)

- 15:54 KST - Hardened Pg pool connection string normalization:
  - `src/db/connection.ts` now trims direct `connectionString` values before
    constructing the node-postgres pool.
  - Pool option validation and defaults remain unchanged.
  - `tests/db/connection.test.ts` covers the direct connection string trimming
    boundary.

RED/GREEN:
- RED: `npx vitest run tests/db/connection.test.ts --reporter=dot` failed the
  new trimming case because the raw connection string reached the pool
  constructor.
- GREEN: `npx vitest run tests/db/connection.test.ts --reporter=dot` (`1` file
  passed; `10` tests passed)

Verification:
- `npx vitest run tests/db/connection.test.ts tests/config/service-config.test.ts tests/app/operator-server-boundary.test.ts --reporter=dot`
  (`3` files passed; `130` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2412`
  tests passed, `34` skipped)

- 15:51 KST - Hardened Qdrant client URL validation:
  - `src/qdrant/client.ts` now rejects non-absolute and non-HTTP(S) direct URLs
    before constructing the Qdrant SDK client.
  - Direct URL and API key values are trimmed before SDK construction.
  - `tests/qdrant/client.test.ts` covers invalid URL schemes and trimmed
    values.

RED/GREEN:
- RED: `npx vitest run tests/qdrant/client.test.ts --reporter=dot` failed the
  new malformed URL and trimming cases because client construction accepted
  raw string values.
- GREEN: `npx vitest run tests/qdrant/client.test.ts --reporter=dot` (`1` file
  passed; `9` tests passed)

Verification:
- `npx vitest run tests/qdrant/client.test.ts tests/vector/qdrant-index.test.ts tests/mcp/mcp-server-construction.test.ts tests/config/service-config.test.ts --reporter=dot`
  (`4` files passed; `165` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2411`
  tests passed, `34` skipped)

- 15:47 KST - Hardened metrics label string validation:
  - `src/app/metrics.ts` now rejects blank direct HTTP route labels and blank
    dependency check names before storing/rendering metrics.
  - This prevents malformed direct observations from producing empty
    Prometheus labels.
  - `tests/app/metrics.test.ts` covers blank route and dependency check name
    reproducers.

RED/GREEN:
- RED: `npx vitest run tests/app/metrics.test.ts --reporter=dot` failed the
  new blank-label cases because metrics validators only checked string types.
- GREEN: `npx vitest run tests/app/metrics.test.ts --reporter=dot` (`1` file
  passed; `51` tests passed)

Verification:
- `npx vitest run tests/app/metrics.test.ts tests/app/server.test.ts tests/app/start-operator-server-metrics.test.ts tests/app/background-queue-metrics.test.ts --reporter=dot`
  (`4` files passed; `129` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2408`
  tests passed, `34` skipped)

- 15:44 KST - Hardened OAuth protected-resource direct string validation:
  - `src/app/oauth-protected-resource.ts` now rejects blank direct metadata
    URL, resource, authorization server, supported-scope, insufficient-scope,
    and metadata URL resource strings.
  - Challenge helpers fail before building `WWW-Authenticate` headers from
    malformed direct OAuth protected-resource config.
  - `tests/app/oauth-protected-resource.test.ts` covers blank direct metadata
    and scope strings.

RED/GREEN:
- RED: `npx vitest run tests/app/oauth-protected-resource.test.ts --reporter=dot`
  failed the new blank-string challenge config cases because helpers only
  checked types.
- GREEN: `npx vitest run tests/app/oauth-protected-resource.test.ts --reporter=dot`
  (`1` file passed; `16` tests passed)

Verification:
- `npx vitest run tests/app/oauth-protected-resource.test.ts tests/app/oauth-token-auth.test.ts tests/app/server.test.ts tests/app/mcp-http.test.ts tests/app/operator-server-boundary.test.ts --reporter=dot`
  (`5` files passed; `170` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2406`
  tests passed, `34` skipped)

- 15:41 KST - Hardened operator server direct ServiceConfig numeric validation:
  - `src/app/server.ts` now validates direct config ports as safe integers in
    the Node listen range before construction/startup.
  - Direct `port: 0` remains valid for ephemeral test servers; negative and
    out-of-range ports fail at the option boundary.
  - Direct Postgres pool `max`, `idleTimeoutMillis`, and
    `connectionTimeoutMillis` values now require positive safe integers before
    the lower-level pool constructor runs.
  - `tests/app/operator-server-boundary.test.ts` covers malformed direct port
    and pool numeric fields.

RED/GREEN:
- RED: `npx vitest run tests/app/operator-server-boundary.test.ts --reporter=dot`
  failed because malformed direct config numeric fields passed construction or
  failed later with lower-level errors.
- GREEN: `npx vitest run tests/app/operator-server-boundary.test.ts --reporter=dot`
  (`1` file passed; `46` tests passed)

Verification:
- `npx vitest run tests/app/operator-server-boundary.test.ts tests/app/start-background-workers-server.test.ts tests/app/start-operator-server-metrics.test.ts --reporter=dot`
  (`3` files passed; `51` tests passed)
- `npx vitest run tests/app/operator-server-boundary.test.ts tests/app/server.test.ts tests/config/service-config.test.ts tests/db/connection.test.ts tests/app/start-background-workers-server.test.ts tests/app/start-operator-server-metrics.test.ts --reporter=dot`
  (`6` files passed; `201` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2406`
  tests passed, `34` skipped)

- 15:36 KST - Hardened rate limiter decision validation:
  - `src/app/middleware/rate-limit.ts` now exports
    `assertRateLimitDecision` for direct/injected limiter decisions.
  - HTTP and MCP HTTP handlers validate `allowed`, `remaining`, and
    `retryAfterMs` immediately after `rateLimiter.check()` returns.
  - Malformed limiter decisions now fail before handlers write invalid
    `Retry-After` headers.
  - `tests/app/rate-limit.test.ts` and
    `tests/app/mcp-http-boundary.test.ts` cover malformed decision objects and
    invalid retry-after values.

RED/GREEN:
- RED: `npx vitest run tests/app/rate-limit.test.ts --reporter=dot` failed
  because `assertRateLimitDecision` did not exist.
- RED: `npx vitest run tests/app/mcp-http-boundary.test.ts --reporter=dot`
  failed because malformed `retryAfterMs` was accepted.
- GREEN: `npx vitest run tests/app/rate-limit.test.ts --reporter=dot` (`1`
  file passed; `35` tests passed)
- GREEN: `npx vitest run tests/app/mcp-http-boundary.test.ts --reporter=dot`
  (`1` file passed; `17` tests passed)

Verification:
- `npx vitest run tests/app/rate-limit.test.ts tests/app/mcp-http-boundary.test.ts tests/app/mcp-http.test.ts tests/app/server.test.ts tests/app/operator-server-boundary.test.ts --reporter=dot`
  (`5` files passed; `177` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2398`
  tests passed, `34` skipped)

- 15:33 KST - Hardened OAuth verifier result validation:
  - `src/app/middleware/bearer-auth.ts` now validates OAuth verifier fallback
    results before treating them as authenticated bearer tokens.
  - Returned verifier tokens must be non-blank strings; optional
    `organizationId` values must be non-blank strings; optional `scopes` must
    be arrays of strings.
  - Valid OAuth matches still use the actual presented bearer token and
    `authType: "oauth"` after validation.
  - `tests/app/bearer-auth.test.ts` covers malformed verifier result token,
    organization, and scopes values.

RED/GREEN:
- RED: `npx vitest run tests/app/bearer-auth.test.ts --reporter=dot`
  failed the new malformed verifier result cases because fallback results were
  accepted without validation.
- GREEN: `npx vitest run tests/app/bearer-auth.test.ts --reporter=dot`
  (`1` file passed; `33` tests passed)

Verification:
- `npx vitest run tests/app/bearer-auth.test.ts tests/app/oauth-token-auth.test.ts tests/app/mcp-http.test.ts tests/app/server.test.ts tests/app/mcp-http-boundary.test.ts tests/app/operator-server-boundary.test.ts --reporter=dot`
  (`6` files passed; `195` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2390`
  tests passed, `34` skipped)

- 15:29 KST - Hardened MCP HTTP direct bearer token validation:
  - `src/app/mcp-http.ts` now validates each direct `bearerTokens` entry is an
    object with a non-blank token and, when provided, a non-blank organization
    binding.
  - Malformed static token entries now fail during `handleMcpHttpRequest`
    option validation instead of reaching token digest/authentication logic.
  - `tests/app/mcp-http-boundary.test.ts` covers malformed direct token
    entries, token scalar types, blank tokens, and malformed org bindings.

RED/GREEN:
- RED: `npx vitest run tests/app/mcp-http-boundary.test.ts --reporter=dot`
  failed the new direct bearer token cases because token entries were not
  validated.
- GREEN: `npx vitest run tests/app/mcp-http-boundary.test.ts --reporter=dot`
  (`1` file passed; `16` tests passed)

Verification:
- `npx vitest run tests/app/mcp-http-boundary.test.ts tests/app/mcp-http.test.ts tests/app/server.test.ts tests/app/bearer-auth.test.ts tests/app/operator-server-boundary.test.ts --reporter=dot`
  (`5` files passed; `169` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2385`
  tests passed, `34` skipped)

- 15:27 KST - Hardened operator server direct bearer token validation:
  - `src/app/server.ts` now rejects blank direct `bearerTokens` string entries
    and blank `BearerToken.token` / `BearerToken.organizationId` values before
    operator server construction or startup.
  - Direct token normalization now trims injected token and organization values
    to match the env-derived token parser.
  - `tests/app/operator-server-boundary.test.ts` covers malformed direct token
    strings and blank org bindings for both `createOperatorServer` and
    `startOperatorServer`.

RED/GREEN:
- RED: `npx vitest run tests/app/operator-server-boundary.test.ts --reporter=dot`
  failed the new direct bearer token cases because blank token/org values
  passed option validation.
- GREEN: `npx vitest run tests/app/operator-server-boundary.test.ts --reporter=dot`
  (`1` file passed; `38` tests passed)

Verification:
- `npx vitest run tests/app/operator-server-boundary.test.ts tests/app/server.test.ts tests/app/bearer-auth.test.ts tests/app/mcp-http.test.ts tests/app/mcp-http-boundary.test.ts --reporter=dot`
  (`5` files passed; `164` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check`
- `npm test -- --reporter=dot` (`82` files passed, `1` skipped; `2380`
  tests passed, `34` skipped)

- Hardened vector upsert point entry validation:
  - `src/vector/organization-id.ts` now validates each upsert `VectorPoint`
    entry is an object before reading `point.payload`.
  - Null point entries now fail with a clear adapter boundary error instead of
    an incidental property-access TypeError.
  - Qdrant and pgvector tests cover null upsert point entries with mocked
    clients.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new point entry cases because both adapters hit an incidental
  `Cannot read properties of null` error while reading point payloads.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`2` files passed; `133` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/organization-id.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/organization-id.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
  (`7` files passed; `311` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2150` tests passed,
  `34` skipped)

- Hardened vector upsert payload object validation:
  - `src/vector/organization-id.ts` now validates each upsert
    `VectorPoint.payload` is an object before reading `payload.organization_id`.
  - Null payloads now fail with a clear adapter boundary error instead of an
    incidental property-access TypeError.
  - Qdrant and pgvector tests cover null upsert payloads with mocked clients.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new payload cases because both adapters hit an incidental
  `Cannot read properties of null` error while reading organization metadata.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`2` files passed; `131` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/organization-id.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/organization-id.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
  (`7` files passed; `309` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2148` tests passed,
  `34` skipped)

- Hardened vector upsert kind validation:
  - `src/vector/qdrant-index.ts` and `src/vector/pgvector-index.ts` now
    validate upsert `payload.kind` values as non-empty strings before calling
    storage clients.
  - Missing and blank kind values now fail with clear adapter boundary errors
    instead of reaching Qdrant or SQL.
  - Qdrant and pgvector tests cover malformed upsert kind values with mocked
    clients.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new upsert kind cases because Qdrant accepted malformed payloads
  and pgvector continued into the SQL client path.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`2` files passed; `129` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
  (`6` files passed; `303` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2146` tests passed,
  `34` skipped)

- Hardened vector upsert project key validation:
  - `src/vector/qdrant-index.ts` and `src/vector/pgvector-index.ts` now
    validate upsert `payload.project_key` values before calling storage
    clients.
  - `null` remains valid, while missing, non-string, and blank project keys now
    fail with clear adapter boundary errors instead of reaching Qdrant or SQL.
  - Qdrant and pgvector tests cover malformed upsert project keys with mocked
    clients.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new upsert project key cases because Qdrant accepted malformed
  payloads and pgvector continued into the SQL client path.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`2` files passed; `125` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
  (`6` files passed; `299` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2142` tests passed,
  `34` skipped)

- Hardened vector upsert scope type validation:
  - `src/vector/qdrant-index.ts` and `src/vector/pgvector-index.ts` now
    validate upsert `payload.scope_type` values as non-empty strings before
    calling storage clients.
  - Missing and blank scope types now fail with clear adapter boundary errors
    instead of reaching Qdrant or SQL.
  - Qdrant and pgvector tests cover malformed upsert scope types with mocked
    clients.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new upsert scope type cases because Qdrant accepted malformed
  payloads and pgvector continued into the SQL client path.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`2` files passed; `119` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
  (`6` files passed; `293` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2136` tests passed,
  `34` skipped)

- Hardened vector upsert record id validation:
  - `src/vector/qdrant-index.ts` and `src/vector/pgvector-index.ts` now
    validate upsert `payload.memory_record_id` values as positive safe
    integers before calling storage clients.
  - Missing, zero, and fractional record ids now fail with clear adapter
    boundary errors instead of reaching Qdrant or SQL.
  - Qdrant and pgvector tests cover malformed upsert record ids with mocked
    clients.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new upsert record id cases because Qdrant accepted malformed
  payloads and pgvector continued into the SQL client path.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`2` files passed; `115` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
  (`6` files passed; `289` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2132` tests passed,
  `34` skipped)

- Hardened vector point required metadata validation:
  - `src/vector/point-builder.ts` now validates `kind`, `durability`,
    `updatedAt`, and `embeddingVersion` as non-empty strings before building
    vector payloads.
  - Existing missing/non-string type errors stay unchanged, while blank
    required metadata now fails at the builder boundary.
  - `tests/vector/point-builder.test.ts` covers blank required metadata values.

RED/GREEN:
- RED: `npx vitest run tests/vector/point-builder.test.ts --reporter=dot`
  failed the new blank required metadata cases because `buildVectorPoint`
  accepted blank `kind`, `durability`, `updatedAt`, and `embeddingVersion`
  values.
- GREEN: `npx vitest run tests/vector/point-builder.test.ts --reporter=dot`
  (`1` file passed; `32` tests passed)

Verification plan:
- `npx vitest run tests/vector/point-builder.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts tests/compact/unarchive-compaction.test.ts tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/point-builder.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts tests/compact/unarchive-compaction.test.ts tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`6` files passed; `276` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2126` tests passed,
  `34` skipped)

- Hardened vector point scope metadata validation:
  - `src/vector/point-builder.ts` now validates `scopeType`, `scopeId`, and
    non-null `projectKey` as non-empty strings before building vector payloads.
  - `projectKey: null` still preserves the existing no-project-key payload
    behavior, while blank project keys now fail at the builder boundary.
  - `tests/vector/point-builder.test.ts` covers blank scope metadata values.

RED/GREEN:
- RED: `npx vitest run tests/vector/point-builder.test.ts --reporter=dot`
  failed the new blank metadata cases because `buildVectorPoint` accepted
  blank `scopeType`, `scopeId`, and `projectKey` values.
- GREEN: `npx vitest run tests/vector/point-builder.test.ts --reporter=dot`
  (`1` file passed; `28` tests passed)

Verification plan:
- `npx vitest run tests/vector/point-builder.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts tests/compact/unarchive-compaction.test.ts tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/point-builder.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts tests/compact/unarchive-compaction.test.ts tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`6` files passed; `272` tests passed, `12` skipped)
- Initial `npm run typecheck` and `npm run build` caught missing TypeScript
  assertion narrowing in the new helper; adding assertion signatures fixed it.
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2122` tests passed,
  `34` skipped)

- Hardened vector query filter project key validation:
  - `src/vector/qdrant-index.ts` and `src/vector/pgvector-index.ts` now
    validate optional query `filter.projectKey` values before calling storage
    clients.
  - `null` and `undefined` still use the existing scope_id fallback path, while
    non-string and blank string project keys now fail with clear adapter
    boundary errors.
  - Qdrant and pgvector tests cover malformed project keys with mocked clients.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new project key cases because Qdrant queried successfully and
  pgvector continued into the SQL client path.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`2` files passed; `109` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`3` files passed; `144` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2119` tests passed,
  `34` skipped)

- Hardened vector query filter scope entry validation:
  - `src/vector/qdrant-index.ts` and `src/vector/pgvector-index.ts` now
    validate each query `filter.scopes` entry has non-empty `scopeType` and
    `scopeId` strings before calling storage clients.
  - Invalid non-object scopes, blank `scopeType`, or blank `scopeId` now fail
    with clear adapter boundary errors.
  - Qdrant and pgvector tests cover malformed scope entries with mocked
    clients.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new scope entry cases because Qdrant produced incidental errors
  or queried successfully, while pgvector continued into the SQL client path.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`2` files passed; `105` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`3` files passed; `140` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2115` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened vector query filter scopes validation:
  - `src/vector/qdrant-index.ts` and `src/vector/pgvector-index.ts` now
    validate query `filter.scopes` values are arrays before calling storage
    clients.
  - Invalid non-array scopes now fail with clear adapter boundary errors
    instead of incidental iterable or client-path failures.
  - Qdrant and pgvector tests cover malformed `filter.scopes` values with
    mocked clients.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new filter scopes cases because Qdrant threw an incidental
  iterable error and pgvector continued into the SQL client path.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`2` files passed; `99` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`3` files passed; `134` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2109` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened vector collection dimension validation:
  - `src/vector/qdrant-index.ts` and `src/vector/pgvector-index.ts` now
    validate `ensureCollection(dimensions)` values are positive safe integers
    before calling storage clients.
  - Invalid zero, fractional, or `NaN` dimensions now fail with clear adapter
    boundary errors instead of reaching Qdrant or SQL.
  - Qdrant and pgvector tests cover malformed dimensions with mocked clients.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new dimensions cases because both adapters continued into storage
  bootstrap paths before validating dimensions.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`2` files passed; `97` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`3` files passed; `132` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2107` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened vector delete point ID validation:
  - `src/vector/qdrant-index.ts` and `src/vector/pgvector-index.ts` now
    validate `delete(ids)` point IDs are non-empty strings before calling
    storage clients.
  - Invalid empty or blank delete IDs now fail with clear adapter boundary
    errors instead of reaching Qdrant or SQL.
  - Qdrant and pgvector tests cover malformed delete IDs with mocked clients.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new delete ID cases because both adapters allowed invalid IDs to
  reach storage clients and resolved successfully.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`2` files passed; `91` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`3` files passed; `126` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2101` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened Qdrant upsert point ID validation:
  - `src/vector/qdrant-index.ts` now validates point IDs are non-empty strings
    before calling the Qdrant client.
  - Invalid empty or blank point IDs now fail with a clear adapter boundary
    error instead of being sent to Qdrant.
  - `tests/vector/qdrant-index.test.ts` covers malformed point IDs with a
    mocked client.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  failed the new point ID cases because the adapter allowed invalid IDs to
  reach the Qdrant client and resolved successfully.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  (`1` file passed; `45` tests passed)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`3` files passed; `122` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2097` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened pgvector upsert point ID validation:
  - `src/vector/pgvector-index.ts` now validates point IDs are non-empty
    strings before opening a database client.
  - Invalid empty or blank point IDs now fail with a clear adapter boundary
    error instead of reaching SQL.
  - `tests/vector/pgvector-index.integration.test.ts` covers malformed point
    IDs with a mocked pool.

RED/GREEN:
- RED: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new point ID cases because the adapter continued into the SQL
  client path instead of failing at the adapter boundary.
- GREEN: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`1` file passed; `42` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
  (`3` files passed; `120` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2095` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened pgvector deleteByRecordIds validation:
  - `src/vector/pgvector-index.ts` now validates `recordIds` are positive safe
    integers before sending pgvector delete SQL.
  - Invalid zero, fractional, or `NaN` record IDs now fail with a clear adapter
    boundary error instead of reaching SQL.
  - `tests/vector/pgvector-index.integration.test.ts` covers malformed record
    IDs with a mocked pool.

RED/GREEN:
- RED: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new record ID cases because the adapter sent invalid IDs to SQL
  and resolved successfully.
- GREEN: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`1` file passed; `40` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
  (`3` files passed; `118` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2093` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened Qdrant deleteByRecordIds validation:
  - `src/vector/qdrant-index.ts` now validates `recordIds` are positive safe
    integers before building Qdrant delete filters.
  - Invalid zero, fractional, or `NaN` record IDs now fail with a clear adapter
    boundary error instead of being sent to Qdrant.
  - `tests/vector/qdrant-index.test.ts` covers malformed record IDs with a
    mocked client.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  failed the new record ID cases because the adapter allowed invalid IDs to
  reach the Qdrant client and resolved successfully.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  (`1` file passed; `43` tests passed)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`3` files passed; `115` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2090` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened Qdrant upsert vector validation:
  - `src/vector/qdrant-index.ts` now validates upsert vectors are non-empty
    and finite before calling the Qdrant client.
  - Invalid empty, `NaN`, or `Infinity` vectors now fail with clear adapter
    boundary errors instead of being sent to Qdrant.
  - `tests/vector/qdrant-index.test.ts` covers malformed upsert vectors with a
    mocked client.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  failed the new upsert-vector cases because the adapter allowed invalid
  points to reach the Qdrant client and resolved successfully.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  (`1` file passed; `40` tests passed)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`3` files passed; `112` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2087` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened Qdrant query limit validation:
  - `src/vector/qdrant-index.ts` now validates query `limit` values are
    positive safe integers before calling the Qdrant client.
  - Invalid zero or fractional limits now fail with a clear adapter boundary
    error instead of being sent to Qdrant.
  - `tests/vector/qdrant-index.test.ts` covers malformed limits with a mocked
    client.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  failed the new limit cases because the adapter resolved empty results after
  calling the Qdrant client.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  (`1` file passed; `37` tests passed)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`3` files passed; `109` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2084` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened Qdrant query vector validation:
  - `src/vector/qdrant-index.ts` now validates query vectors are non-empty and
    finite before calling the Qdrant client.
  - Invalid empty or `NaN` query vectors now fail with clear adapter boundary
    errors instead of being sent to Qdrant.
  - `tests/vector/qdrant-index.test.ts` covers malformed query vectors with a
    mocked client.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  failed the new query-vector cases because the adapter resolved empty results
  after calling the Qdrant client.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  (`1` file passed; `35` tests passed)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`3` files passed; `107` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2082` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened pgvector query limit validation:
  - `src/vector/pgvector-index.ts` now validates query `limit` values are
    positive safe integers before opening a database client.
  - Invalid zero or fractional limits now fail with a clear adapter boundary
    error instead of reaching pgvector SQL.
  - `tests/vector/pgvector-index.integration.test.ts` covers malformed limits
    with a mocked pool.

RED/GREEN:
- RED: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new limit cases because validation happened after the adapter
  tried to open/use a database client.
- GREEN: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`1` file passed; `37` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
  (`3` files passed; `105` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2080` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened pgvector query vector validation:
  - `src/vector/pgvector-index.ts` now validates query vectors are non-empty
    and finite before opening a database client.
  - Invalid empty or `NaN` query vectors now fail with clear adapter boundary
    errors instead of reaching pgvector SQL as malformed vector literals.
  - `tests/vector/pgvector-index.integration.test.ts` covers malformed query
    vectors with a mocked pool.

RED/GREEN:
- RED: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new query-vector cases because validation happened after the
  adapter tried to open/use a database client.
- GREEN: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`1` file passed; `35` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
  (`3` files passed; `103` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2078` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened pgvector upsert vector component validation:
  - `src/vector/pgvector-index.ts` now validates every upsert vector component
    as a finite number before opening a database client.
  - Invalid `NaN` or `Infinity` values now fail with a clear adapter boundary
    error instead of reaching pgvector SQL as malformed vector literals.
  - `tests/vector/pgvector-index.integration.test.ts` covers non-finite vector
    components with a mocked pool.

RED/GREEN:
- RED: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new vector-component cases because validation happened after the
  adapter tried to open/use a database client.
- GREEN: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`1` file passed; `33` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
  (`3` files passed; `101` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2076` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened pgvector query nullable string payload mapping:
  - `src/vector/pgvector-index.ts` now validates nullable string payload fields
    before returning backend-neutral `VectorHit` payloads.
  - Malformed non-string scalar metadata now fails with clear adapter boundary
    errors instead of leaking into `VectorHit.payload`.
  - `tests/vector/pgvector-index.integration.test.ts` covers malformed `kind`
    and `updated_at` values with a mocked pool.

RED/GREEN:
- RED: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new nullable-string cases because the adapter resolved hits with
  malformed scalar metadata.
- GREEN: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`1` file passed; `31` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
  (`3` files passed; `99` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2074` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened pgvector query organization id mapping:
  - `src/vector/pgvector-index.ts` now validates query row `organization_id`
    values before returning backend-neutral `VectorHit` payloads.
  - Malformed null or whitespace-only organization ids now fail with a clear
    adapter boundary error instead of leaking invalid org metadata.
  - `tests/vector/pgvector-index.integration.test.ts` covers malformed
    organization ids with a mocked pool.

RED/GREEN:
- RED: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new organization-id cases because the adapter resolved hits with
  malformed `payload.organization_id`.
- GREEN: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`1` file passed; `29` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
  (`3` files passed; `97` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2072` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened pgvector query tags mapping:
  - `src/vector/pgvector-index.ts` now validates query row `tags` values before
    returning backend-neutral `VectorHit` payloads.
  - `null` tags still map to `[]`, while non-array tags or non-string tag
    entries now fail with clear adapter boundary errors.
  - `tests/vector/pgvector-index.integration.test.ts` covers malformed tags
    with a mocked pool.

RED/GREEN:
- RED: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new tags cases because the adapter resolved hits with malformed
  `payload.tags`.
- GREEN: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`1` file passed; `27` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
  (`3` files passed; `95` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2070` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened pgvector query point id mapping:
  - `src/vector/pgvector-index.ts` now validates query row `point_id` values
    before returning backend-neutral `VectorHit` objects.
  - Malformed null or whitespace-only point ids now fail with a clear adapter
    boundary error instead of leaking invalid hit ids.
  - `tests/vector/pgvector-index.integration.test.ts` covers malformed point ids
    with a mocked pool.

RED/GREEN:
- RED: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new point-id cases because the adapter resolved hits with
  `id: null` or blank ids.
- GREEN: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`1` file passed; `25` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
  (`3` files passed; `93` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2068` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened pgvector query row object shape mapping:
  - `src/vector/pgvector-index.ts` now validates each query result row object
    before reading vector-hit fields.
  - Malformed row entries now fail with a clear adapter boundary error instead
    of an incidental field-access TypeError.
  - `tests/vector/pgvector-index.integration.test.ts` covers malformed rows
    with a mocked pool.

RED/GREEN:
- RED: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new query-row test with `Cannot read properties of null (reading
  'point_id')`.
- GREEN: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`1` file passed; `23` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
  (`3` files passed; `91` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2066` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened pgvector query rows shape mapping:
  - `src/vector/pgvector-index.ts` now validates query result `rows` before
    mapping backend-neutral `VectorHit` objects.
  - Malformed non-array row lists now fail with a clear adapter boundary error
    instead of an incidental `.map` TypeError.
  - `tests/vector/pgvector-index.integration.test.ts` covers non-array rows
    with a mocked pool.

RED/GREEN:
- RED: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed the new query-rows test with `Cannot read properties of null (reading
  'map')`.
- GREEN: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`1` file passed; `22` tests passed, `12` skipped)

Verification plan:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
  (`3` files passed; `90` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2065` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened Qdrant collection-exists shape mapping:
  - `src/vector/qdrant-index.ts` now validates Qdrant `collectionExists`
    responses before deciding whether to create the collection.
  - Malformed non-boolean `exists` values now fail with a clear adapter
    boundary error instead of silently skipping collection creation.
  - `tests/vector/qdrant-index.test.ts` covers malformed `exists` values.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  failed the new collection-exists test because `exists: "false"` resolved and
  skipped the create decision.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  (`1` file passed; `33` tests passed)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/mcp/mcp-server-construction.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/mcp/mcp-server-construction.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`3` files passed; `61` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2064` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened Qdrant point object shape mapping:
  - `src/vector/qdrant-index.ts` now validates each Qdrant query point object
    before reading `id`, `score`, or `payload`.
  - Malformed point entries now fail with a clear adapter boundary error
    instead of an incidental field-access TypeError.
  - `tests/vector/qdrant-index.test.ts` covers malformed point objects.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  failed the new point-object test with `Cannot read properties of null
  (reading 'id')`.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  (`1` file passed; `32` tests passed)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`3` files passed; `88` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2063` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened Qdrant query response shape mapping:
  - `src/vector/qdrant-index.ts` now validates Qdrant query responses as
    objects before reading `points`.
  - Malformed non-object query responses now fail with a clear adapter boundary
    error instead of an incidental property-access TypeError.
  - `tests/vector/qdrant-index.test.ts` covers malformed query responses.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  failed the new query-response test with `Cannot read properties of null
  (reading 'points')`.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  (`1` file passed; `31` tests passed)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`3` files passed; `87` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2062` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened Qdrant point list shape mapping:
  - `src/vector/qdrant-index.ts` now validates Qdrant query response `points`
    before mapping backend-neutral `VectorHit` objects.
  - Malformed non-array point lists now fail with a clear adapter boundary
    error instead of an incidental `.map` TypeError.
  - `tests/vector/qdrant-index.test.ts` covers non-array point-list responses.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  failed the new point-list test with `Cannot read properties of null (reading
  'map')`.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  (`1` file passed; `30` tests passed)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`3` files passed; `86` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2061` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened Qdrant payload shape mapping:
  - `src/vector/qdrant-index.ts` now excludes array payload values when mapping
    Qdrant query points to backend-neutral `VectorHit` objects.
  - Malformed array payloads now follow the existing empty-payload fallback
    instead of escaping as `Record<string, unknown>` values.
  - `tests/vector/qdrant-index.test.ts` covers array payload responses.

RED/GREEN:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  failed the new array-payload test because the adapter returned the array as
  `payload`.
- GREEN: `npx vitest run tests/vector/qdrant-index.test.ts --reporter=dot`
  (`1` file passed; `29` tests passed)

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`3` files passed; `85` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2060` tests passed,
  `34` skipped)
- `git diff --check`

- Hardened lexical record shape validation:
  - `src/search/lexical-score.ts` now treats arrays as malformed records rather
    than generic objects.
  - `scoreLexicalMatch` now rejects array `source` values before scoring.
  - `tests/search/lexical-score.test.ts` covers array record and source inputs.

Verification:
- `npx vitest run tests/search/lexical-score.test.ts tests/search/retrieve-memory.test.ts --reporter=dot`
  (`2` files passed; `45` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2059` tests passed, `34` skipped)
- `git diff --check`

- Hardened repository result shape in retrieval:
  - `src/search/retrieve-memory.ts` now checks hydrated
    `getMemoryRecordsByIds` results are arrays before ranking.
  - Lexical `searchMemory` results now get the same array boundary check before
    they are merged with hydrated vector records.
  - Malformed repository implementations now fail with clear boundary errors
    instead of incidental spread/type failures.
  - `tests/search/retrieve-memory.test.ts` covers non-array hydrated and lexical
    repository results.

Verification:
- `npx vitest run tests/search/retrieve-memory.test.ts tests/search/rank-results.test.ts --reporter=dot`
  (`2` files passed; `58` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2059` tests passed, `34` skipped)
- `git diff --check`

- Hardened vector query result shape in retrieval:
  - `src/search/retrieve-memory.ts` now checks that each `VectorIndex.query`
    result is an array before hydration.
  - Malformed custom vector-index implementations now fail with a clear
    boundary error instead of an incidental spread/type failure.
  - `tests/search/retrieve-memory.test.ts` covers non-array vector query
    results and verifies hydration is not called afterward.

Verification:
- `npx vitest run tests/search/retrieve-memory.test.ts tests/search/rank-results.test.ts tests/vector/qdrant-index.test.ts --reporter=dot`
  (`3` files passed; `84` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2057` tests passed, `34` skipped)
- `git diff --check`

- Hardened vector hit score handling in retrieval:
  - `src/search/retrieve-memory.ts` now validates vector hit scores as finite
    numbers before building vector score maps for ranking.
  - Invalid memory record IDs still get ignored before hydration, preserving
    the existing bad-payload behavior.
  - Valid vector hit payloads with malformed scores now fail before ranking
    instead of being hidden by later score clamping.
  - `tests/search/retrieve-memory.test.ts` covers non-finite vector hit scores.

Verification:
- `npx vitest run tests/search/retrieve-memory.test.ts tests/search/rank-results.test.ts tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`4` files passed; `104` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2056` tests passed, `34` skipped)
- `git diff --check`

- Hardened ranking candidate source and reasons:
  - `src/search/rank-results.ts` now validates candidate `source` before
    sorting candidates passed to `rankCandidates`.
  - Candidate `reasons` must now be an array of strings, so returned candidates
    cannot carry malformed ranking metadata.
  - `assertOptionalCandidateSource` now reuses the required candidate source
    validator, keeping score options and candidates on the same source enum.
  - `tests/search/rank-results.test.ts` covers malformed candidate source and
    non-string reason entries.

Verification:
- `npx vitest run tests/search/rank-results.test.ts tests/search/retrieve-memory.test.ts --reporter=dot`
  (`2` files passed; `54` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2055` tests passed, `34` skipped)
- `git diff --check`

- Hardened ranking candidate score components:
  - `src/search/rank-results.ts` now validates `vector`, `lexical`, `scope`,
    `metadata`, `recency`, and `total` score components on candidates passed to
    `rankCandidates`.
  - Optional `vector` and `lexical` score components still remain optional, but
    fail when present with malformed non-finite values.
  - Required score components now fail before sorting when missing or malformed,
    so returned candidates cannot carry invalid score details.
  - `tests/search/rank-results.test.ts` covers malformed required and optional
    candidate score components.

Verification:
- `npx vitest run tests/search/rank-results.test.ts tests/search/retrieve-memory.test.ts --reporter=dot`
  (`2` files passed; `54` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2055` tests passed, `34` skipped)
- `git diff --check`

- Hardened ranking normalized score inputs:
  - `src/search/rank-results.ts` now validates `vectorScore` and `lexicalScore`
    as unit-interval values before ranking.
  - `vectorScore` and `lexicalScore` now multiply the validated normalized score
    directly instead of clamping bad inputs to `0..1`.
  - `assertFiniteNumber` is now a TypeScript assertion helper so unit-score
    range checks remain type-safe after runtime validation.
  - `tests/search/rank-results.test.ts` covers negative and greater-than-one
    score options.

Verification:
- `npx vitest run tests/search/rank-results.test.ts tests/search/retrieve-memory.test.ts tests/search/lexical-score.test.ts --reporter=dot`
  (`3` files passed; `64` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2055` tests passed, `34` skipped)
- `git diff --check`

- Hardened Qdrant vector point ID mapping:
  - `src/vector/qdrant-index.ts` now validates Qdrant query result point IDs
    before returning `VectorHit[]`.
  - Numeric Qdrant point IDs still coerce to strings for the existing
    backend-neutral `VectorHit.id` contract.
  - Malformed missing or invalid point IDs now fail at the vector adapter
    boundary instead of becoming strings like `"undefined"`.
  - `tests/vector/qdrant-index.test.ts` covers numeric-ID coercion and malformed
    ID rejection.

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/search/retrieve-memory.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `84` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2055` tests passed, `34` skipped)
- `git diff --check`

- Hardened Qdrant vector score mapping:
  - `src/vector/qdrant-index.ts` now validates each Qdrant query result score
    as a finite number before returning a `VectorHit`.
  - `tests/vector/qdrant-index.test.ts` now covers malformed non-finite scores,
    keeping invalid vector backend responses from reaching search ranking.
  - The pgvector adapter already validates query row scores; this aligns the
    Qdrant adapter with that fail-closed boundary without changing score range
    semantics.

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/search/retrieve-memory.test.ts tests/search/rank-results.test.ts --reporter=dot`
  (`4` files passed; `101` tests passed, `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2053` tests passed, `34` skipped)
- `git diff --check`

- Switched dependency probe durations to monotonic time:
  - `src/health/check-dependencies.ts` now measures probe durations with
    `process.hrtime.bigint()` instead of `Date.now()` differences, preventing
    negative `/readyz` dependency metric durations when wall-clock time moves
    backward.
  - `tests/health/check-dependencies.test.ts` now covers a backward
    `Date.now()` sequence while asserting the reported probe duration remains
    non-negative.
  - Source checked: `/readyz` stores dependency reports in the metrics
    registry, whose duration validation now rejects negative durations.

Verification plan:
- `npx vitest run tests/health/check-dependencies.test.ts tests/app/metrics.test.ts tests/app/server.test.ts tests/app/start-operator-server-metrics.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/health/check-dependencies.test.ts tests/app/metrics.test.ts tests/app/server.test.ts tests/app/start-operator-server-metrics.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`147` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2052` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded metrics registry duration observations:
  - `src/app/metrics.ts` now validates HTTP, sweeper, and dependency metric
    durations as non-negative finite numbers instead of clamping negative
    values to zero during aggregation or rendering.
  - `tests/app/metrics.test.ts` now covers negative HTTP request, sweeper
    tick, and dependency check durations while preserving positive fractional
    duration samples.
  - Source checked: HTTP and sweeper durations come from monotonic
    `process.hrtime.bigint()` deltas, and dependency durations come from
    `Date.now()` deltas, so valid runtime paths already produce non-negative
    values.

Verification plan:
- `npx vitest run tests/app/metrics.test.ts tests/app/server.test.ts tests/health/check-dependencies.test.ts tests/compact/sweeper-loop.test.ts tests/compact/ingest-sweeper-loop.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/app/metrics.test.ts tests/app/server.test.ts tests/health/check-dependencies.test.ts tests/compact/sweeper-loop.test.ts tests/compact/ingest-sweeper-loop.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`191` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2051` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded HTTP metrics status code labels:
  - `src/app/metrics.ts` now validates HTTP request metric `statusCode`
    observations as safe integers in the `100..599` range before rendering
    status labels.
  - `tests/app/metrics.test.ts` now covers `NaN`, fractional, low, and high
    status code observations.
  - Source checked: `startOperatorServer` records `res.statusCode` after the
    response finishes, so valid server traffic remains unchanged while direct
    malformed metric observations fail closed.

Verification plan:
- `npx vitest run tests/app/metrics.test.ts tests/app/server.test.ts tests/app/start-operator-server-metrics.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/app/metrics.test.ts tests/app/server.test.ts tests/app/start-operator-server-metrics.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`120` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2048` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded metrics registry sweeper row counters:
  - `src/app/metrics.ts` now validates known sweeper row outcome counters as
    non-negative safe integers instead of clamping negative values or accepting
    fractional values.
  - `tests/app/metrics.test.ts` now covers infinite, `NaN`, negative,
    fractional, and unsafe integer sweeper row counts.
  - Source checked: compaction and ingest sweeper loops emit row counts from
    `runOutboxSweep` and `runIngestSweep` results, while `durationSeconds`
    remains a finite float metric.

Verification plan:
- `npx vitest run tests/app/metrics.test.ts tests/compact/sweeper-loop.test.ts tests/compact/ingest-sweeper-loop.test.ts tests/app/start-operator-server-metrics.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/app/metrics.test.ts tests/compact/sweeper-loop.test.ts tests/compact/ingest-sweeper-loop.test.ts tests/app/start-operator-server-metrics.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`96` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2045` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded metrics registry background queue backlog counts:
  - `src/app/metrics.ts` now validates rendered background queue backlog row
    counts as non-negative safe integers instead of clamping negative values
    or truncating fractional values.
  - `tests/app/metrics.test.ts` now covers `NaN`, negative, fractional, and
    unsafe integer backlog count snapshots.
  - Source checked: `createBackgroundQueueMetricsCollector` already maps
    database `COUNT(*)` rows through non-negative safe-integer validation, so
    the metrics registry now enforces the same contract at its render boundary.

Verification plan:
- `npx vitest run tests/app/metrics.test.ts tests/app/background-queue-metrics.test.ts tests/app/start-operator-server-metrics.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/app/metrics.test.ts tests/app/background-queue-metrics.test.ts tests/app/start-operator-server-metrics.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`55` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2041` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded pgvector memory record id row mapping:
  - `src/vector/pgvector-index.ts` now maps query payload
    `memory_record_id` through positive safe-integer validation while leaving
    similarity `score` on finite-number validation.
  - `tests/vector/pgvector-index.integration.test.ts` now covers zero,
    fractional, boolean, and array `memory_record_id` rows through the
    existing mock-pool query path.
  - Source checked: pgvector stores `memory_record_id` in a `BIGINT` payload
    column and node-postgres returns that value as a string, so conversion
    remains necessary but must reject non-id values.

Verification plan:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`52` tests passed, `12` skipped)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2038` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded background queue count row mapping:
  - `src/app/background-queue-metrics.ts` now maps `COUNT(*)` rows as
    non-negative safe integers instead of truncating fractional values or
    clamping negatives to zero.
  - `tests/app/background-queue-metrics.test.ts` now covers nonnumeric,
    negative, fractional, and `NaN` count rows while preserving the existing
    missing/null count fallback to zero.
  - Source checked: background queue metrics read `COUNT(*)` from
    `ingest_jobs` and `memory_archive`, with supporting indexes documented in
    migration `015_background_queue_metrics_indexes.sql`.

Verification plan:
- `npx vitest run tests/app/background-queue-metrics.test.ts tests/app/metrics.test.ts tests/app/start-operator-server-metrics.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/app/background-queue-metrics.test.ts tests/app/metrics.test.ts tests/app/start-operator-server-metrics.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`52` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2036` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded memory archive importance row mapping:
  - `src/store/memory-archive-repository.ts` now maps archived memory
    `importance` through Postgres integer validation before returning archive
    lookup rows to the unarchive flow.
  - `tests/store/memory-archive-repository.test.ts` now covers malformed
    fractional, out-of-range, and nonnumeric archive importance rows through
    mock-pool lookup coverage.
  - Source checked: `memory_archive.importance` is an `INTEGER` column in
    migration `005_add_compaction_archive.sql`, matching
    `memory_records.importance` in migration `001_initial.sql`.

Verification plan:
- `npx vitest run tests/store/memory-archive-repository.test.ts tests/store/memory-repository.test.ts tests/store/db-utils.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/memory-archive-repository.test.ts tests/store/memory-repository.test.ts tests/store/db-utils.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`206` tests passed, `7` skipped)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2033` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded compaction run row mapping:
  - `src/store/memory-archive-repository.ts` now maps compaction run ids
    through positive safe-integer validation and run outcome counters through
    non-negative safe-integer validation before returning create/find run rows.
  - `tests/store/memory-archive-repository.test.ts` now covers malformed
    existing run id, `archived_count`, `duplicate_count`, `decay_count`, and
    `qdrant_failed` rows through mock-pool idempotency lookup coverage.
  - Source checked: `compaction_runs.id` is `BIGSERIAL`, while
    `archived_count`, `duplicate_count`, `decay_count`, and `qdrant_failed`
    are `INTEGER DEFAULT 0` columns in migration
    `005_add_compaction_archive.sql`.

Verification plan:
- `npx vitest run tests/store/memory-archive-repository.test.ts tests/store/db-utils.test.ts tests/compact/apply-compaction.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/memory-archive-repository.test.ts tests/store/db-utils.test.ts tests/compact/apply-compaction.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`138` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2030` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded restored memory id row mapping:
  - `src/store/memory-archive-repository.ts` now maps the
    `memory_records.id` returned by `restoreToCanonical` through positive
    safe-integer validation before returning unarchive results.
  - `tests/store/memory-archive-repository.test.ts` now covers malformed
    restored id rows through mock-pool restore coverage.
  - Source checked: `memory_records.id` is `BIGSERIAL` in migration
    `001_initial.sql`.

Verification plan:
- `npx vitest run tests/store/memory-archive-repository.test.ts tests/compact/unarchive-compaction.test.ts tests/store/db-utils.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/memory-archive-repository.test.ts tests/compact/unarchive-compaction.test.ts tests/store/db-utils.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`120` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2025` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded memory archive cleanup attempt counter row mapping:
  - `src/store/memory-archive-repository.ts` now maps
    `qdrant_attempt_count` through non-negative safe-integer validation before
    returning pending or claimed Qdrant cleanup records.
  - `tests/store/memory-archive-repository.test.ts` now covers malformed
    pending-list and claim-return attempt counter rows through mock-pool
    coverage.
  - Source checked: `memory_archive.qdrant_attempt_count` is an `INTEGER`
    with default `0` in migration `005_add_compaction_archive.sql`.

Verification plan:
- `npx vitest run tests/store/memory-archive-repository.test.ts tests/store/db-utils.test.ts tests/compact/outbox-sweeper.test.ts tests/compact/sweeper-loop.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/memory-archive-repository.test.ts tests/store/db-utils.test.ts tests/compact/outbox-sweeper.test.ts tests/compact/sweeper-loop.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`145` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2023` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded memory archive id row mapping:
  - `src/store/memory-archive-repository.ts` now maps memory archive ids
    returned by apply, cleanup listing, cleanup claiming, and archive lookup
    rows through positive safe-integer validation.
  - Archive lookup rows now also validate `source_record_id` and non-null
    `source_id` as positive safe integers before returning unarchive inputs.
  - `tests/store/memory-archive-repository.test.ts` now covers malformed
    archive id rows across apply/list/claim/lookup paths, plus malformed
    archived source id references.
  - Source checked: `memory_archive.id` is `BIGSERIAL`,
    `memory_archive.source_record_id` is `BIGINT`, and nullable
    `memory_archive.source_id` is `BIGINT` in migrations
    `005_add_compaction_archive.sql` and `006_add_archive_unarchive.sql`.

Verification plan:
- `npx vitest run tests/store/memory-archive-repository.test.ts tests/store/db-utils.test.ts tests/compact/unarchive-compaction.test.ts tests/compact/outbox-sweeper.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/memory-archive-repository.test.ts tests/store/db-utils.test.ts tests/compact/unarchive-compaction.test.ts tests/compact/outbox-sweeper.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`146` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2019` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded audit log numeric row mapping:
  - `src/audit/audit-log-repository.ts` now maps audit log `id` through
    positive safe-integer validation and `duration_ms` through non-negative
    safe-integer validation before returning listed audit entries.
  - `tests/audit/audit-truncation.test.ts` now covers malformed audit id and
    duration rows through mock-pool `listByOrganization` coverage.
  - Source checked: `audit_log.id` is `BIGSERIAL` and
    `audit_log.duration_ms` is `INTEGER` in migration
    `003_add_audit_log.sql`.

Verification plan:
- `npx vitest run tests/audit/audit-truncation.test.ts tests/audit/audit-write.test.ts tests/store/db-utils.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/audit/audit-truncation.test.ts tests/audit/audit-write.test.ts tests/store/db-utils.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`66` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2011` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded goal run id row mapping:
  - `src/goal-run/goal-run-repository.ts` now maps goal run `id`,
    goal run iteration `id`, and iteration `goal_run_id` rows through positive
    safe-integer validation before returning mapped records.
  - `recordIteration` now maps inserted iteration rows before `COMMIT`, so
    malformed returned ids roll back the transaction instead of failing after
    commit.
  - `tests/goal-run/goal-run-repository.test.ts` now covers malformed run and
    iteration id/reference rows through mock-pool start, record, and get
    coverage.
  - Source checked: `goal_runs.id` and `goal_run_iterations.id` are
    `BIGSERIAL`, and `goal_run_iterations.goal_run_id` is a `BIGINT`
    reference in migration `013_add_goal_runs.sql`.

Verification plan:
- `npx vitest run tests/goal-run/goal-run-repository.test.ts tests/goal-run/build-goal-context.test.ts tests/goal-run/goal-run-handlers.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/goal-run/goal-run-repository.test.ts tests/goal-run/build-goal-context.test.ts tests/goal-run/goal-run-handlers.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`92` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2007` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded ingest job id row mapping:
  - `src/jobs/ingest-job-repository.ts` now maps ingest job `id` and
    `memory_record_id` rows through positive safe-integer validation before
    returning mapped ingest jobs.
  - `tests/jobs/ingest-job-claim.test.ts` now covers malformed mapped job id
    and memory record id rows through mock-pool claim coverage.
  - Source checked: `ingest_jobs.id` is `BIGSERIAL` and
    `ingest_jobs.memory_record_id` is a `BIGINT` reference in migration
    `001_initial.sql`.

Verification plan:
- `npx vitest run tests/jobs/ingest-job-claim.test.ts tests/jobs/serialize-error.test.ts tests/store/db-utils.test.ts tests/compact/ingest-sweeper.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/jobs/ingest-job-claim.test.ts tests/jobs/serialize-error.test.ts tests/store/db-utils.test.ts tests/compact/ingest-sweeper.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`92` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2001` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded pending ingest job row mapping:
  - `src/store/canonical-indexing.ts` now maps pending ingest job `id` as a
    positive safe integer and `qdrant_attempts` as a non-negative safe integer
    before returning the job reference.
  - Job row validation now happens before `COMMIT`, so malformed
    `INSERT INTO ingest_jobs ... RETURNING` rows roll back the chunk
    replacement transaction instead of failing after commit.
  - `tests/store/canonical-indexing.test.ts` now covers string numeric job rows
    and malformed job rows through mock-pool
    `replaceChunksForRecordWithPendingIngest` coverage.
  - Source checked: `ingest_jobs.id` is `BIGSERIAL` in migration
    `001_initial.sql`, and `ingest_jobs.qdrant_attempts` is an `INTEGER`
    counter added by migration `007_ingest_jobs_qdrant_outbox.sql`.

Verification plan:
- `npx vitest run tests/store/canonical-indexing.test.ts tests/store/db-utils.test.ts tests/search/retrieve-memory.test.ts tests/vector/point-builder.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/canonical-indexing.test.ts tests/store/db-utils.test.ts tests/search/retrieve-memory.test.ts tests/vector/point-builder.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`135` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `1999` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded memory chunk id row mapping:
  - `src/store/canonical-indexing.ts` now maps `memory_chunks.id` and
    `memory_record_id` rows through positive safe-integer validation before
    returning stored or reindexable chunks.
  - `tests/store/canonical-indexing.test.ts` now covers malformed chunk id rows
    through mock-pool insert chunk coverage.
  - Source checked: `memory_chunks.id` is `BIGSERIAL` and
    `memory_chunks.memory_record_id` is a `BIGINT` reference in migration
    `001_initial.sql`.

Verification plan:
- `npx vitest run tests/store/canonical-indexing.test.ts tests/store/db-utils.test.ts tests/search/retrieve-memory.test.ts tests/vector/point-builder.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/canonical-indexing.test.ts tests/store/db-utils.test.ts tests/search/retrieve-memory.test.ts tests/vector/point-builder.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`132` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `1996` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded graph relationship confidence row mapping:
  - `src/store/memory-repository.ts` now maps graph relationship `confidence`
    rows through finite numeric conversion plus a 0..1 range check before
    returning graph relationships.
  - `tests/store/memory-repository.test.ts` now covers malformed graph
    relationship confidence rows through mock-pool `inspectMemoryGraph`
    coverage.
  - Source checked: public MCP input schemas constrain confidence to 0..1, and
    relationship rows read `entity_relationships.confidence::float8` from the
    `NUMERIC(4,3)` column in migration `011_entity_temporal_graph.sql`.

Verification plan:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/db-utils.test.ts tests/mcp/server.test.ts tests/search/retrieve-memory.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/db-utils.test.ts tests/mcp/server.test.ts tests/search/retrieve-memory.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`289` tests passed, `7` skipped)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `1993` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded graph entity id row mapping:
  - `src/store/memory-repository.ts` now maps graph entity `id` rows through
    positive safe-integer validation before returning graph entities.
  - `tests/store/memory-repository.test.ts` now covers malformed graph entity
    id rows through mock-pool `inspectMemoryGraph` coverage.
  - Source checked: `entities.id` is a `BIGSERIAL` field in migration
    `011_entity_temporal_graph.sql`.

Verification plan:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/db-utils.test.ts tests/mcp/server.test.ts tests/search/retrieve-memory.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/db-utils.test.ts tests/mcp/server.test.ts tests/search/retrieve-memory.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`286` tests passed, `7` skipped)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `1990` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded add-memory returned id row mapping:
  - `src/store/memory-repository.ts` now maps returned source ids through
    positive safe-integer validation before using them in the
    `memory_records.source_id` insert parameter.
  - Returned `memory_records.id` values are now validated before entity graph
    persistence receives a memory record id for mention or relationship writes.
  - `tests/store/memory-repository.test.ts` now covers malformed source and
    memory id rows through the mock-pool `addMemory` transaction path,
    verifying each failure rolls back before the next write step.
  - Source checked: `sources.id` and `memory_records.id` are `BIGSERIAL`
    fields, and `memory_records.source_id` is a `BIGINT` reference in
    migration `001_initial.sql`.

Verification plan:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/db-utils.test.ts tests/mcp/server.test.ts tests/search/retrieve-memory.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/db-utils.test.ts tests/mcp/server.test.ts tests/search/retrieve-memory.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`284` tests passed, `7` skipped)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `1988` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded entity mention id row mapping:
  - `src/store/memory-repository.ts` now maps `entities.id` rows returned by
    entity upserts through positive safe-integer validation before building
    persisted mentions.
  - Malformed entity ids now fail before `memory_entity_mentions` or
    `entity_relationships` inserts can receive invalid entity references.
  - `tests/store/memory-repository.test.ts` now covers malformed entity id rows
    through the mock-pool `addMemory` transaction path and verifies rollback
    occurs before mention inserts.
  - Source checked: `entities.id` is a `BIGSERIAL` field, and
    `memory_entity_mentions.entity_id` / `entity_relationships.*_entity_id`
    are `BIGINT` references in migration `011_entity_temporal_graph.sql`.

Verification plan:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/db-utils.test.ts tests/mcp/server.test.ts tests/search/retrieve-memory.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/db-utils.test.ts tests/mcp/server.test.ts tests/search/retrieve-memory.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`278` tests passed, `7` skipped)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `1982` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded memory search result id row mapping:
  - `src/store/memory-repository.ts` now maps hydrated memory result `id`,
    `source_id`, and joined source `id` through positive safe-integer row
    helpers before returning search/list results.
  - `tests/store/memory-repository.test.ts` now covers malformed hydrated
    memory/source id rows through mock-pool `listMemory` coverage.
  - Source checked: `sources.id` and `memory_records.id` are `BIGSERIAL`
    fields, and `memory_records.source_id` is a `BIGINT` reference to
    `sources.id` in migration `001_initial.sql`.

Verification plan:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/db-utils.test.ts tests/mcp/server.test.ts tests/search/retrieve-memory.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/db-utils.test.ts tests/mcp/server.test.ts tests/search/retrieve-memory.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`275` tests passed, `7` skipped)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `1979` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded memory graph relationship row mapping:
  - `src/store/memory-repository.ts` now maps graph relationship `id`,
    `from_entity_id`, `to_entity_id`, and `evidence_memory_record_id` through
    positive safe-integer row helpers before returning graph relationships.
  - `confidence` remains a finite numeric row mapping in this loop; this
    change is scoped to BIGSERIAL/BIGINT id references.
  - `tests/store/memory-repository.test.ts` now covers malformed graph
    relationship id rows through mock-pool `inspectMemoryGraph` coverage.
  - Source checked: `entity_relationships.id`, `from_entity_id`,
    `to_entity_id`, and `evidence_memory_record_id` are `BIGSERIAL`/`BIGINT`
    fields in migration `011_entity_temporal_graph.sql`.

Verification plan:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/db-utils.test.ts tests/mcp/server.test.ts tests/search/retrieve-memory.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/db-utils.test.ts tests/mcp/server.test.ts tests/search/retrieve-memory.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`272` tests passed, `7` skipped)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `1976` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded memory graph entity row mapping:
  - `src/store/memory-repository.ts` now maps graph entity `mention_count`
    through a non-negative safe-integer row helper and maps `memory_ids` as
    positive safe integers.
  - Malformed graph entity counts or memory ids now fail before relationship
    lookup runs, avoiding graph responses built from invalid entity rows.
  - `tests/store/memory-repository.test.ts` now covers malformed
    `mention_count` and `memory_ids` rows through mock-pool
    `inspectMemoryGraph` coverage.
  - Source checked: graph entity rows compute `mention_count` with
    `COUNT(DISTINCT mem.memory_record_id)::int` and `memory_ids` with
    `array_agg(DISTINCT mem.memory_record_id)`.

Verification plan:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/db-utils.test.ts tests/mcp/server.test.ts tests/search/retrieve-memory.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/db-utils.test.ts tests/mcp/server.test.ts tests/search/retrieve-memory.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`269` tests passed, `7` skipped)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `1973` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded goal run counter row mapping:
  - `src/goal-run/goal-run-repository.ts` now maps
    `goal_runs.iteration_count` through a non-negative safe-integer row helper
    when returning runs.
  - `recordIteration` now validates the bumped `iteration_count` as a positive
    safe integer before inserting the iteration row, and
    `goal_run_iterations.iteration_index` is validated the same way when
    mapping iterations.
  - `tests/goal-run/goal-run-repository.test.ts` now covers string numeric run
    and iteration row values plus malformed run/iteration counter rows.
  - Source checked: `goal_runs.iteration_count` and
    `goal_run_iterations.iteration_index` are `INTEGER` counters in migration
    `013_add_goal_runs.sql`.

Verification plan:
- `npx vitest run tests/goal-run/goal-run-repository.test.ts tests/goal-run/build-goal-context.test.ts tests/goal-run/goal-run-handlers.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/goal-run/goal-run-repository.test.ts tests/goal-run/build-goal-context.test.ts tests/goal-run/goal-run-handlers.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`86` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `1969` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded memory importance row mapping:
  - `src/store/memory-repository.ts` now maps `memory_records.importance` row
    values through shared numeric conversion plus Postgres integer range checks
    before returning hydrated memory records.
  - The update flow now maps both the existing row fallback importance and the
    update `RETURNING` importance before using them for persistence and entity
    graph rebuild inputs.
  - `tests/store/memory-repository.test.ts` now covers string numeric hydrated
    row values and malformed importance rows through mock-pool listMemory
    coverage.
  - Source checked: `memory_records.importance` is an `INTEGER` field in the
    active migrations and was the remaining raw numeric field in
    `mapPostgresSearchResult`.

Verification plan:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/db-utils.test.ts tests/search/retrieve-memory.test.ts tests/mcp/server.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/db-utils.test.ts tests/search/retrieve-memory.test.ts tests/mcp/server.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`265` tests passed, `7` skipped)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `1964` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded memory chunk row mapping:
  - `src/store/canonical-indexing.ts` now maps `memory_chunks` row ids,
    chunk indexes, and offsets through a shared chunk row mapper. `chunk_index`,
    `start_offset`, and `end_offset` pass through shared `toNumber` validation
    plus non-negative safe-integer checks before being returned.
  - Insert RETURNING row reassembly now keys by the validated numeric
    `chunk_index`, so string numeric DB row values still match the input chunk
    order.
  - `tests/store/canonical-indexing.test.ts` now covers string numeric rows for
    insert/list/get chunk paths and malformed returned chunk rows.
  - Source checked: `memory_chunks.id` and `memory_record_id` are
    `BIGSERIAL`/`BIGINT`, while `chunk_index`, `start_offset`, and `end_offset`
    are `INTEGER` fields in migrations.

Verification plan:
- `npx vitest run tests/store/canonical-indexing.test.ts tests/store/db-utils.test.ts tests/search/retrieve-memory.test.ts tests/vector/point-builder.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/canonical-indexing.test.ts tests/store/db-utils.test.ts tests/search/retrieve-memory.test.ts tests/vector/point-builder.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`129` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `1960` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded ingest job counter row mapping:
  - `src/jobs/ingest-job-repository.ts` now maps `attempts` and
    `qdrant_attempts` through shared `toNumber` validation plus a non-negative
    safe-integer check instead of returning raw DB row values.
  - `tests/jobs/ingest-job-claim.test.ts` now covers string row values for
    `id`, `memory_record_id`, `attempts`, and `qdrant_attempts`, plus malformed
    counter rows, without requiring a live Postgres instance.
  - Source checked: `ingest_jobs.id` and `memory_record_id` are
    `BIGSERIAL`/`BIGINT`, while `attempts` and `qdrant_attempts` are
    `INTEGER` counters in migrations.

Verification plan:
- `npx vitest run tests/jobs/ingest-job-claim.test.ts tests/jobs/serialize-error.test.ts tests/store/db-utils.test.ts tests/compact/ingest-sweeper.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/jobs/ingest-job-claim.test.ts tests/jobs/serialize-error.test.ts tests/store/db-utils.test.ts tests/compact/ingest-sweeper.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`90` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `1955` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Reused DB helpers across memory archive row mappers:
  - `src/store/memory-archive-repository.ts` now maps compaction run rows,
    archive insert rows, pending cleanup rows, archive lookup rows, and restore
    insert ids through shared `toNumber`; archive timestamps now use shared
    `toIsoString`.
  - `tests/store/memory-archive-repository.test.ts` now uses string row values
    for `BIGSERIAL`/`BIGINT` fields returned by node-postgres while preserving
    numeric repository API results.
  - Source checked: `compaction_runs`, `memory_archive`, `memory_records`, and
    related FK columns use `BIGSERIAL`/`BIGINT` in migrations.

Verification plan:
- `npx vitest run tests/store/memory-archive-repository.test.ts tests/store/db-utils.test.ts tests/compact/apply-compaction.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/memory-archive-repository.test.ts tests/store/db-utils.test.ts tests/compact/apply-compaction.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`119` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `1952` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded compaction recent-apply count mapping:
  - `src/store/memory-archive-repository.ts` now maps
    `countRecentApplyRuns` count rows through shared `toNumber` validation plus
    a non-negative safe-integer check instead of `Number.parseInt`.
  - Missing count rows still fall back to `0`, while malformed present values
    such as partial numeric strings, blank strings, fractions, negatives,
    `null`, and booleans now fail closed.
  - `tests/store/memory-archive-repository.test.ts` covers numeric count rows,
    no-row fallback, and malformed count rows.
  - Source checked: `COUNT(*)` can arrive as a string, and the prior
    `Number.parseInt(raw, 10)` path could accept partial numeric strings.

Verification plan:
- `npx vitest run tests/store/memory-archive-repository.test.ts tests/store/db-utils.test.ts tests/compact/apply-compaction.test.ts --reporter=dot`
- `npx vitest run tests/scripts/source-conventions.test.ts tests/store/memory-archive-repository.test.ts tests/store/db-utils.test.ts tests/compact/apply-compaction.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/memory-archive-repository.test.ts tests/store/db-utils.test.ts tests/compact/apply-compaction.test.ts --reporter=dot`
  (`113` tests passed)
- Initial `npm test` exposed a new catch-binding convention violation in
  `src/store/memory-archive-repository.ts`; fixed with `catch (_err: unknown)`.
- `npx vitest run tests/scripts/source-conventions.test.ts tests/store/memory-archive-repository.test.ts tests/store/db-utils.test.ts tests/compact/apply-compaction.test.ts --reporter=dot`
  (`119` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `1952` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded pgvector query row number mapping:
  - `src/vector/pgvector-index.ts` now maps SELECT rows through
    `mapPgVectorQueryRow` and validates `score` plus `memory_record_id` before
    returning vector hits.
  - Query row mapping now happens before `COMMIT`, so malformed rows follow the
    existing rollback path instead of returning coerced hit values.
  - `tests/vector/pgvector-index.integration.test.ts` covers numeric string
    mapping, malformed row values, rollback behavior, and client release using
    a mocked pgvector client.
  - Source checked: pgvector adapter previously used direct `Number(row.score)`
    and `Number(row.memory_record_id)` conversions in the query result mapper.

Verification plan:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts --reporter=dot`
  (`75` tests passed, `12` skipped)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `1939` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Reused DB helpers in audit row mapping:
  - `src/audit/audit-log-repository.ts` now maps `id`, `duration_ms`, and
    `created_at` through shared `toNumber` and `toIsoString` helpers instead of
    local numeric and timestamp coercion.
  - `tests/audit/audit-truncation.test.ts` covers numeric string audit rows,
    `Date` timestamp rows, and malformed audit row numeric values from
    `listByOrganization`.
  - Source checked: audit repository listing was the remaining direct
    `Number(row.id)` database row mapping path outside the shared store helper.

Verification plan:
- `npx vitest run tests/audit/audit-truncation.test.ts tests/audit/audit-write.test.ts tests/store/db-utils.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/audit/audit-truncation.test.ts tests/audit/audit-write.test.ts tests/store/db-utils.test.ts --reporter=dot`
  (`56` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `1934` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Tightened DB row number runtime typing:
  - `src/store/db-utils.ts` now treats `toNumber` as an `unknown` runtime
    boundary and rejects non-number/string inputs before JavaScript coercion can
    turn values like `null`, `false`, or arrays into finite numbers.
  - `tests/store/db-utils.test.ts` covers non-finite numbers, blank strings,
    non-numeric strings, `null`, `undefined`, booleans, arrays, and objects.
  - Source checked: `toNumber` callers are repository row mappers in memory,
    canonical indexing, ingest-job, and goal-run storage paths.

Verification plan:
- `npx vitest run tests/store/db-utils.test.ts tests/jobs/serialize-error.test.ts tests/store/memory-repository.test.ts tests/store/canonical-indexing.test.ts tests/jobs/ingest-job-repository.test.ts tests/goal-run/goal-run-repository.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/db-utils.test.ts tests/jobs/serialize-error.test.ts tests/store/memory-repository.test.ts tests/store/canonical-indexing.test.ts tests/jobs/ingest-job-repository.test.ts tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  (`169` tests passed, `13` skipped)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `1927` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded DB row number mapping:
  - `src/store/db-utils.ts` now rejects non-finite or blank numeric values in
    `toNumber` instead of silently mapping them to `NaN` or `0`.
  - `tests/store/db-utils.test.ts` covers finite numbers, numeric strings, and
    malformed database values.
  - `tests/jobs/serialize-error.test.ts` now returns a DB-shaped ingest job row
    from its fake repository query, matching the real `RETURNING` mapper.
  - Source checked: `toNumber` is shared by memory, canonical indexing,
    ingest-job, and goal-run repositories.

Verification plan:
- `npx vitest run tests/store/db-utils.test.ts tests/jobs/serialize-error.test.ts tests/store/memory-repository.test.ts tests/store/canonical-indexing.test.ts tests/jobs/ingest-job-repository.test.ts tests/goal-run/goal-run-repository.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/db-utils.test.ts tests/jobs/serialize-error.test.ts tests/store/memory-repository.test.ts tests/store/canonical-indexing.test.ts tests/jobs/ingest-job-repository.test.ts tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  (`162` tests passed, `13` skipped)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `1920` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Added code-quality audit triage notes:
  - The tracked continuation docs now record current-branch evidence for
    addressed CQ findings without force-adding ignored `docs/superpowers`
    audit snapshots.
  - The evidence covers CQ-01, CQ-02, CQ-03, CQ-04, CQ-05, CQ-06, CQ-07,
    CQ-10, CQ-12, CQ-13, CQ-14, and CQ-15 so future loops do not repeat
    already-settled investigations.
  - Source checked: `src/app/routes/memory.ts`, `tests/app/server.test.ts`,
    `tests/mcp/resolve-org.test.ts`, `tests/app/rate-limit.test.ts`,
    `tests/app/bearer-auth.test.ts`, `tests/store/parse-source-ref.test.ts`,
    `src/store/db-utils.ts`, `src/mcp/types.ts`, and current `rg` evidence for
    `@ts-ignore`.

Verification plan:
- `npx vitest run tests/app/server.test.ts tests/mcp/resolve-org.test.ts tests/app/rate-limit.test.ts tests/app/bearer-auth.test.ts tests/store/parse-source-ref.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
- `git diff --check`

Verification:
- `npx vitest run tests/app/server.test.ts tests/mcp/resolve-org.test.ts tests/app/rate-limit.test.ts tests/app/bearer-auth.test.ts tests/store/parse-source-ref.test.ts tests/scripts/source-conventions.test.ts --reporter=dot`
  (`152` tests passed)
- `git diff --check` (passed)

- Reused parsed ranking timestamps:
  - `src/search/rank-results.ts` now timestamps records once in `rankResults`
    and reuses that value for newest-record detection, recency scoring, and
    tie-break sorting.
  - `rankCandidates` keeps validating external candidate timestamps before
    sorting, but shares the same timestamped candidate sorter.
  - `tests/search/rank-results.test.ts` now guards that `rankResults` calls
    `Date.parse` once per record while preserving the existing ranking rules.
  - Source checked: internal performance audit finding 12 documents redundant
    timestamp parsing in ranking:
    `docs/superpowers/audit/03-performance.md`.

Verification plan:
- `npx vitest run tests/search/rank-results.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/search/rank-results.test.ts --reporter=dot`
  (`23` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1912` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Batched outbox sweeper vector deletes:
  - `src/compact/outbox-sweeper.ts` now groups claimed
    `memory_archive` cleanup rows by `organizationId` and calls
    `vectorIndex.delete` once per org with the combined point IDs.
  - `tests/compact/outbox-sweeper.test.ts` guards same-org batching, multi-org
    grouping, and row-level retry or failed counts when a batched delete fails.
  - Source checked: internal performance audit finding 10 documents sequential
    Qdrant deletes in `outbox-sweeper`; `VectorIndex` is backend-neutral, so
    batching uses `organizationId` rather than `collectionName`:
    `docs/superpowers/audit/03-performance.md`, `src/vector/vector-index.ts`.

Verification plan:
- `npx vitest run tests/compact/outbox-sweeper.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/compact/outbox-sweeper.test.ts --reporter=dot`
  (`32` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1911` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Added direct coverage for the active bearer-auth API:
  - `tests/app/bearer-auth.test.ts` now imports `authenticateBearer` and checks
    static-token precedence over OAuth verification, OAuth fallback when no
    static token matches, and null results when neither auth path can match.
  - This keeps unit coverage centered on the active API after removing request
    and boolean wrapper exports from `src/app/middleware/bearer-auth.ts`.
  - Source checked: `authenticateBearer` is the helper used by both
    `src/app/server.ts` and `src/app/mcp-http.ts`.

Verification plan:
- `npx vitest run tests/app/bearer-auth.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/app/bearer-auth.test.ts --reporter=dot`
  (`28` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1909` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Removed the unused bearer-auth request wrapper:
  - `src/app/middleware/bearer-auth.ts` no longer imports
    `IncomingMessage` or exports `matchBearerFromRequest`.
  - `tests/app/bearer-auth.test.ts` drops the wrapper-only request fixture and
    keeps focused coverage on `loadBearerTokens` and `matchBearer`; active HTTP
    and MCP callers already pass header strings to `authenticateBearer`.
  - Source checked: `rg` found `matchBearerFromRequest` only in its own test,
    while `src/app/server.ts` and `src/app/mcp-http.ts` use
    `authenticateBearer` directly.

Verification plan:
- `npx vitest run tests/app/bearer-auth.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/app/bearer-auth.test.ts --reporter=dot`
  (`25` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1906` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Removed dead bearer-auth compatibility exports:
  - `src/app/middleware/bearer-auth.ts` no longer exports `checkBearer` or
    `checkBearerFromRequest`; the active runtime path uses `authenticateBearer`
    plus `matchBearer`.
  - `tests/app/bearer-auth.test.ts` drops the wrapper-only `checkBearer` cases
    and keeps coverage for token parsing, timing-safe matching, and
    request-header extraction.
  - Source checked: internal code-quality audit finding CQ-13 documents these
    dead security-module exports:
    `docs/superpowers/audit/04-code-quality.md`.

Verification plan:
- `npx vitest run tests/app/bearer-auth.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/app/bearer-auth.test.ts --reporter=dot`
  (`27` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1908` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Reused parsed source metadata during memory updates:
  - `src/store/memory-repository.ts` now calls
    `parseStoredPostgresSourceRef(currentRow.source_ref)` once in
    `updateMemoryRecord` before rebuilding entity graph provenance.
  - The parsed `sourceRef` and `uri` are reused for
    `persistPostgresEntityGraph`, so malformed legacy `source_ref` values do
    not trigger duplicate warning logs during a single update.
  - Source checked: CQ-07 had already introduced warning behavior for malformed
    stored `source_ref`; this follow-up keeps that warning path single-shot in
    the update flow:
    `docs/superpowers/audit/04-code-quality.md`,
    `tests/store/parse-source-ref.test.ts`.

Verification plan:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/parse-source-ref.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/parse-source-ref.test.ts --reporter=dot`
  (`84` tests passed, `7` skipped)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1911` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Aligned public secret-scrubber coverage docs:
  - `README.md`, `docs/architecture.md`, and `docs/api-reference.md` now state
    that provider API keys, PEM blocks, bearer/JWT tokens, and credentialed
    database URLs are rejected before persistence.
  - Korean mirrors carry the same scope while preserving localized wording.
  - `tests/scripts/public-docs-drift.test.ts` now checks the implemented
    `src/store/secret-scrub.ts` categories against README, architecture, API
    reference, and detailed security docs.
  - Source checked: internal security audit finding SEC-6 documents the missing
    GCP / Stripe / Slack / DB-connection-string secret patterns, and the current
    scrubber implementation now includes those categories:
    `docs/superpowers/audit/02-security.md`, `src/store/secret-scrub.ts`.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts --reporter=dot`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts --reporter=dot`
  (`45` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1911` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Removed dead MCP type exports:
  - `src/mcp/types.ts` no longer exports the unused
    `CompactMemoryToolInput_v2Extension` and `_AuditLogEntryRef` aliases.
  - Removing `_AuditLogEntryRef` also drops the unused `StoredAuditLogEntry`
    import from the MCP type surface; `StoredAuditLogEntry` remains in the
    audit repository where it is used.
  - Source checked: internal code-quality audit finding CQ-14 documents these
    unused type exports:
    `docs/superpowers/audit/04-code-quality.md`.

Verification plan:
- `npm run typecheck`
- `npx vitest run tests/mcp/server.test.ts tests/mcp/tool-registry.test.ts`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npm run typecheck` (passed)
- `npx vitest run tests/mcp/server.test.ts tests/mcp/tool-registry.test.ts`
  (`148` tests passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1910` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Extracted shared DB row helpers:
  - `src/store/db-utils.ts` now owns `requireSingleRow`, `toNumber`, and
    `toIsoString`.
  - `src/store/memory-repository.ts`, `src/store/canonical-indexing.ts`,
    `src/jobs/ingest-job-repository.ts`, and
    `src/goal-run/goal-run-repository.ts` import the shared helpers instead of
    carrying local copies.
  - Source checked: internal code-quality audit finding CQ-10 documents
    duplicated DB row helpers across repository files:
    `docs/superpowers/audit/04-code-quality.md`.

Verification plan:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/canonical-indexing.test.ts tests/jobs/ingest-job-claim.test.ts tests/goal-run/goal-run-repository.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/memory-repository.test.ts tests/store/canonical-indexing.test.ts tests/jobs/ingest-job-claim.test.ts tests/goal-run/goal-run-repository.test.ts`
  (`167` tests passed, `7` skipped)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1910` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Logged best-effort audit write failures:
  - `src/mcp/tool-registry.ts` still lets tool calls continue when
    `auditLog.record` rejects, but now emits a request-scoped `warn` with
    `event: "audit.record_failed"`, the tool name, the audit outcome, and the
    rejection error.
  - `tests/audit/audit-write.test.ts` now verifies both successful tool calls
    and tool-error paths keep the primary result/error contract while logging
    the audit persistence failure.
  - Source checked: internal code-quality audit finding CQ-12 documents that
    best-effort audit writes should preserve non-blocking behavior while making
    audit infrastructure failures visible:
    `docs/superpowers/audit/04-code-quality.md`.

Verification plan:
- `npx vitest run tests/audit/audit-write.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/audit/audit-write.test.ts` (`7` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1910` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded runtime TypeScript files against unsafe type-erasure assertions:
  - `tests/scripts/source-conventions.test.ts` now scans tracked runtime and
    script TypeScript files with the TypeScript AST and rejects `as any`,
    `as never`, `<any>`, and `<never>` assertions.
  - The guard intentionally excludes tests so malformed-input fixtures can keep
    using `as never` where they are exercising runtime validation boundaries.
  - Source checked: internal code-quality audit finding CQ-03 documents the
    route-dispatch `as never` risk in `src/app/routes/memory.ts`:
    `docs/superpowers/audit/04-code-quality.md`.

Verification plan:
- `npx vitest run tests/scripts/source-conventions.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/source-conventions.test.ts` (`6` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1909` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Reduced chunkText token materialization:
  - `src/chunk/chunk-text.ts` now streams `text.matchAll(/\S+/g)` into a
    bounded token-span window sized by `targetTokens` and retained
    `overlapTokens`.
  - The chunk output shape, content slices, and offsets stay unchanged, while
    large inputs avoid building one regex match object array for the whole
    document before the first chunk is produced.
  - `tests/chunk/chunk-text.test.ts` now guards exact target-boundary behavior
    and the final overlapped partial chunk emitted after crossing the target.
  - Source checked: internal performance audit finding 14 documents the
    up-front `[...text.matchAll(/\S+/g)]` materialization in `chunkText`:
    `docs/superpowers/audit/03-performance.md`.

Verification plan:
- `npx vitest run tests/chunk/chunk-text.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/chunk/chunk-text.test.ts` (`13` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1908` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Added Postgres pool tuning configuration:
  - `src/db/connection.ts` now accepts validated `max`,
    `idleTimeoutMillis`, and `connectionTimeoutMillis` options while keeping
    the default pool size at 10.
  - `src/config.ts` resolves `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, and
    `PG_CONNECT_TIMEOUT_MS` as plain decimal positive integers, then exposes
    the values through `ServiceConfig`.
  - `src/app/server.ts`, `src/mcp/canonical-services.ts`, and
    `src/db/migrate.ts` pass the resolved pool options into `createPgPool`.
  - `.env.example`, `docs/configuration.md`, and `docs/configuration.ko.md`
    document the new variables and accepted value format.
  - Source checked: internal performance audit finding 9 documents the
    hardcoded Postgres pool size and missing idle/connect timeout controls:
    `docs/superpowers/audit/03-performance.md`.

Verification plan:
- `npx vitest run tests/db/connection.test.ts tests/config/service-config.test.ts tests/app/operator-server-boundary.test.ts tests/app/start-operator-server-metrics.test.ts tests/app/start-background-workers-server.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/db/connection.test.ts tests/config/service-config.test.ts tests/app/operator-server-boundary.test.ts tests/app/start-operator-server-metrics.test.ts tests/app/start-background-workers-server.test.ts`
  (`119` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1906` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Added Qdrant query payload projection:
  - `src/vector/qdrant-index.ts` now calls Qdrant `query()` with
    `with_payload: ["memory_record_id"]` and `with_vector: false`.
  - The vector adapter still returns the same `VectorHit` shape, but Qdrant no
    longer needs to send unused payload fields or vectors for retrieval
    hydration.
  - `tests/vector/qdrant-index.test.ts` now guards the projected payload
    request options for project and user scoped Qdrant queries.
  - Source checked: internal performance audit finding 11 documents that the
    retrieval path only reads `payload.memory_record_id`, and local
    `@qdrant/js-client-rest` type declarations confirm the query option names
    are `with_payload` and `with_vector`.

Verification plan:
- `npx vitest run tests/vector/qdrant-index.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/vector/qdrant-index.test.ts` (`25` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1886` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Added stale bucket eviction to the app-local rate limiter:
  - `src/app/middleware/rate-limit.ts` now sweeps buckets that have been idle
    for one full refill window before handling a request.
  - Evicting those buckets is behavior-preserving because the same key would
    have refilled to a full bucket after one full window, matching a new entry.
  - `tests/app/rate-limit.test.ts` now verifies idle buckets are swept while
    active buckets remain tracked.
  - Source checked: internal performance audit finding 13 documents the
    unbounded `Map` risk in the process-local rate limiter:
    `docs/superpowers/audit/03-performance.md`.

Verification plan:
- `npx vitest run tests/app/rate-limit.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/app/rate-limit.test.ts` (`28` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1886` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded the multi-replica rate-limit boundary:
  - `docs/configuration.md`, `docs/configuration.ko.md`, `docs/security.md`,
    `docs/security.ko.md`, `docs/deployment.md`, and
    `docs/deployment.ko.md` now state that `RATE_LIMIT_PER_MINUTE` is an
    in-memory, process-local bucket.
  - The docs now point operators who need a strict deployment-wide quota toward
    a shared reverse-proxy or edge limiter instead of implying app replicas
    share limiter state.
  - `tests/scripts/public-docs-drift.test.ts` guards the compose default and
    English/Korean public-doc wording for this boundary.
  - Sources checked: NGINX documents request-rate limiting via
    `limit_req_zone`/`limit_req`, and Cloudflare documents rate limiting rules
    for matching requests and taking an action when limits are reached:
    https://nginx.org/en/docs/http/ngx_http_limit_req_module.html
    https://developers.cloudflare.com/waf/rate-limiting-rules/

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`44` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1885` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded CI job-level token permission overrides:
  - `tests/scripts/ci-workflow-hygiene.test.ts` now checks that individual CI
    jobs do not declare their own `permissions:` block.
  - This keeps GitHub Actions token permissions centralized at the existing
    workflow-level `contents: read` setting unless a future job explicitly
    needs a reviewed scoped exception.
  - Source checked: GitHub Actions documents that `jobs.<job_id>.permissions`
    can modify default `GITHUB_TOKEN` permissions for a specific job, while
    workflow-level `permissions` applies to all jobs:
    https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idpermissions

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`21` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1884` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded lockfile root bin metadata:
  - `tests/scripts/package-manifest.test.ts` now checks that the package-lock
    root descriptor does not declare `bin` executable metadata.
  - This keeps npm-installed executable entrypoint surface absent unless a
    future packaging decision intentionally adds a CLI entrypoint.
  - Sources checked: npm documents package-lock package descriptors as carrying
    package metadata including `bin`, and documents package `bin` as
    executable files npm links into PATH on install:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/
    https://docs.npmjs.com/cli/v11/configuring-npm/package-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`39` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1883` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded lockfile root platform metadata:
  - `tests/scripts/package-manifest.test.ts` now checks that the package-lock
    root descriptor does not declare `os`, `cpu`, or `libc` platform
    restriction metadata.
  - This keeps the self-hosted npm install surface platform-neutral unless a
    future packaging decision intentionally narrows supported install targets.
  - Sources checked: npm documents package-lock package descriptors as carrying
    package metadata including `os` and `cpu` restrictions, and documents
    package `os`, `cpu`, and `libc` as install/build platform restriction
    fields:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/
    https://docs.npmjs.com/cli/v11/configuring-npm/package-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`39` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1883` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded development dependency lockfile flags:
  - `tests/scripts/package-manifest.test.ts` now checks that direct development
    dependencies exist in package-lock package descriptors without `optional`
    or `devOptional` flags.
  - The current direct dev-only lockfile package set remains explicit, while
    shared dev dependencies may stay non-dev-only when npm's dependency tree
    classification requires it.
  - Source checked: npm documents package-lock package descriptor `dev`,
    `optional`, and `devOptional` flags as dependency-tree classification
    markers for dev-only, optional-only, or combined dev/optional paths:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`39` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1883` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded runtime dependency lockfile flags:
  - `tests/scripts/package-manifest.test.ts` now checks that direct runtime
    dependencies exist in package-lock package descriptors without `dev`,
    `optional`, or `devOptional` flags.
  - This catches dependency tree drift that would move a runtime dependency
    into a dev-only or optional install path without an explicit dependency
    review.
  - Source checked: npm documents package-lock package descriptor `dev`,
    `optional`, and `devOptional` flags as dependency-tree classification
    markers for dev-only, optional-only, or combined dev/optional paths:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`38` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1882` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded lockfile package source resolution:
  - `tests/scripts/package-manifest.test.ts` now checks that every non-root
    package-lock package descriptor resolves from `https://registry.npmjs.org/`
    and carries `sha512-` integrity metadata.
  - This catches dependency tree drift that would introduce git, file, link,
    local tarball, or non-registry HTTP package sources without an explicit
    dependency review.
  - Source checked: npm documents `resolved` as the actual package source,
    with registry, git, and link cases, and `integrity` as the artifact
    integrity string for the unpacked package:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`37` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1881` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded nested shrinkwrap lockfile descriptors:
  - `tests/scripts/package-manifest.test.ts` now checks that package-lock
    package descriptors do not declare `hasShrinkwrap` metadata.
  - This catches dependency tree drift that would introduce package-scoped
    shrinkwrap lockfiles without an explicit dependency review.
  - Source checked: npm documents `hasShrinkwrap` as a package-lock package
    descriptor flag for packages that have an `npm-shrinkwrap.json` file:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`36` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1880` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded lockfile bundled/linked package descriptors:
  - `tests/scripts/package-manifest.test.ts` now checks that package-lock
    package descriptors do not declare `inBundle` or `link` metadata.
  - This catches dependency tree drift that would introduce bundled dependency
    extraction or local/symlink package resolution without an explicit
    dependency review.
  - Source checked: npm documents `inBundle` as a package-lock package
    descriptor flag for bundled dependencies and `link` as a flag for symbolic
    links where the link target is included in the lockfile:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`35` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1879` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded lockfile install-script packages:
  - `tests/scripts/package-manifest.test.ts` now checks the exact package-lock
    package paths that declare `hasInstallScript: true`.
  - This catches dependency tree drift that would introduce a new
    preinstall/install/postinstall package script without an explicit
    dependency review.
  - Source checked: npm documents `hasInstallScript` as a package-lock package
    descriptor flag for packages that have `preinstall`, `install`, or
    `postinstall` scripts:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`34` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1878` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package types metadata:
  - `tests/scripts/package-manifest.test.ts` now checks that package `types`
    and `typings` metadata stay absent.
  - This catches metadata drift that would add a TypeScript declaration
    entrypoint without an explicit public API packaging decision.
  - Source checked: TypeScript's publishing guide documents package
    `types` as the pointer to a bundled declaration file and notes `typings`
    is synonymous with `types`:
    https://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`33` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1877` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package manual metadata:
  - `tests/scripts/package-manifest.test.ts` now checks that package `man` and
    `directories` metadata stay absent.
  - This catches metadata drift that would add npm-installed manual page or
    directory-derived bin/man surfaces without an explicit packaging decision.
  - Source checked: npm documents `man` as installed manual page metadata and
    `directories.bin`/`directories.man` as directory-derived executable/manual
    page metadata:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`32` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1876` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded native addon build metadata:
  - `tests/scripts/package-manifest.test.ts` now checks that package `gypfile`
    metadata and tracked root `binding.gyp` stay absent.
  - This catches metadata drift that would introduce npm's native addon
    node-gyp build path without an explicit packaging decision.
  - Source checked: npm documents `gypfile` in the context of root
    `binding.gyp`; without explicit install/preinstall scripts, npm defaults to
    building with `node-gyp` when that file exists:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`31` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1875` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded browser package metadata:
  - `tests/scripts/package-manifest.test.ts` now checks that package `browser`
    stays absent in `package.json`.
  - This catches metadata drift that would add client-side entrypoint
    hints/replacements to this Node-oriented MCP server package without an
    explicit packaging decision.
  - Source checked: npm documents `browser` as the client-side alternative to
    `main`, used to hint that a module may rely on primitives unavailable in
    Node.js modules:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`30` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1874` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package script config metadata:
  - `tests/scripts/package-manifest.test.ts` now checks that package `config`
    stays absent in both `package.json` and the lockfile root metadata.
  - This catches metadata drift that would add npm-managed package script
    configuration/env behavior without an explicit tooling policy decision.
  - Source checked: npm documents `config` as package script configuration
    parameters that persist across upgrades and can be referenced from scripts
    through `npm_package_config_*` environment variables:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`29` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1873` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package devEngines metadata:
  - `tests/scripts/package-manifest.test.ts` now checks that package
    `devEngines` stays absent in both `package.json` and the lockfile root
    metadata.
  - This catches metadata drift that would add npm-managed dev-time gates
    before install, ci, or run commands without an explicit tooling policy
    decision.
  - Source checked: npm documents `devEngines` as a field that runs before
    `install`, `ci`, and `run` commands, with runtime/package manager gate
    support separate from package `engines`:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`28` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1872` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package peer dependency metadata:
  - `tests/scripts/package-manifest.test.ts` now checks that package
    `peerDependencies` and `peerDependenciesMeta` stay absent in both
    `package.json` and the lockfile root metadata.
  - This catches dependency metadata drift that would turn Akasha's runtime
    dependencies into host/plugin compatibility contracts without an explicit
    dependency policy decision.
  - Source checked: npm documents `peerDependencies` as compatibility with a
    host tool or library for plugin-style packages, and `peerDependenciesMeta`
    as metadata that can mark peer dependencies optional:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`27` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1871` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package optional dependency metadata:
  - `tests/scripts/package-manifest.test.ts` now checks that package
    `optionalDependencies` stays absent in both `package.json` and the
    lockfile root metadata.
  - This catches dependency metadata drift that would make runtime dependency
    install failures non-fatal or override normal dependency entries without an
    explicit dependency policy decision.
  - Source checked: npm documents `optionalDependencies` as dependencies whose
    build failures do not fail installation, and notes entries there override
    same-name entries in `dependencies`:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`26` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1870` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package workspace metadata:
  - `tests/scripts/package-manifest.test.ts` now checks that package
    `workspaces` stays absent.
  - This catches package metadata drift that would move Akasha from a single
    npm package into workspace install/symlink behavior without an explicit
    repo architecture decision.
  - Source checked: npm documents `workspaces` as local file-system patterns
    the install client uses to find packages that need symlinking into the
    top-level `node_modules` folder:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`25` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1869` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package bundled dependency metadata:
  - `tests/scripts/package-manifest.test.ts` now checks that package
    `bundleDependencies` and `bundledDependencies` stay absent.
  - This catches package metadata drift that would bundle dependency contents
    into npm pack/publish tarballs without an explicit packaging decision.
  - Source checked: npm documents `bundleDependencies` as package names bundled
    when publishing, and notes the `bundledDependencies` spelling is also
    honored:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`24` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1868` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package publish configuration:
  - `tests/scripts/package-manifest.test.ts` now checks that package
    `publishConfig` stays absent.
  - This catches package metadata drift that would change npm publish-time
    registry, tag, or access behavior without an explicit release decision.
  - Source checked: npm documents `publishConfig` as publish-time config values
    for settings such as tag, registry, and access:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`23` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1867` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package platform restrictions:
  - `tests/scripts/package-manifest.test.ts` now checks that package `os`,
    `cpu`, and `libc` restrictions stay absent.
  - This catches package metadata drift that would narrow Akasha's self-hosted
    npm install surface without an explicit portability decision.
  - Source checked: npm documents `os`, `cpu`, and `libc` fields as package
    metadata that restrict supported operating systems, CPU architectures, and
    Linux libc variants:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`22` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1866` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package lifecycle scripts:
  - `tests/scripts/package-manifest.test.ts` now checks that npm
    install/publish lifecycle scripts stay absent except for the existing
    `prepack` build hook.
  - This catches package metadata drift that would add hidden install or
    publish-time side effects beyond the documented clean build before pack.
  - Source checked: npm documents install, pack, and publish lifecycle script
    order, including `preinstall`, `install`, `postinstall`, `prepare`,
    `prepack`, `postpack`, `prepublishOnly`, `publish`, and `postpublish`:
    https://docs.npmjs.com/cli/v11/using-npm/scripts/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`21` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1865` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package lockfile precedence:
  - `tests/scripts/package-manifest.test.ts` now checks that tracked
    `npm-shrinkwrap.json` stays absent.
  - This catches lockfile precedence drift where npm would ignore the
    repository's `package-lock.json` contract in favor of shrinkwrap metadata.
  - Source checked: npm documents that root `npm-shrinkwrap.json` takes
    precedence over `package-lock.json` when both are present:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`20` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1864` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded npm private publish metadata:
  - `tests/scripts/package-manifest.test.ts` now checks that package `private`
    is not `true`.
  - This catches package metadata drift that would make npm refuse publication
    while avoiding extra constraints on normal release fields.
  - Source checked: npm documents `"private": true` as a package metadata flag
    that causes npm to refuse publication:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`19` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1863` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded npm package identity metadata:
  - `tests/scripts/package-manifest.test.ts` now checks that package `name`
    remains `akasha-mcp` and package `license` remains `MIT`.
  - This catches package identity or license drift while intentionally avoiding
    a fixed `version` assertion, because release versions should change during
    normal publishing.
  - Source checked: npm documents `name` as the package's identifier and
    recommends SPDX identifiers such as `MIT` in the `license` field:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`18` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1862` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package entrypoint surface:
  - `tests/scripts/package-manifest.test.ts` now checks that package `main`
    remains absent alongside the existing `bin` and `exports` absence checks.
  - This catches package metadata drift where npm consumers could get an
    unintended module entrypoint instead of using the documented package
    scripts.
  - Source checked: npm documents `main` as the primary module entrypoint,
    `exports` as a package entrypoint definition surface, and `bin` as
    executable command surface:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`17` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1861` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded npm package support metadata:
  - `tests/scripts/package-manifest.test.ts` now checks that package
    `homepage`, `repository`, `bugs`, and `author` stay pointed at the Akasha
    GitHub project surfaces.
  - This catches package metadata drift where published npm metadata stops
    routing users and contributors to the canonical README, source, or issue
    tracker.
  - Source checked: npm documents `homepage`, `bugs`, and `repository` as
    package metadata used for the project homepage, issue reporting, and source
    location:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`17` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1861` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded `esbuild` override lockfile resolution:
  - `tests/scripts/package-manifest.test.ts` now checks that
    `node_modules/esbuild` and its optional `@esbuild/*` platform packages stay
    resolved to `0.28.1` in `package-lock.json`.
  - This catches lockfile drift when the package override remains present but
    the resolved build tooling package tree moves to another version.
  - Source checked: npm documents `overrides` as a root `package.json` field
    that changes dependency tree resolution, and `package-lock.json` as the
    committed dependency tree representation:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides
    https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`16` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1860` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package module type metadata:
  - `tests/scripts/package-manifest.test.ts` now checks that top-level
    `type` stays `module` for generated `.js` files.
  - This catches package metadata drift where NodeNext build output could be
    interpreted with the wrong module system.
  - Source checked: Node.js documents `.js` files as ES modules when the
    nearest parent `package.json` has top-level `"type": "module"`:
    https://nodejs.org/api/packages.html#determining-module-system

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`15` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1859` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package override metadata:
  - `tests/scripts/package-manifest.test.ts` now checks that
    `overrides.esbuild` stays on the current `^0.28.1` build tooling override.
  - This catches package metadata drift when the npm override that shapes
    transitive build tooling resolution is removed or changed without review.
  - Source checked: npm documents `overrides` as a root `package.json` field
    for replacing packages in the dependency tree:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`14` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1858` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package dependency scope:
  - `tests/scripts/package-manifest.test.ts` now checks the exact runtime
    dependency names separately from development-only tooling names.
  - This catches package metadata drift when runtime libraries and local
    build/test tools move across the `dependencies` / `devDependencies`
    boundary while the lockfile remains aligned.
  - Source checked: `package.json`, package-lock root metadata, README,
    configuration, architecture, and public-doc drift coverage describe
    runtime dependencies such as `@huggingface/transformers` separately from
    local TypeScript/Vitest tooling.

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`13` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1857` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded documented backup creation scripts:
  - `tests/scripts/package-manifest.test.ts` now checks that `backup:create`,
    `backup:create:qdrant`, and `backup:create:pgvector` still route through
    `scripts/create-backup.sh` with the documented backend override behavior.
  - This catches package script drift before README, operations, deployment,
    or self-hosted backup docs can keep pointing operators at stale commands.
  - Source checked: README, operations, deployment, self-hosted operations, and
    public-doc drift coverage all document the backend-aware backup creation
    scripts.

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`12` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1856` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded documented development watch scripts:
  - `tests/scripts/package-manifest.test.ts` now checks that `dev:server`,
    `dev:worker`, `dev:mcp`, `dev:cli`, and `test:watch` still point at the
    expected source entrypoints and Vitest watch command.
  - This catches package script drift before README and CONTRIBUTING can keep
    pointing contributors at commands with changed local-development behavior.
  - Source checked: README and CONTRIBUTING list these npm scripts in their
    common or daily command tables.

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`11` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1855` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded documented operator package scripts:
  - `tests/scripts/package-manifest.test.ts` now checks that `start:server`,
    `start:worker`, `db:migrate`, `lifecycle:init`, `backup:decrypt`,
    `backup:verify`, and `restore:smoke` still point at built `dist/`
    artifacts.
  - This catches package script drift before operator docs can keep referring
    to commands whose runtime entrypoints changed.
  - Source checked: README, deployment, operations, self-hosted operations,
    and configuration docs reference these npm scripts as operator commands.

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`10` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1854` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded contributor verification scripts:
  - `tests/scripts/package-manifest.test.ts` now checks that package scripts
    keep `typecheck` on `tsc --noEmit` and `test` on `vitest run`.
  - This catches package script drift before README, CONTRIBUTING, PR template,
    and CI guidance can point contributors at commands with changed behavior.
  - Source checked: README and CONTRIBUTING list `npm run typecheck`,
    `npm run build`, `npm audit --audit-level=moderate`, and `npm test` as the
    local verification sequence, while CI runs the same typecheck/build/audit
    and test gates.

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`9` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1853` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package lockfile top-level format:
  - `tests/scripts/package-manifest.test.ts` now checks that
    `package-lock.json` top-level `name` and `version` match `package.json`.
  - The same guard keeps the committed lockfile on `lockfileVersion: 3` and
    requires an explicit root package entry in `packages[""]`.
  - Source checked: npm documents top-level lockfile `name` and `version` as
    matching `package.json`, `lockfileVersion: 3` as the npm v9+ format, and
    `packages[""]` as the typical root project entry:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`8` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1852` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package lockfile root package metadata:
  - `tests/scripts/package-manifest.test.ts` now checks that
    `package-lock.json` root metadata matches `package.json` for package
    identity, license, dependencies, and dev dependencies.
  - This catches manual lockfile drift when package identity or dependency
    surface changes.
  - Source checked: npm documents `package-lock.json` as a committed
    dependency-tree representation and `packages[""]` as the root project
    entry whose package descriptor can include package metadata:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`7` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1851` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package lockfile runtime metadata:
  - `tests/scripts/package-manifest.test.ts` now checks that
    `package-lock.json` root metadata matches `package.json` for `engines.node`
    and root `@types/node`.
  - This catches lockfile drift when the package's supported Node runtime or
    ambient Node type line changes.
  - Source checked: npm documents `package-lock.json` as a committed
    dependency-tree representation and `packages[""]` as the root project
    entry whose package descriptor can include `engines`:
    https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`6` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1850` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded package Node runtime metadata:
  - `tests/scripts/package-manifest.test.ts` now checks `engines.node: >=22`
    and a root `@types/node` version on the Node 22 line.
  - This keeps package metadata aligned with Akasha's minimum supported Node
    runtime and its oldest supported TypeScript ambient types.
  - Source checked: Node.js Release Working Group schedule marks Node 22 as a
    supported maintenance LTS line through 2027-04-30 and Node 20 as
    end-of-life on 2026-04-30:
    https://github.com/nodejs/release#release-schedule

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`6` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1850` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded CI install ordering:
  - `tests/scripts/ci-workflow-hygiene.test.ts` now checks that every CI job
    runs the CPU-only `Install` step immediately after `actions/setup-node`.
  - This keeps `npm ci` on a runner where Akasha's configured Node version and
    npm cache settings are already active.
  - Source checked: `actions/setup-node` examples run checkout, setup-node,
    `npm ci`, then tests, including the npm caching example:
    https://github.com/actions/setup-node

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`20` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1849` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded CI checkout ordering:
  - `tests/scripts/ci-workflow-hygiene.test.ts` now checks that every CI job
    uses `actions/checkout@v4` immediately before `actions/setup-node`.
  - This keeps repository files present before dependency installation,
    typecheck, build, and test commands run.
  - Source checked: `actions/checkout` documents that the action checks out the
    repository under `$GITHUB_WORKSPACE` so workflows can access it:
    https://github.com/actions/checkout

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`19` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1848` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded backend integration CI runtime:
  - `tests/scripts/ci-workflow-hygiene.test.ts` now checks that the Postgres
    and pgvector integration jobs use `node-version: "22"`.
  - This keeps backend integration coverage on Akasha's minimum supported
    runtime while the main matrix still covers Node 22 and Node 24.
  - Source checked: GitHub Actions' Node.js guide documents that `setup-node`
    takes a Node version input and configures that version on the runner:
    https://docs.github.com/actions/guides/building-and-testing-nodejs

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`18` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1847` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded CI Node matrix fail-fast behavior:
  - `tests/scripts/ci-workflow-hygiene.test.ts` now checks that the Node
    matrix keeps `fail-fast: false` next to the supported Node 22/24 matrix.
  - This keeps a failure on one runtime from canceling the sibling runtime job
    before it reports, preserving full runtime-support signal in CI.
  - Source checked: GitHub Actions workflow syntax documents that
    `strategy.fail-fast` defaults to true and cancels in-progress or queued
    matrix jobs after a matrix job failure:
    https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`17` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1846` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded database service health checks in CI:
  - `tests/scripts/ci-workflow-hygiene.test.ts` now checks that the Postgres
    and pgvector integration jobs keep `pg_isready` service health checks.
  - The guard covers the health command, interval, timeout, and retry settings
    so CI waits for database containers before integration tests connect.
  - Source checked: GitHub Actions' PostgreSQL service container guide uses
    health check options to make sure the service is running:
    https://docs.github.com/actions/using-containerized-services/creating-postgresql-service-containers

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`16` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1845` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded CI stale-run cancellation:
  - `tests/scripts/ci-workflow-hygiene.test.ts` now checks that CI keeps the
    workflow-level concurrency group based on workflow name and branch/PR ref.
  - The same guard requires `cancel-in-progress: true` so newer commits cancel
    stale runs for the same branch or pull request.
  - Source checked: GitHub Actions workflow syntax documents
    `cancel-in-progress: true` for canceling running jobs or workflows in the
    same concurrency group:
    https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`15` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1844` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded setup-node dependency caching:
  - `tests/scripts/ci-workflow-hygiene.test.ts` now checks that all three
    `actions/setup-node` steps keep `cache: npm`.
  - Source checked: `actions/setup-node` documents the `cache` input for npm
    dependency caching:
    https://github.com/actions/setup-node

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`14` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1843` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded CI workflow triggers:
  - `tests/scripts/ci-workflow-hygiene.test.ts` now checks that
    `.github/workflows/ci.yml` runs on pushes to `main` and pull requests
    targeting `main`.
  - Source checked: GitHub Actions workflow trigger guidance documents branch
    filters for `push` and `pull_request` events:
    https://docs.github.com/actions/using-workflows/triggering-a-workflow

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`13` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1842` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded the CI Node matrix:
  - `tests/scripts/ci-workflow-hygiene.test.ts` now checks that the main CI
    matrix keeps Node 22 and Node 24.
  - The same guard confirms `actions/setup-node` receives `${{ matrix.node }}`
    as its `node-version` input.
  - Source checked: GitHub Actions Node.js guidance describes `setup-node` as
    the recommended way to configure Node.js versions consistently across
    runners:
    https://docs.github.com/actions/guides/building-and-testing-nodejs

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`12` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1841` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded CI install commands:
  - `tests/scripts/ci-workflow-hygiene.test.ts` now rejects raw `npm ci`,
    `npm install`, and `npm i` workflow commands.
  - This keeps future CI install steps on the documented CPU-only
    `ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci` path.

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`11` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1840` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded the TypeScript project include set:
  - `tests/scripts/source-conventions.test.ts` now checks that `tsconfig.json`
    continues to include `src/**/*.ts`, `scripts/**/*.ts`, `tests/**/*.ts`, and
    `vitest.config.ts`.
  - This keeps the tsconfig-driven source convention scanner from silently
    dropping source, script, test, or root Vitest config files.

Verification plan:
- `npx vitest run tests/scripts/source-conventions.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/source-conventions.test.ts` (`5` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1839` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Derived TypeScript convention coverage from `tsconfig.json`:
  - `tests/scripts/source-conventions.test.ts` now parses `tsconfig.json` with
    the TypeScript compiler API before applying catch binding, explicit `any`,
    and suppression guards.
  - The guard filters that project file set through `git ls-files` so generated
    or untracked local files do not affect source convention checks.
  - Source checked: TypeScript's TSConfig documentation describes
    `tsconfig.json` as the place that specifies project root files and compiler
    options.

Verification plan:
- `npx vitest run tests/scripts/source-conventions.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/source-conventions.test.ts` (`4` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1838` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Covered root TypeScript config files:
  - `tests/scripts/source-conventions.test.ts` now includes `vitest.config.ts`
    when scanning tracked TypeScript files.
  - This matches the `tsconfig.json` include set so the root Vitest config also
    stays covered by catch binding, explicit `any`, and suppression guards.

Verification plan:
- `npx vitest run tests/scripts/source-conventions.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/source-conventions.test.ts` (`4` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1838` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded strict TypeScript config:
  - `tests/scripts/source-conventions.test.ts` now checks that `tsconfig.json`
    keeps `strict: true`.
  - The same guard rejects explicit `noImplicitAny: false` and
    `useUnknownInCatchVariables: false` overrides.

Verification plan:
- `npx vitest run tests/scripts/source-conventions.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/source-conventions.test.ts` (`4` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1838` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded file-wide TypeScript suppression comments:
  - `tests/scripts/source-conventions.test.ts` now includes `@ts-nocheck` in
    the tracked TypeScript suppression comment guard.
  - This prevents a whole file from opting out of strict TypeScript checks while
    keeping the scanner's self-match avoidance pattern.

Verification plan:
- `npx vitest run tests/scripts/source-conventions.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/source-conventions.test.ts` (`3` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1837` tests passed, `34`
  skipped)
- `git diff --check` (passed)

- Guarded TypeScript suppression comments:
  - `tests/scripts/source-conventions.test.ts` now scans tracked TypeScript
    files for `@ts-ignore` and `@ts-expect-error` comments.
  - The guard reports file and line details without embedding the forbidden
    strings directly in the scanner source.

Verification plan:
- `npx vitest run tests/scripts/source-conventions.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/source-conventions.test.ts` (`3` tests passed)
- `npm run typecheck` (passed)
- `npm run build` (passed)
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1837` tests passed, `34`
  skipped)
- `git diff --check` (passed)

## 2026-07-01

- Recorded admin shell reliability fixes in changelogs:
  - `CHANGELOG.md` and `CHANGELOG.ko.md` now note safer `/admin/memory`
    load/save/tag/archive error reporting, API error preservation, non-JSON
    HTTP status fallback text, and finite numeric payload handling.
  - `tests/scripts/public-docs-drift.test.ts` guards the Unreleased changelog
    entries.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`43` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1836` tests passed, `34` skipped)
- `git diff --check` (passed)

- Improved admin shell HTTP error fallback text:
  - `src/app/admin-memory-page.ts` now includes response status and status text
    when a failed request does not return a JSON API error message.
  - `tests/app/server.test.ts` guards the rendered `/admin/memory` shell for
    the status-bearing fallback string.

Verification plan:
- `npx vitest run tests/app/server.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/app/server.test.ts` (`67` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1835` tests passed, `34` skipped)
- `git diff --check` (passed)

- Guarded admin shell numeric payloads:
  - `src/app/admin-memory-page.ts` now reads `limit` and `importance` through a
    finite-number helper so `NaN`/`Infinity` do not serialize as JSON `null`.
  - `tests/app/server.test.ts` guards the rendered `/admin/memory` shell for
    the helper and the updated numeric payload construction.

Verification plan:
- `npx vitest run tests/app/server.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/app/server.test.ts` (`67` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1835` tests passed, `34` skipped)
- `git diff --check` (passed)

- Covered admin shell action failures:
  - `src/app/admin-memory-page.ts` now catches save, tag, and archive action
    handler failures and reports them through `errorMessage`.
  - `tests/app/server.test.ts` guards the rendered `/admin/memory` shell so
    those handlers keep the status fallback.

Verification plan:
- `npx vitest run tests/app/server.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/app/server.test.ts` (`67` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1835` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened admin shell error status rendering:
  - `src/app/admin-memory-page.ts` now maps caught values through a small
    `errorMessage` helper before writing status text.
  - `tests/app/server.test.ts` guards the rendered `/admin/memory` shell against
    direct `error.message` status writes.

Verification plan:
- `npx vitest run tests/app/server.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/app/server.test.ts` (`67` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1835` tests passed, `34` skipped)
- `git diff --check` (passed)

- Refreshed migration SQL comments:
  - `src/db/migrations/004_add_cascade_indexes.sql`,
    `005_add_compaction_archive.sql`, and
    `006_add_archive_unarchive.sql` now describe current compaction and
    unarchive behavior without internal `P17` or `P19.1` phase labels.
  - `tests/scripts/public-docs-drift.test.ts` now guards those migration
    comments against phase-label drift.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`42` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1835` tests passed, `34` skipped)
- `git diff --check` (passed)

- Tightened bare catch binding coverage:
  - Remaining bare `catch {}` clauses under `src/`, `tests/`, and `scripts/`
    now use explicit `_err: unknown` bindings.
  - `tests/scripts/source-conventions.test.ts` now fails catch clauses with no
    binding, preserving the contributor convention through AST coverage.

Verification plan:
- `npx vitest run tests/scripts/source-conventions.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/source-conventions.test.ts` (`2` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1834` tests passed, `34` skipped)
- `git diff --check` (passed)

- Added an explicit `any` type convention guard:
  - `tests/scripts/source-conventions.test.ts` now scans tracked TypeScript ASTs
    for `AnyKeyword` nodes.
  - This guards the contributor rule that untrusted input should use `unknown`,
    not `any`, without flagging ordinary identifiers like `expect.any(...)`.

Verification plan:
- `npx vitest run tests/scripts/source-conventions.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/source-conventions.test.ts` (`2` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1834` tests passed, `34` skipped)
- `git diff --check` (passed)

- Replaced the catch binding convention regex with AST traversal:
  - `tests/scripts/source-conventions.test.ts` now parses tracked TypeScript
    files with the TypeScript compiler API and inspects real `CatchClause`
    nodes.
  - This keeps the catch binding convention guard from flagging strings,
    comments, or diagnostic messages that only contain `catch (...)` text.

Verification plan:
- `npx vitest run tests/scripts/source-conventions.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/source-conventions.test.ts` (`1` test passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1833` tests passed, `34` skipped)
- `git diff --check` (passed)

- Extended catch binding convention coverage to tests and scripts:
  - `tests/scripts/source-conventions.test.ts` now scans tracked TypeScript
    under `src/`, `tests/`, and `scripts/`.
  - Remaining test catch bindings in secret-scrub, canonical-indexing,
    retrieve-memory, and pgvector integration tests now use `unknown`.

Verification plan:
- `npx vitest run tests/scripts/source-conventions.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/source-conventions.test.ts` (`1` test passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1833` tests passed, `34` skipped)
- `git diff --check` (passed)

- Guarded the eval harness package-exclusion invariant:
  - `tests/scripts/package-manifest.test.ts` now scans tracked runtime source
    files and fails if they import `src/eval/*`.
  - This keeps the `!dist/src/eval/` package allowlist exclusion safe if future
    runtime code starts depending on eval utilities.

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`5` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1833` tests passed, `34` skipped)
- `git diff --check` (passed)

- Excluded the compiled eval harness from npm tarballs:
  - `npm pack --dry-run --json` showed `dist/src/eval/*` in the package even
    though `src/eval/*` is imported only by tests.
  - `package.json` now excludes `!dist/src/eval/`, and
    `tests/scripts/package-manifest.test.ts` guards the allowlist.
  - English/Korean Unreleased changelog tarball-surface notes and
    `tests/scripts/public-docs-drift.test.ts` now mention the compiled eval
    harness exclusion.

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts tests/scripts/public-docs-drift.test.ts`
- `npm pack --dry-run --json` parsed for `dist/src/eval/`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts tests/scripts/public-docs-drift.test.ts`
  (`45` tests passed)
- `npm pack --dry-run --json` (`entryCount: 113`, no `dist/src/eval/` paths)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1832` tests passed, `34` skipped)
- `git diff --check` (passed)

- Guarded source catch binding conventions:
  - `src/mcp/canonical-services.ts`, `src/vector/pgvector-index.ts`,
    `src/embedding/transformers-embedding.ts`, and
    `src/store/memory-repository.ts` now type catch bindings as `unknown`.
  - `tests/scripts/source-conventions.test.ts` scans tracked source files so
    future `catch (err)` drift fails in the script test suite.

Verification plan:
- `npx vitest run tests/scripts/source-conventions.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/source-conventions.test.ts` (`1` test passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`80` files passed, `2` skipped; `1832` tests passed, `34` skipped)
- `git diff --check` (passed)

- Tightened Docker build context hygiene:
  - `.dockerignore` now excludes local agent/workflow artifacts, internal docs,
    and common desktop/editor metadata from Docker build contexts.
  - `tests/scripts/dockerfile-hardening.test.ts` now guards the internal
    artifact exclusions so the builder-stage `COPY . .` path does not
    accidentally absorb them later.

Verification plan:
- `npx vitest run tests/scripts/dockerfile-hardening.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/dockerfile-hardening.test.ts` (`6` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1831` tests passed, `34` skipped)
- `git diff --check` (passed)

- Guarded CPU-only CI install steps:
  - `tests/scripts/ci-workflow-hygiene.test.ts` now asserts all three CI
    `Install` steps keep using `ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci`.
  - This preserves the existing runner-stability workaround that avoids flaky
    GPU binary downloads on CPU-only GitHub Actions runners.

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`10` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1830` tests passed, `34` skipped)
- `git diff --check` (passed)

- Aligned Postgres-backed test wording:
  - `.github/workflows/ci.yml` now names the backend-gated step
    `Run Postgres-backed suites`.
  - `tests/store/memory-repository.test.ts`,
    `tests/jobs/ingest-job-repository.test.ts`, and
    `tests/db/migrate.test.ts` use the same Postgres-backed wording in their
    skip comments.
  - `tests/scripts/ci-workflow-hygiene.test.ts` guards the updated step name.

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`9` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1829` tests passed, `34` skipped)
- `git diff --check` (passed)

- Refreshed semantic dedup MCP test naming:
  - `tests/mcp/server.test.ts` now names the `semanticDedupThreshold` behavior
    without the planning-era `(P18)` label.
  - `tests/scripts/public-docs-drift.test.ts` now guards that stale phrase
    alongside the existing compaction drift checks.

Verification plan:
- `npx vitest run tests/mcp/server.test.ts tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/mcp/server.test.ts tests/scripts/public-docs-drift.test.ts`
  (`172` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1829` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened CI workflow job-section tests:
  - `tests/scripts/ci-workflow-hygiene.test.ts` now asserts the
    `pg-integration` and `pgvector-integration` job headings exist, and that
    pgvector follows Postgres, before slicing backend job sections.
  - This makes backend job command guards fail clearly if the workflow layout
    changes.

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`9` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1829` tests passed, `34` skipped)
- `git diff --check` (passed)

- Guarded the focused pgvector CI job:
  - `tests/scripts/ci-workflow-hygiene.test.ts` now checks the
    `pgvector-integration` job sets `PGVECTOR_TEST_URL` and runs only
    `tests/vector/pgvector-index.integration.test.ts`.
  - This complements the Postgres integration job guard and keeps both
    backend-gated CI jobs focused.

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`9` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1829` tests passed, `34` skipped)
- `git diff --check` (passed)

- Focused the Postgres integration CI job:
  - `.github/workflows/ci.yml` now runs only
    `tests/store/memory-repository.test.ts`,
    `tests/jobs/ingest-job-repository.test.ts`, and
    `tests/db/migrate.test.ts` in the `pg-integration` job.
  - The main Node matrix still runs `npm test`; narrowing the Postgres job
    avoids duplicating the full suite while keeping the backend-gated coverage.
  - `tests/scripts/ci-workflow-hygiene.test.ts` now guards the focused command.

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`8` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1828` tests passed, `34` skipped)
- `git diff --check` (passed)

- Aligned integration skip guidance:
  - `CONTRIBUTING.md`, `CONTRIBUTING.ko.md`, `docs/troubleshooting.md`, and
    `docs/troubleshooting.ko.md` now document both Postgres-backed
    repository/migration skips and `PGVECTOR_TEST_URL`-gated pgvector adapter
    skips.
  - `.github/workflows/ci.yml` main-matrix test comment now reflects the same
    split, with dedicated backend jobs below.
  - `tests/scripts/public-docs-drift.test.ts` and
    `tests/scripts/ci-workflow-hygiene.test.ts` now guard the current wording.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts tests/scripts/ci-workflow-hygiene.test.ts`
  (`48` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1827` tests passed, `34` skipped)
- `git diff --check` (passed)

- Refreshed semantic compaction comments:
  - `src/compact/compact-memory.ts` now describes the semantic compaction
    orchestrator without the planning-era `P18.1` label.
  - `src/mcp/types.ts` now describes opt-in semantic dedup without the
    planning-era `P18` label.
  - `tests/scripts/public-docs-drift.test.ts` now guards those exact stale
    phrases alongside the existing compaction comment checks.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`41` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1826` tests passed, `34` skipped)
- `git diff --check` (passed)

- Refreshed compaction cleanup sweeper comments:
  - `.env.example` now describes compaction-apply Qdrant cleanup retries
    without the planning-era `P17` label.
  - `src/compact/sweeper-loop.ts` now describes the default-disabled
    env-driven opt-in behavior without saying the machinery ships in `P19`.
  - `tests/scripts/public-docs-drift.test.ts` now guards those exact stale
    phrases alongside the existing compaction comment checks.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`41` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1826` tests passed, `34` skipped)
- `git diff --check` (passed)

- Aligned contributor test command spelling:
  - `CONTRIBUTING.md` and `CONTRIBUTING.ko.md` now use `npm test` in the daily
    command tables, matching README common commands and PR verification.
  - `tests/scripts/public-docs-drift.test.ts` now guards the exact English and
    Korean table rows so the docs do not drift back to mixed spellings.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`41` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1826` tests passed, `34` skipped)
- `git diff --check` (passed)

- Aligned README common commands:
  - `README.md` and `README.ko.md` now list `npm run build` and
    `npm audit --audit-level=moderate` alongside typecheck/test in the common
    commands section.
  - `tests/scripts/public-docs-drift.test.ts` now checks the shared
    verification command set across README, CONTRIBUTING, and the PR template.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`41` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1826` tests passed, `34` skipped)
- `git diff --check` (passed)

- Added CI build coverage:
  - `.github/workflows/ci.yml` now runs `npm run build` in the main Node matrix
    after typecheck and before non-PG tests.
  - `tests/scripts/ci-workflow-hygiene.test.ts` now guards the build step and
    its ordering.
  - Source checked: `CONTRIBUTING.md`, `CONTRIBUTING.ko.md`, and the PR
    template already require `npm run build` as part of local/PR verification;
    this aligns CI with that repository policy.

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`6` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1826` tests passed, `34` skipped)
- `git diff --check` (passed)

- Added explicit CI job timeouts:
  - `.github/workflows/ci.yml` now sets `timeout-minutes: 30` on
    `typecheck-and-test`, `pg-integration`, and `pgvector-integration`.
  - `tests/scripts/ci-workflow-hygiene.test.ts` now guards those timeouts so
    hung jobs do not fall back to GitHub Actions' default 360-minute limit.
  - Source checked: GitHub Actions workflow syntax documents
    `jobs.<job_id>.timeout-minutes` and says the default job timeout is 360
    minutes:
    https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idtimeout-minutes

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`5` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1825` tests passed, `34` skipped)
- `git diff --check` (passed)

- Refreshed compaction apply and MCP type comments:
  - `src/compact/apply-compaction.ts` now describes the destructive apply path,
    advisory-lock scope choice, and rate limit without internal phase labels.
  - `src/mcp/types.ts` now describes compact apply result fields and unarchive
    tool types with current feature wording.
  - Historical changelog and migration comments remain untouched because those
    describe past release context.
  - `tests/scripts/public-docs-drift.test.ts` now guards the stale source
    phrases from returning.

Verification plan:
- `npx vitest run tests/compact/apply-compaction.test.ts tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/compact/apply-compaction.test.ts tests/scripts/public-docs-drift.test.ts`
  (`82` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1824` tests passed, `34` skipped)
- `git diff --check` (passed)

- Refreshed memory archive source labels:
  - `src/store/memory-archive-repository.ts` no longer describes the
    compaction apply path, rate-limit helper, or unarchive recovery flow with
    internal phase labels.
  - Direct `restoreToCanonical` calls now report missing `source_id` without a
    `pre-P19.1` label.
  - The documented `unarchive_memory` skipped outcome reason remains
    `pre_p19.1_archive_missing_source_id` for client compatibility; changing
    that API string is a separate compatibility decision, not a cleanup.
  - `tests/scripts/public-docs-drift.test.ts` guards against the stale source
    phrases returning.

Verification plan:
- `npx vitest run tests/store/memory-archive-repository.test.ts tests/compact/unarchive-compaction.test.ts tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/store/memory-archive-repository.test.ts tests/compact/unarchive-compaction.test.ts tests/scripts/public-docs-drift.test.ts`
  (`112` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1823` tests passed, `34` skipped)
- `git diff --check` (passed)

- Cleaned up public architecture phase labels:
  - `docs/architecture.md` and `docs/architecture.ko.md` now use feature
    names for the compact apply and unarchive data-flow sections instead of
    internal phase labels.
  - The unarchive skip path now describes rows with missing `source_id`
    directly instead of referring to `pre-P19.1`.
  - `tests/scripts/public-docs-drift.test.ts` now guards against `(P17)`,
    `(P19.1)`, and `pre-P19.1` returning to public architecture docs.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`39` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1822` tests passed, `34` skipped)
- `git diff --check` (passed)

- Refreshed ingest sweeper repository comments:
  - `src/jobs/ingest-job-repository.ts` now describes `listPendingForRetry` as
    a read-only monitoring/manual replay query and points production sweepers
    at the implemented `claimPendingForRetry` claim path.
  - `tests/scripts/public-docs-drift.test.ts` now guards against
    reintroducing the stale future-tense "The sweeper PR will" wording.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npx vitest run tests/jobs/ingest-job-claim.test.ts tests/compact/ingest-sweeper.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts tests/jobs/ingest-job-claim.test.ts tests/compact/ingest-sweeper.test.ts`
  (`102` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1821` tests passed, `34` skipped)
- `git diff --check` (passed)

- Aligned contributing daily commands:
  - `CONTRIBUTING.md` and `CONTRIBUTING.ko.md` now list `npm run build` and
    `npm audit --audit-level=moderate` in the daily command tables.
  - `tests/scripts/public-docs-drift.test.ts` now guards those table entries
    alongside the shared verification command set.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`37` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1820` tests passed, `34` skipped)
- `git diff --check` (passed)

- Refreshed compaction plan comments:
  - `src/compact/compact-memory.ts` now describes the current shared dry-run
    and destructive-apply result-shape role instead of a future P17 extension
    point.
  - `tests/scripts/public-docs-drift.test.ts` now guards that stale planning
    wording does not return.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npx vitest run tests/compact/compact-memory.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`37` tests passed)
- `npx vitest run tests/compact/compact-memory.test.ts` (`36` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1820` tests passed, `34` skipped)
- `git diff --check` (passed)

- Aligned contributing verification guidance:
  - `CONTRIBUTING.md` and `CONTRIBUTING.ko.md` now ask contributors to run
    `npm run typecheck`, `npm run build`, `npm audit --audit-level=moderate`,
    and `npm test` before pushing.
  - `tests/scripts/public-docs-drift.test.ts` now guards the shared command set
    across the PR template and both contributing docs.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`37` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1820` tests passed, `34` skipped)
- `git diff --check` (passed)

- Aligned PR verification checklist:
  - `.github/PULL_REQUEST_TEMPLATE.md` now asks contributors to include
    `npm run typecheck`, `npm run build`, `npm audit --audit-level=moderate`,
    and `npm test` results for non-trivial changes.
  - `tests/scripts/public-docs-drift.test.ts` now guards the PR test-plan
    checklist so it stays aligned with the local verification loop and CI audit
    coverage.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`37` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1820` tests passed, `34` skipped)
- `git diff --check` (passed)

- Documented `MEMORY_API_TOKENS` colon restrictions:
  - `.env.example`, `docs/configuration.md`, and `docs/configuration.ko.md`
    now state that token values cannot contain `:` because it is reserved for
    the optional `token:org` binding separator.
  - `tests/scripts/public-docs-drift.test.ts` now guards the env-template and
    English/Korean configuration wording.
  - `CHANGELOG.md` and `CHANGELOG.ko.md` record the public configuration docs
    clarification.
  - Source checked: `docs/superpowers/audit/02-security.md` finding 11 asked
    for the colon restriction to be explicit in config docs and the env var
    comment. Runtime parsing and tests already reject multiple-colon entries.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`36` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1819` tests passed, `34` skipped)
- `git diff --check` (passed)

- Added CI dependency audit coverage:
  - `.github/workflows/ci.yml` now runs
    `npm audit --audit-level=moderate` in the `typecheck-and-test` job after
    dependency installation and before typecheck/test.
  - `tests/scripts/ci-workflow-hygiene.test.ts` now guards that the audit step
    remains in the CI workflow.
  - Source checked: repo security audit notes called for running `npm audit`
    as part of CI (`docs/superpowers/audit/02-security.md`).
  - Source checked: npm docs recommend adding `npm audit` to continuous
    integration and document `--audit-level=moderate` as the CI failure
    threshold for moderate-or-higher vulnerabilities:
    https://docs.npmjs.com/auditing-package-dependencies-for-security-vulnerabilities/
    https://docs.npmjs.com/cli/v8/commands/npm-audit/

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`4` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1818` tests passed, `34` skipped)
- `git diff --check` (passed)

- Restricted CI workflow token permissions:
  - `.github/workflows/ci.yml` now sets top-level `permissions:
    contents: read` for the default `GITHUB_TOKEN`.
  - `tests/scripts/ci-workflow-hygiene.test.ts` guards the least-privilege
    workflow permission block and prevents broad write grants from creeping in.
  - Source checked: GitHub Actions secure-use guidance recommends minimum
    required `GITHUB_TOKEN` permissions and read-only repository contents by
    default:
    https://docs.github.com/en/actions/reference/security/secure-use
  - Source checked: GitHub workflow syntax documents top-level `permissions`
    and that unspecified permissions become `none` when a permission is set:
    https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax

Verification plan:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/ci-workflow-hygiene.test.ts` (`3` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`79` files passed, `2` skipped; `1817` tests passed, `34` skipped)
- `git diff --check` (passed)

- Guarded local secret/generated artifact ignore patterns:
  - `.gitignore` now ignores local `.env` variants, `.envrc`, and generated
    `.akasha/` client/hook artifacts while keeping `.env.example` tracked.
  - `tests/scripts/repo-secret-hygiene.test.ts` now verifies those ignore
    patterns stay present and those local artifacts stay out of tracked files.

Verification plan:
- `npx vitest run tests/scripts/repo-secret-hygiene.test.ts`
- `git check-ignore -v .env .env.local .envrc .akasha/mcp/codex.toml`
- `git check-ignore -v .env.example` (expected no match)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/repo-secret-hygiene.test.ts` (`6` tests passed)
- `git check-ignore -v .env .env.local .envrc .akasha/mcp/codex.toml`
  (all ignored by `.gitignore`)
- `git check-ignore -v .env.example` (no match; tracked template remains
  available)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`78` files passed, `2` skipped; `1814` tests passed, `34` skipped)
- `git diff --check` (passed)

- Added generated metadata ignore-pattern coverage:
  - `tests/scripts/repo-secret-hygiene.test.ts` now verifies `.gitignore`
    keeps the desktop/editor metadata patterns that the tracked-file hygiene
    guard expects.

Verification plan:
- `npx vitest run tests/scripts/repo-secret-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/repo-secret-hygiene.test.ts` (`4` tests passed)
- Generated-metadata workspace scan excluding `node_modules`, `.git`, and
  `.worktrees` (no matches)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`78` files passed, `2` skipped; `1812` tests passed, `34` skipped)
- `git diff --check` (passed)

- Broadened generated metadata hygiene:
  - Removed ignored desktop metadata artifacts from the workspace.
  - `.gitignore` now covers common desktop/editor metadata files.
  - `tests/scripts/repo-secret-hygiene.test.ts` now guards against tracked
    desktop/editor metadata files, not only `.DS_Store`.

Verification plan:
- `npx vitest run tests/scripts/repo-secret-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/repo-secret-hygiene.test.ts` (`3` tests passed)
- Generated-metadata workspace scan excluding `node_modules`, `.git`, and
  `.worktrees` (no matches)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`78` files passed, `2` skipped; `1811` tests passed, `34` skipped)
- `git diff --check` (passed)

- Cleaned up Finder metadata hygiene:
  - Removed ignored workspace artifact `.github/.DS_Store`.
  - `tests/scripts/repo-secret-hygiene.test.ts` now guards against tracked
    `.DS_Store` files.

Verification plan:
- `npx vitest run tests/scripts/repo-secret-hygiene.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/repo-secret-hygiene.test.ts` (`3` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`78` files passed, `2` skipped; `1811` tests passed, `34` skipped)
- `git diff --check` (passed)

- Localized Korean setup and embedding labels:
  - `README.ko.md`, `docs/configuration.ko.md`, `docs/security.ko.md`, and
    `docs/troubleshooting.ko.md` now avoid mixed English `default`/`stub`
    labels in setup, embedding, and backup snippets.
  - `tests/scripts/public-docs-drift.test.ts` now guards those localized Korean
    setup and embedding labels.
  - `CHANGELOG.md` and `CHANGELOG.ko.md` record the public documentation polish.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`35` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`78` files passed, `2` skipped; `1810` tests passed, `34` skipped)
- `git diff --check` (passed)

- Localized Korean README comparison-table labels:
  - `README.ko.md` now uses Korean labels for non-code comparison-table status
    cells such as OpenAI default, hosted, wrapper-only, varies, proprietary,
    and deprecated.
  - `tests/scripts/public-docs-drift.test.ts` now guards the localized Korean
    comparison-table labels.
  - `CHANGELOG.md` and `CHANGELOG.ko.md` record the public documentation polish.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`34` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`78` files passed, `2` skipped; `1809` tests passed, `34` skipped)
- `git diff --check` (passed)

- Localized Korean README comparison copy:
  - `README.ko.md` now avoids mixed English positioning phrases such as
    `무료/로컬 default`, `distinctively`, and `peers 는 skip` in the comparison
    section.
  - `tests/scripts/public-docs-drift.test.ts` now guards the localized Korean
    comparison wording.
  - `CHANGELOG.md` and `CHANGELOG.ko.md` record the public documentation polish.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`33` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`78` files passed, `2` skipped; `1808` tests passed, `34` skipped)
- `git diff --check` (passed)

- Aligned Korean backup guidance wording:
  - `README.ko.md`, `docs/operations.ko.md`, and
    `docs/self-hosted-operations.ko.md` now describe pgvector backup logical
    data paths in Korean instead of inheriting English README phrasing.
  - `tests/scripts/public-docs-drift.test.ts` now validates English and Korean
    backup wording separately.
  - `CHANGELOG.md` and `CHANGELOG.ko.md` record the public documentation polish.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`32` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`78` files passed, `2` skipped; `1807` tests passed, `34` skipped)
- `git diff --check` (passed)

- Aligned Korean public-doc body links with Korean mirrors:
  - `README.ko.md`, `CONTRIBUTING.ko.md`, `docs/configuration.ko.md`,
    `docs/operations.ko.md`, `docs/security.ko.md`, and
    `docs/troubleshooting.ko.md` now point body links at Korean mirror files
    where those mirrors exist.
  - Explicit language-switch links and `docs/README.ko.md` bilingual index
    columns remain unchanged.
  - `tests/scripts/public-docs-drift.test.ts` now guards these mirror links.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`32` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`78` files passed, `2` skipped; `1807` tests passed, `34` skipped)
- `git diff --check` (passed)

- Aligned the feature request scope dropdown with vector-backend support:
  - `.github/ISSUE_TEMPLATE/feature_request.yml` now uses `Vector backend
    (Qdrant / pgvector)` instead of Qdrant-only wording.
  - `tests/scripts/public-docs-drift.test.ts` now uses a shared issue-template
    dropdown helper and guards the feature-request scope option.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`31` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`78` files passed, `2` skipped; `1806` tests passed, `34` skipped)
- `git diff --check` (passed)

- Added missing pgvector npm package metadata:
  - `package.json#keywords` now includes `pgvector`, matching the package
    description and public vector-backend docs.
  - `tests/scripts/package-manifest.test.ts` now guards the backend metadata
    keywords together with the package description.
  - `CHANGELOG.md` and `CHANGELOG.ko.md` record the user-visible metadata fix.

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm pack --dry-run --json`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`4` tests passed)
- `npm pack --dry-run --json` (passed; `prepack` rebuilt `dist/`, `115`
  package entries)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`78` files passed, `2` skipped; `1805` tests passed, `34` skipped)
- `git diff --check` (passed)

- Aligned the bug report deployment dropdown with vector-backend support:
  - `.github/ISSUE_TEMPLATE/bug_report.yml` now describes custom deployments as
    external Postgres plus Qdrant or pgvector.
  - `tests/scripts/public-docs-drift.test.ts` now uses a shared dropdown-option
    helper and guards the deployment option alongside provider options.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`30` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`78` files passed, `2` skipped; `1805` tests passed, `34` skipped)
  - A previous full-suite attempt hit a transient 5s timeout in
    `tests/scripts/backup-verify.test.ts`; rerunning that file passed (`60`
    tests) before the final full-suite pass.
- `git diff --check` (passed)

- Fixed bug report template drift:
  - `.github/ISSUE_TEMPLATE/bug_report.yml` now lists `transformers`, `openai`,
    and `local`, matching the supported provider set and putting the default
    first.
  - The markdown security link now uses `../../SECURITY.md`, matching the
    checklist link from the issue-template location.
  - `tests/scripts/public-docs-drift.test.ts` now guards the provider option
    list and security links.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`29` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`78` files passed, `2` skipped; `1804` tests passed, `34` skipped)
- `git diff --check` (passed)

- Aligned npm package metadata with the pluggable vector-backend docs:
  - `package.json#description` now describes Postgres-backed storage with
    Qdrant or pgvector search instead of implying Qdrant-only operation.
  - `tests/scripts/package-manifest.test.ts` now guards that npm metadata
    wording alongside the package publish surface.
  - `CHANGELOG.md` and `CHANGELOG.ko.md` record the user-visible metadata fix.

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm pack --dry-run --json`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`4` tests passed)
- `npm pack --dry-run --json` (passed; `prepack` rebuilt `dist/`, `115`
  package entries)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`78` files passed, `2` skipped; `1802` tests passed, `34` skipped)
- `git diff --check` (passed)

- Removed the source-checkout-only installer from the npm package allowlist:
  - `package.json#files` no longer includes `install.sh`; the script remains a
    repository-checkout installer and source-checkout docs may still reference
    it.
  - `tests/scripts/package-manifest.test.ts` now expects the smaller allowlist
    and explicitly rejects `install.sh` as a source-checkout-only package entry.
  - `PLAN.md` and `BACKLOG.md` reflect the completed package-surface hygiene
    correction.
  - No `DECISIONS.md` entry is needed because this is a package-surface hygiene
    correction, not a durable installer behavior or package UX decision.

Verification plan:
- `npx vitest run tests/scripts/package-manifest.test.ts`
- `npm pack --dry-run --json`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts` (`3` tests passed)
- `npm pack --dry-run --json` (passed; `prepack` rebuilt `dist/`, `115`
  package entries)
  - Included built runtime output under `dist/src/**` and `dist/scripts/**`,
    plus `scripts/*.sh`, `.env.example`, public docs, mirrored root docs, and
    `LICENSE`.
  - Excluded `install.sh`, `docker/**`, `compose*.yaml`, root `src/**`, and
    `tests/**`.
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`78` files passed, `2` skipped; `1800` tests passed, `34` skipped)
- `git diff --check` (passed)

- Added the missing Unreleased npm package tarball changelog notes:
  - `CHANGELOG.md` now says published packages include built runtime output
    under `dist/`, exclude root source/tests/CI/internal work tracking plus
    source-checkout-only `install.sh` and Docker/Compose assets, and rebuild a
    clean `dist/` via `prepack`.
  - `CHANGELOG.ko.md` carries the equivalent Korean Unreleased note.
  - `tests/scripts/public-docs-drift.test.ts` now checks only the Unreleased
    changelog sections for stable package tarball markers in both languages.

Verification plan:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate`
- `npm test`
- `git diff --check`

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`27` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`78` files passed, `2` skipped; `1801` tests passed, `34` skipped)
- `git diff --check` (passed)

- Fixed stale Unreleased ingest outbox sweeper changelog wording:
  - `CHANGELOG.md` and `CHANGELOG.ko.md` now describe Migration 007 as shipped
    Qdrant outbox support for the implemented opt-in ingest sweeper/retry loop,
    including the current `qdrant_*` columns and `INGEST_SWEEP_ENABLED` path.
  - `tests/scripts/public-docs-drift.test.ts` now guards only the Unreleased
    Migration 007 ingest outbox bullet against stale `#12 branch`, `in-flight`,
    and `in-progress` wording, leaving older release history unrestricted.
  - Spec and code-quality reviews approved the scoped diff.

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (25 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1796 passed, 34 skipped across 79 files)
- `git diff --check`

- Fixed Unreleased changelog migration-range drift:
  - `CHANGELOG.md` and `CHANGELOG.ko.md` no longer present `001-012` as the
    current migration range in Unreleased; all range literals in that section
    now resolve to the current `001-015`.
  - `tests/scripts/public-docs-drift.test.ts` now checks the Unreleased
    changelog section only, so older release-history ranges remain allowed.
    Code-quality review tightened the guard to inspect every `NNN-NNN`
    literal and anchor on the actual `## [Unreleased]` heading.
  - Spec and code-quality re-review approved the final scoped diff.

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (24 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1795 passed, 34 skipped across 79 files)
- `git diff --check`

- Aligned the local installer with Docker and CI ONNX Runtime install behavior:
  - `install.sh` now runs `npm install` with
    `ONNXRUNTIME_NODE_INSTALL_CUDA=skip` so local dependency installation avoids
    downloading CUDA provider binaries.
  - `tests/scripts/dockerfile-hardening.test.ts` now verifies Dockerfile, CI,
    and local installer dependency installs use the supported environment
    variable and avoid the deprecated npm CLI config flag.
  - The locked `onnxruntime-node@1.21.0` install script documents
    `ONNXRUNTIME_NODE_INSTALL_CUDA` and the `skip` value, matching the
    Docker/CI hardening path:
    https://github.com/microsoft/onnxruntime/blob/v1.21.0/js/node/script/install.js
  - Spec and code-quality reviews approved the scoped diff.

Verification:
- `npx vitest run tests/scripts/dockerfile-hardening.test.ts` (5 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (1794 passed, 34 skipped across 79 files)
- `git diff --check`

## 2026-06-30

- Fixed Compose environment-flow wording drift:
  - `.env.example` now says Compose reads `.env` through `${VAR:-default}`
    substitution, matching `compose.yaml` and `docs/configuration.md`, instead
    of incorrectly saying `env_file` substitution.
  - `tests/scripts/public-docs-drift.test.ts` now guards that wording and the
    matching English/Korean configuration-doc flow descriptions.
  - Spec review passed.

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (23 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1793 passed, 34 skipped
  across 79 files)
- `git diff --check`

- Stabilized Docker image dependency installs for local CPU-only ONNX Runtime:
  - `docker/app.Dockerfile` now sets
    `ONNXRUNTIME_NODE_INSTALL_CUDA=skip` on both the builder and runtime
    `npm ci` commands.
  - `.github/workflows/ci.yml` now uses the same environment variable form
    instead of npm's unknown CLI config path.
  - `tests/scripts/dockerfile-hardening.test.ts` now verifies both Dockerfile
    install commands and CI use the environment variable, while the runtime
    Docker install still omits dev dependencies.
  - A worker subagent implemented the scoped patch. Spec review passed.
    Code-quality review caught the npm unknown-config risk in the initial CLI
    flag form; the final env-var version passed re-review.
- Source rationale:
  - The locked `onnxruntime-node` install script documents
    `ONNXRUNTIME_NODE_INSTALL_CUDA` as a supported way to control CUDA provider
    binary installation and `skip` as the value that keeps CPU ONNX Runtime
    available without downloading GPU binaries:
    https://github.com/microsoft/onnxruntime/blob/v1.21.0/js/node/script/install.js
  - A code-quality review caught that npm's unknown CLI config form can warn
    and may stop working in a future npm major, so Docker and CI now use the
    install script's direct environment variable.

Verification:
- `npx vitest run tests/scripts/dockerfile-hardening.test.ts tests/scripts/compose-config.test.ts tests/scripts/public-docs-drift.test.ts`
  (29 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1792 passed, 34 skipped
  across 79 files)
- `git diff --check`

- Hardened CLI direct input validation:
  - `parseCliArgs` now rejects malformed direct argv containers and non-string
    argv entries before command parsing.
  - `runCli` now rejects malformed direct option containers, non-string or
    blank cwd values, and malformed registry containers before command
    dispatch.
  - Omitted options, registry-free commands, and command-specific partial
    registry objects remain supported.
  - A worker subagent implemented the scoped patch; final verification passed
    focused CLI coverage, typecheck, build, audit, and the single-worker full
    suite.

Verification:
- `npx vitest run tests/cli.test.ts` (30 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1790 passed, 34 skipped
  across 79 files)

- Hardened operator server option validation:
  - `createOperatorServer` and `startOperatorServer` now reject malformed
    direct option containers, injected service config shapes, registry
    handles, logger handles, bearer token lists, dependency probes, rate
    limiters, OAuth verifier handles, metrics registries, and background queue
    collectors before reading option fields.
  - OAuth protected-resource metadata validation is now reusable and covers the
    metadata fields serialized by the well-known endpoint.
  - Existing omitted-options env fallback, empty-registry construction,
    auth-disabled warning behavior, metrics rendering, and background worker
    startup paths are preserved.
  - A worker subagent implemented the patch; spec review passed, and
    code-quality review drove fixes for conditional config/OAuth/logger
    validation before final approval.

Verification:
- `npx vitest run tests/app/operator-server-boundary.test.ts tests/app/server.test.ts tests/app/oauth-protected-resource.test.ts`
  (115 passed)
- `npx vitest run tests/app/operator-server-boundary.test.ts tests/app/server.test.ts tests/app/start-operator-server-metrics.test.ts tests/app/start-background-workers-server.test.ts tests/app/metrics.test.ts tests/app/mcp-http.test.ts tests/app/oauth-protected-resource.test.ts`
  (172 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1784 passed, 34 skipped
  across 79 files)
- `git diff --check`

- Hardened JSON HTTP route input validation:
  - `createMemoryRoutes` now rejects malformed direct route contexts, registry
    objects, logger handles, and OAuth metadata handles before route
    construction.
  - `resolveOrganizationId` now rejects malformed direct requests, request
    header maps, and raw-header arrays before organization header resolution.
  - Existing JSON HTTP behavior, organization resolution semantics, and
    partial-registry route construction are preserved.
  - A worker subagent implemented the patch; spec and code-quality reviewers
    passed after an explicit regression test preserved partial-registry route
    construction.
  - The first single-worker full-suite run hit the known timing-sensitive
    backup manifest shell test timeout; the focused backup case passed on
    rerun, and the full single-worker suite passed on rerun.

Verification:
- `npx vitest run tests/app/memory-routes-boundary.test.ts tests/mcp/resolve-org.test.ts tests/app/server.test.ts`
  (98 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run tests/scripts/backup-verify.test.ts -t "rejects existing null manifests before mutation" --maxWorkers=1 --minWorkers=1`
  (1 passed, 59 skipped)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1752 passed, 34 skipped
  across 78 files)
- `git diff --check`

- Hardened MCP HTTP request handler input validation:
  - `handleMcpHttpRequest` now rejects malformed direct options, request
    headers, response handles, registry handles, bearer token lists, OAuth
    verifier handles, rate limiter handles, logger handles, OAuth metadata
    handles, and allowed hostnames before request dispatch.
  - Existing method, host, origin, auth, rate-limit, and MCP transport behavior
    are preserved.
  - A read-only explorer subagent confirmed the minimal boundary gap; separate
    spec and code-quality reviewer subagents passed the final diff.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/app/mcp-http-boundary.test.ts tests/app/mcp-http.test.ts`
  (30 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1738 passed, 34 skipped
  across 77 files)
- `git diff --check`

- Hardened MCP server construction input validation:
  - `createMcpServer` now rejects malformed direct options, invalid shared
    registry options, malformed injected registry handles, and invalid
    authorizer callbacks before server/registry wiring.
  - `resolveStdioCwd` now rejects malformed env objects, non-string `DMO_CWD`
    values, invalid fallback callbacks, and blank fallback cwd values before
    stdio startup.
  - Existing default server construction, injected registry schema-only tests,
    and valid configured/fallback cwd behavior are preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/mcp/mcp-server-construction.test.ts tests/mcp/stdio-cwd.test.ts`
  (15 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1727 passed, 34 skipped
  across 76 files)
- `git diff --check`

- Hardened MCP registry construction input validation:
  - `createToolRegistry` now rejects malformed direct options, invalid cwd and
    default scope/actor text, malformed override repositories/loggers/audit
    handles, and invalid resolver functions before handler wiring.
  - `createToolHandlers` now rejects malformed direct construction input,
    invalid nested registry options, invalid cwd values, and invalid canonical
    service callback handles before destructuring shared MCP fields.
  - Existing default registry construction and MCP server behavior are
    preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/mcp/tool-registry.test.ts` (17 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1716 passed, 34 skipped
  across 75 files)
- `git diff --check`

- Hardened embedding provider factory input validation:
  - `createEmbeddingProvider` now rejects malformed direct input containers,
    malformed config objects, unknown provider names, invalid model/dimensions
    values, and non-string OpenAI API key values before provider construction.
  - The OpenAI provider branch now treats missing and whitespace-only API keys
    as the same documented `OPENAI_API_KEY` configuration error.
  - Existing local provider routing and provider-name helper behavior are
    preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/embedding/embedding-factory.test.ts` (13 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1699 passed, 34 skipped
  across 74 files)
- `git diff --check`

- Hardened local embedding client input validation:
  - `createLocalEmbeddingClient` now rejects malformed direct input containers
    and invalid dimensions before allocating deterministic vectors.
  - `embed` and `embedBatch` now reject malformed direct text input before
    hashing.
  - Existing deterministic vector generation, configured dimensions,
    L2-normalization, empty-batch behavior, and batch ordering are preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/embedding/local-embedding.test.ts` (11 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1686 passed, 34 skipped
  across 73 files)
- `git diff --check`

- Hardened transformers embedding client input validation:
  - `createTransformersEmbeddingClient` now rejects malformed direct input
    containers, blank/non-string model values, and invalid injected extractor
    factories before model loading.
  - `embed` and `embedBatch` now reject malformed direct text input before
    loading or calling the extractor.
  - Injected extractor factory results are validated before use, so malformed
    factories fail explicitly instead of being called as functions.
  - Existing extractor memoization, pooling/normalization options, empty-vector
    handling, and number-array conversion behavior are preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/embedding/transformers-embedding.test.ts` (12 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1675 passed, 34 skipped
  across 72 files)
- `git diff --check`

- Hardened OpenAI embedding client input validation:
  - `createOpenAiEmbeddingClient` now rejects malformed direct input
    containers, blank/non-string API key or model values, invalid injected
    client factories, and malformed injected client results before embedding
    calls.
  - `embed` and `embedBatch` now reject malformed direct text input before
    calling the injected OpenAI embeddings API client.
  - Injected `createClient` results are validated directly; an injection that
    returns `null` no longer falls back to constructing the real OpenAI SDK.
  - Existing successful single/batch embedding behavior and response-count
    validation are preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/embedding/openai-embeddings.test.ts` (16 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1667 passed, 34 skipped
  across 72 files)
- `git diff --check`

- Hardened Qdrant client factory input validation:
  - `createQdrantClient` now rejects malformed direct input containers and
    blank/non-string URL or API key values before constructing the Qdrant SDK
    client.
  - Added unit coverage that mocks `@qdrant/js-client-rest`, so valid
    construction is checked without network compatibility probes or SDK
    warnings.
  - Existing service config expectations and valid SDK construction behavior
    are preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/qdrant/client.test.ts` (6 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1657 passed, 34 skipped
  across 72 files)
- `git diff --check`

- Hardened memory chunk repository input validation:
  - `createMemoryChunkRepository` now rejects malformed pool handles before
    returning repository methods.
  - Chunk insert and replace paths now reject malformed direct input
    containers, invalid record IDs, blank organization IDs, invalid chunk
    shapes, invalid offsets, and invalid embedding config before SQL or
    transactions.
  - Point-ID updates, record deletes, list pagination, get-by-record, pending
    ingest replacement, and context-pack run creation now reject invalid direct
    IDs, mappings, scopes, options, dates, selected memory IDs, and text fields
    before query construction.
  - Existing batched insert/update SQL shape, replacement transaction behavior,
    list pagination, context-pack persistence, and pending ingest retry row
    creation are preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/store/canonical-indexing.test.ts` (47 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1651 passed, 34 skipped
  across 71 files)
- `git diff --check`

- Hardened goal-run repository input validation:
  - `createGoalRunRepository` now rejects malformed pool handles before
    returning repository methods.
  - Start/list/get/close paths now reject malformed direct input containers,
    missing or blank required text, invalid scope/status values, invalid run
    IDs, and invalid optional text before query construction.
  - Iteration recording now rejects malformed direct inputs, invalid run IDs,
    invalid outcomes, blank attempt/optional text, and invalid memory ID arrays
    before opening a transaction.
  - Existing row mapping, active-run conflict behavior, iteration count bumping,
    transaction rollback behavior, and active-run memory pinning behavior are
    preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/goal-run/goal-run-repository.test.ts` (27 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1630 passed, 34 skipped
  across 71 files)
- `git diff --check`

- Hardened DB boundary input validation:
  - `createPgPool` now rejects malformed input containers and blank/non-string
    connection strings before constructing a `pg.Pool`.
  - `readPostgresMigrationSql`, `runMigrations`, and
    `resolveMigrationDatabaseUrl` now reject malformed options, pool handles,
    env objects, and non-string env values before fallback reads or migration
    queries.
  - pgvector integration suites now defer real pool construction until
    `beforeAll` and treat blank `PGVECTOR_TEST_URL` as absent, so skipped
    suites do not fail during test collection.
  - Existing migration SQL fallback behavior, migration URL defaults, and
    pgvector opt-in integration behavior are preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/db/connection.test.ts tests/db/migrate.test.ts`
  (21 passed, 8 skipped)
- `npx vitest run tests/db/connection.test.ts tests/db/migrate.test.ts tests/vector/pgvector-index.integration.test.ts`
  (35 passed, 20 skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1615 passed, 34 skipped
  across 71 files)
- `git diff --check`

- Hardened memory archive cleanup input validation:
  - `createMemoryArchiveRepository` now rejects malformed pool handles before
    returning repository methods.
  - Qdrant cleanup status, find, claim, unarchive marking, and restored-record
    delete helpers now reject invalid IDs, statuses, error-message types,
    claim input containers, limits, and timestamps before query construction.
  - Existing compaction run creation, archive apply, cleanup claim SQL shape,
    unarchive restore behavior, and scope-lock behavior are preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/store/memory-archive-repository.test.ts` (44 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1603 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened ingest job repository input validation:
  - `createIngestJobRepository` now rejects malformed pool handles before
    returning repository methods.
  - Create/update methods now reject malformed direct inputs, invalid job IDs,
    invalid memory record IDs, invalid attempt counts, and invalid retry dates
    before query construction or failure logging.
  - Retry list/claim methods now validate direct input containers, positive
    limits, and valid timestamps before computing visibility windows or
    querying.
  - Existing claim SQL shape, visibility timeout behavior, error
    serialization, and integration-only persistence behavior are preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/jobs/ingest-job-claim.test.ts tests/jobs/serialize-error.test.ts`
  (17 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1592 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened audit repository input validation:
  - `createAuditLogRepository` now rejects malformed pool handles before
    returning repository methods.
  - `record` now rejects malformed direct audit entries, missing/blank required
    text fields, invalid outcome values, invalid optional text fields, and
    negative/non-finite durations before constructing insert queries.
  - `listByOrganization` now rejects malformed direct options objects before
    resolving limits or querying.
  - Existing organization checks, audit limit bounds, error-message truncation,
    audit-list behavior, and best-effort tool-boundary audit handling are
    preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/audit/audit-truncation.test.ts tests/audit/audit-write.test.ts`
  (33 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1582 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened project-ingest input validation:
  - `collectProjectSources` now rejects non-string, blank, missing, and
    non-directory project roots before joining approved source paths or reading
    files.
  - `ingestProjectArtifacts` now rejects malformed direct inputs, blank project
    roots, blank project IDs, missing repository objects, and invalid
    `repository.addMemory` handles before filesystem or persistence work.
  - Existing approved-source filtering and normalized project memory ingestion
    behavior is preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/ingest/ingest-project.test.ts` (7 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1568 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened OAuth scope enforcement input validation:
  - `checkOAuthScopes` and `requiredScopeKindForTool` now reject malformed
    direct scope input containers before reading tool arguments such as
    `dryRun`.
  - OAuth token scope lists now must be arrays of strings before scope matching
    runs.
  - `acceptedScopesForKind` now rejects unsupported direct scope kinds with an
    explicit error.
  - Unsupported direct tool names now fail explicitly instead of falling
    through scope-kind switch logic.
  - Existing HTTP route scope enforcement, MCP Streamable HTTP authorization,
    JWT verification, and static-token bypass behavior is preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/app/oauth-token-auth.test.ts` (21 passed)
- `npx vitest run tests/app/oauth-token-auth.test.ts tests/app/mcp-http.test.ts tests/app/server.test.ts`
  (107 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1562 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened dependency health probe input validation:
  - `checkDependencies` now rejects malformed direct probe containers before
    iterating entries or reporting readiness checks.
  - Dependency probe names are constrained to the typed low-cardinality set:
    Postgres, Qdrant, and OpenAI.
  - `buildPostgresProbe` now validates its pool and `query` method before
    returning a probe closure.
  - `buildQdrantProbe` and `buildOpenAiProbe` now reject malformed direct
    inputs, blank URL/API-key values, invalid optional fetch handles, and
    invalid timeout values before returning a probe closure.
  - Existing `/readyz`, `/metrics` dependency gauges, probe failure reporting,
    and provider/backend probe selection behavior is preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/health/check-dependencies.test.ts` (23 passed)
- `npx vitest run tests/health/check-dependencies.test.ts tests/app/server.test.ts tests/app/metrics.test.ts`
  (126 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1559 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened metrics-registry boundary validation:
  - `createMetricsRegistry` now rejects malformed direct HTTP request
    observations before normalizing methods or recording samples.
  - Sweeper observations now validate worker/status enums, finite durations,
    and finite known row counts before mutating tick or row counters.
  - Dependency reports now validate report status, check containers, check
    names/statuses, and finite durations before they can be rendered.
  - Background queue backlog snapshots now validate their container shape,
    collection status, rows, and finite counts before label rendering while
    still filtering unknown queue/state strings from output.
  - Existing `/metrics`, `/readyz`, background worker metrics, and collector
    failure behavior is preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/app/metrics.test.ts` (36 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1545 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened worker-process input validation:
  - `runWorkerProcess` now rejects invalid direct options before resolving
    defaults or invoking the background-worker starter.
  - Worker process options now validate optional logger, environment flag
    values, metrics recorder, and injected starter function.
  - Handles returned by injected starters must provide valid worker names and a
    stop function before `startedWorkers` is read or startup/no-worker logging
    runs.
  - Existing fail-fast delegation, no-worker warning, successful handle return,
    and app/server startup behavior is preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/app/worker.test.ts` (18 passed)
- `npx vitest run tests/app/worker.test.ts tests/app/background-workers.test.ts tests/app/start-background-workers-server.test.ts tests/app/start-operator-server-metrics.test.ts tests/app/server.test.ts`
  (110 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1524 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened background-worker coordinator input validation:
  - `startBackgroundWorkers` now rejects non-object direct options before
    reading worker flags, bootstrapping services, or starting sweepers.
  - Coordinator options now validate logger methods, environment flag types,
    fail-fast mode, metrics recorders, service bootstrap, and injected starter
    functions.
  - Bootstrap service results must provide the expected service objects and an
    optional `close` function.
  - Malformed bootstrap service results are rejected in fail-fast mode and
    logged as worker startup failures in default mode without starting sweepers.
  - Existing disabled-worker noop behavior, shared bootstrap, stop handling,
    fail-fast bootstrap errors, server startup resilience, and metrics wiring is
    preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/app/background-workers.test.ts` (21 passed)
- `npx vitest run tests/app/background-workers.test.ts tests/app/start-background-workers-server.test.ts tests/app/start-operator-server-metrics.test.ts tests/app/worker.test.ts tests/app/server.test.ts`
  (93 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1507 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened sweeper loop input validation:
  - `startBackgroundSweeper` and `startIngestSweeper` now reject non-object
    direct input before reading loop options, scheduling timers, or logging
    startup.
  - Loop logger methods, optional metrics recorders, and interval values are
    validated before any background sweep can be scheduled.
  - `intervalMs` now rejects non-finite, non-integer, and sub-1000 values.
  - Malformed loop input is covered with no-claim assertions for both
    compaction and ingest sweepers.
  - Existing tick scheduling, stop handling, metric recording, error swallowing,
    and environment parsing behavior is preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/compact/sweeper-loop.test.ts tests/compact/ingest-sweeper-loop.test.ts`
  (46 passed)
- `npx vitest run tests/compact/sweeper-loop.test.ts tests/compact/ingest-sweeper-loop.test.ts tests/compact/outbox-sweeper.test.ts tests/compact/ingest-sweeper.test.ts tests/app/background-workers.test.ts tests/app/start-background-workers-server.test.ts tests/app/start-operator-server-metrics.test.ts`
  (132 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1489 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened ingest sweeper input validation:
  - `runIngestSweep` now rejects non-object direct input before claiming jobs,
    reading chunks, embedding, deleting old vectors, or upserting new vectors.
  - Sweeper dependencies, logger methods, optional tunables, and injected clock
    results are validated before repository calls.
  - Claimed ingest jobs must provide positive safe-integer job and memory record
    IDs, non-blank organization IDs, and non-negative safe-integer Qdrant
    attempt counts before per-job work starts.
  - Reindexable chunks and embedding vectors are validated before vector
    deletes or upserts.
  - Malformed chunk or embedding data stays in the existing per-job retry/fail
    path while avoiding vector side effects.
  - Existing empty sweep, success, no-chunk completion, retry, give-up, custom
    batch size, and idempotent re-upsert behavior is preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/compact/ingest-sweeper.test.ts` (49 passed)
- `npx vitest run tests/compact/ingest-sweeper.test.ts tests/compact/ingest-sweeper-loop.test.ts tests/store/canonical-indexing.test.ts tests/vector/point-builder.test.ts tests/app/background-workers.test.ts tests/app/start-background-workers-server.test.ts tests/app/start-operator-server-metrics.test.ts`
  (117 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1463 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened outbox sweeper input validation:
  - `runOutboxSweep` now rejects non-object direct input before reading tunables,
    claiming rows, or deleting Qdrant points.
  - Sweeper dependencies, logger methods, optional tunables, and injected clock
    results are validated before repository calls.
  - Claimed cleanup rows must provide positive safe-integer archive IDs,
    non-blank organization IDs, non-blank Qdrant point IDs, and non-negative
    safe-integer attempt counts before vector deletion or status updates.
  - Malformed direct input and malformed claimed rows are covered with
    no-side-effect assertions for claims, status updates, and vector deletes.
  - Existing empty sweep, clean, retry, give-up, and custom tunable behavior is
    preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/compact/outbox-sweeper.test.ts` (30 passed)
- `npx vitest run tests/compact/outbox-sweeper.test.ts tests/compact/sweeper-loop.test.ts tests/compact/apply-compaction.test.ts tests/app/background-workers.test.ts tests/app/start-background-workers-server.test.ts tests/app/start-operator-server-metrics.test.ts`
  (88 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1429 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened apply compaction input validation:
  - `applyCompaction` now rejects non-object direct input before generated run
    IDs, semantic embedding, rate-limit checks, archive repository calls, or
    Qdrant deletes.
  - The apply path now reuses compaction-plan input validation before semantic
    embedding can read record content.
  - Apply-specific validation covers organization ID, actor, semantic threshold,
    dependency shape, optional embedding client, optional rate-limit config,
    generated run IDs, and injected clock results.
  - Malformed direct calls are covered with no-side-effect assertions across
    generated IDs, embeddings, archive repository calls, and vector deletes.
  - Existing dry-run, apply, replay, rate-limit, duplicate/decay, semantic
    fallback, Qdrant-pending, and PG-failure behavior is preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/compact/apply-compaction.test.ts` (41 passed)
- `npx vitest run tests/compact/apply-compaction.test.ts tests/compact/compact-memory.test.ts tests/compact/semantic-duplicates.test.ts tests/compact/unarchive-compaction.test.ts tests/mcp/server.test.ts tests/app/server.test.ts`
  (323 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1405 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened unarchive compaction input validation:
  - `unarchiveCompaction` now rejects non-object direct inputs before reading
    archive IDs or starting restore work.
  - Archive IDs must be supplied as an array of positive safe integers.
  - Organization ID and actor must be non-blank strings.
  - Malformed direct input is covered with no-side-effect assertions across the
    archive repository, chunk repository, embedding client, and vector index.
  - Existing empty-input, skip, restore, batched embedding, compensation, and
    per-archive failure isolation behavior is preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/compact/unarchive-compaction.test.ts` (28 passed)
- `npx vitest run tests/compact/unarchive-compaction.test.ts tests/mcp/server.test.ts tests/app/server.test.ts`
  (226 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1378 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened compaction plan input validation:
  - `buildCompactionPlan` now rejects non-object direct inputs before duplicate,
    decay, semantic-group override, or promotion planning.
  - Plan records must provide positive safe-integer IDs, valid memory/source
    types, string content, string `createdAt`, and finite optional importance.
  - Scope, scope labels, dry-run flag, optional project key, decay parameters,
    injected dates, and semantic duplicate override groups are validated before
    result construction.
  - `shouldPromoteRecord` now rejects malformed direct records before source or
    content inspection.
  - Existing exact duplicate detection, decay defaults, semantic override use,
    promotion candidate selection, and summary output behavior is preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/compact/compact-memory.test.ts` (36 passed)
- `npx vitest run tests/compact/compact-memory.test.ts tests/compact/apply-compaction.test.ts tests/compact/detect-duplicates.test.ts tests/compact/decay-score.test.ts tests/mcp/server.test.ts`
  (228 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1363 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened semantic duplicate input validation:
  - `cosineSimilarity` now rejects non-array direct vector inputs before
    reading lengths.
  - `findSemanticDuplicates` now rejects non-array record collections,
    malformed records, non-positive/non-safe record IDs, and non-finite
    importance values before clustering.
  - Embeddings must be supplied through a map-like object, and explicit
    embedding values must be arrays of finite numbers.
  - Missing embeddings still skip records, but malformed embedding values now
    fail before semantic grouping.
  - Existing cosine scoring, default threshold, missing-embedding skip behavior,
    and highest-importance/lowest-id keep rule are preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/compact/semantic-duplicates.test.ts` (20 passed)
- `npx vitest run tests/compact/semantic-duplicates.test.ts tests/compact/apply-compaction.test.ts tests/compact/compact-memory.test.ts tests/goal-run/find-repeat-attempts.test.ts`
  (66 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1337 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened OAuth protected-resource helper validation:
  - Bearer challenge builders now reject invalid direct config inputs before
    header formatting.
  - Challenge configs must provide object metadata, string metadata URL, and
    string `scopes_supported` entries.
  - Insufficient-scope challenges now reject non-string direct scope values
    before auth-param escaping.
  - Metadata URL construction now rejects non-string direct resource values
    before `URL` parsing.
  - Metadata path checks now return false for non-string direct inputs.
  - Existing metadata generation, well-known URL derivation, challenge
    formatting, and auth-param escaping behavior is preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/app/oauth-protected-resource.test.ts` (16 passed)
- `npx vitest run tests/app/oauth-protected-resource.test.ts tests/app/oauth-token-auth.test.ts tests/app/mcp-http.test.ts tests/app/server.test.ts`
  (120 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1334 passed, 34 skipped
  across 70 files)
- `git diff --check`

- Hardened MCP utility primitive validation:
  - `formatMemoryIdentifier` now rejects non-object records, blank scope
    fields, and non-positive/non-safe IDs before formatting.
  - `normalizeLimit` now rejects non-number direct limits before integer/range
    checks.
  - `toMemoryType` now rejects non-string direct kinds before supported-kind
    conversion.
  - `summarize` now rejects non-string direct content before slicing.
  - Existing identifier formatting, default limit, supported memory-kind
    conversion, and summary truncation behavior is preserved.
  - Full-suite verification used a single worker because the default parallel
    suite is currently timing-sensitive in unrelated server startup and backup
    shell tests under load.

Verification:
- `npx vitest run tests/mcp/tool-utils.test.ts` (30 passed)
- `npx vitest run tests/mcp/tool-utils.test.ts tests/mcp/server.test.ts tests/mcp/resolve-org.test.ts`
  (178 passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npx vitest run --maxWorkers=1 --minWorkers=1` (1331 passed, 34 skipped
  across 70 files)
- `git diff --check`

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

- Fixed Unreleased Node runtime changelog drift after the project moved to
  Node 22+:
  - `CHANGELOG.md` and `CHANGELOG.ko.md` now describe the current README
    landing badge set as Node ≥22 instead of Node ≥20.
  - `tests/scripts/public-docs-drift.test.ts` checks only Unreleased changelog
    sections for stale `Node ≥20`, `node-%3E%3D20`, and `Node 20+22` current
    support wording, while preserving historical 1.0.0 release text.
  - Existing Node runtime decision/source remains `DECISIONS.md` 2026-06-27;
    no new decision was needed.

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`25` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`77` files passed, `2` skipped; `1796` tests passed, `34` skipped)
- `git diff --check`

- Fixed stale pre-P17 compaction apply comments:
  - `src/app/server.ts` now describes the current unauthenticated non-loopback
    risk as destructive/admin operations instead of a future P17 apply path.
  - `tests/compact/compact-memory.test.ts` now documents that
    `buildCompactionPlan` is planning/summary-only and the `applyCompaction`
    orchestrator fills actual archived IDs.
  - `tests/scripts/public-docs-drift.test.ts` now guards exact stale
    future-tense phrases only in the touched source/test files.

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts tests/compact/compact-memory.test.ts`
  (`62` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`77` files passed, `2` skipped; `1797` tests passed, `34` skipped)
- `git diff --check` (passed)

- Fixed npm package tarball manifest hygiene:
  - `package.json` now uses an explicit `files` allowlist for `dist/`, runtime
    shell scripts, `.env.example`, public docs, Korean mirror docs, `LICENSE`,
    and `install.sh`.
  - The allowlist excludes source, tests, CI config, internal work-tracking
    docs, and compiled test/config artifacts via omission plus targeted
    negations.
  - `npm run build` now runs a portable Node `fs.rmSync` clean before TypeScript
    emits, and `prepack` runs the build before `npm pack` / publish.
  - Added `tests/scripts/package-manifest.test.ts` so CI can verify the
    manifest contract without invoking `npm pack` or requiring prebuilt `dist`.
- Source rationale:
  - npm package metadata `files` controls package inclusion, while packages
    without an `.npmignore` fall back to `.gitignore` behavior for exclusion.
    That fallback was excluding `dist/` while allowing tracked source, tests,
    CI, and internal planning files into the tarball.
    Official docs: https://docs.npmjs.com/cli/v11/configuring-npm/package-json#files
    and https://docs.npmjs.com/cli/v11/using-npm/developers#keeping-files-out-of-your-package
  - No `DECISIONS.md` entry: this is package hygiene for the existing runtime
    shape, not a durable package UX/API decision.

Verification:
- `npx vitest run tests/scripts/package-manifest.test.ts tests/scripts/public-docs-drift.test.ts`
  (`29` tests passed)
- `npm run build` (passed; runs `clean` before `tsc`)
- `npm pack --dry-run --json` (passed; `prepack` rebuilt first, no
  `.npmignore`/`.gitignore` fallback warning, `116` entries)
  - Included built runtime output under `dist/src/**` and `dist/scripts/**`,
    shell scripts under `scripts/*.sh`, `.env.example`, public docs, mirrored
    root docs, `LICENSE`, and `install.sh`.
  - Excluded root `src/**`, `tests/**`, `.github/**`, `PLAN.md`, `BACKLOG.md`,
    `WORKLOG.md`, and `DECISIONS.md`.
- `npm run typecheck`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`78` files passed, `2` skipped; `1800` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened vector upsert point-list boundaries:
  - Added RED coverage showing Qdrant and pgvector upserts threw incidental
    `points.length` property-access errors for `null` point-list inputs.
  - `assertVectorPointOrganizationIds` now accepts unknown point-list inputs,
    rejects non-arrays with `upsert: points must be an array`, and still
    performs the existing per-point object, payload, and organization checks.
  - Qdrant and pgvector `upsert` paths now run the shared boundary guard before
    the empty-list no-op check, preserving `[]` behavior while failing malformed
    inputs before clients are called.
  - No `DECISIONS.md` entry: this is adapter input hardening for the existing
    vector port contract, not a new durable architecture decision.

Verification:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed with `Cannot read properties of null (reading 'length')`.
- GREEN focused: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`2` files passed; `135` tests passed; `12` skipped)
- Related: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/organization-id.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
  (`7` files passed; `313` tests passed; `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2152` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened vector delete point-ID list boundaries:
  - Added RED coverage showing Qdrant and pgvector `delete(ids)` threw
    incidental `ids.length` property-access errors for `null` ID-list inputs.
  - Qdrant and pgvector point-ID list guards now accept unknown inputs, reject
    non-arrays with `delete: ids must be an array`, and still validate each ID
    as a non-empty string.
  - Both adapters now run ID-list validation before the empty-list no-op,
    preserving empty delete behavior while failing malformed inputs before
    Qdrant or SQL calls.
  - No `DECISIONS.md` entry: this is adapter input hardening for the existing
    vector delete contract, not a new durable architecture decision.

Verification:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed with `Cannot read properties of null (reading 'length')`.
- GREEN focused: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`2` files passed; `137` tests passed; `12` skipped)
- Related: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/organization-id.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
  (`7` files passed; `315` tests passed; `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2154` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened vector delete-by-record ID list boundaries:
  - Added RED coverage showing Qdrant and pgvector `deleteByRecordIds` threw
    incidental `recordIds.length` property-access errors for `null` record-ID
    list inputs.
  - Qdrant and pgvector record-ID list guards now accept unknown inputs, reject
    non-arrays with `deleteByRecordIds: recordIds must be an array`, and still
    validate each record ID as a positive safe integer.
  - Both adapters now run record-ID list validation before the empty-list
    data-loss guard, preserving empty delete-by-record behavior while failing
    malformed inputs before Qdrant or SQL calls.
  - No `DECISIONS.md` entry: this is adapter input hardening for the existing
    vector delete-by-record contract, not a new durable architecture decision.

Verification:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed with `Cannot read properties of null (reading 'length')`.
- GREEN focused: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`2` files passed; `139` tests passed; `12` skipped)
- Related: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/organization-id.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
  (`7` files passed; `317` tests passed; `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2156` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened vector query vector list boundaries:
  - Added RED coverage showing Qdrant and pgvector queries threw incidental
    `vector.length` property-access errors for `null` query vector inputs.
  - Qdrant and pgvector query vector guards now accept unknown inputs, reject
    non-arrays with `query vector must be an array`, and still validate empty
    vectors plus finite numeric components.
  - Both adapters now fail malformed query vector inputs before Qdrant or SQL
    calls, preserving existing empty-vector and finite-component behavior.
  - No `DECISIONS.md` entry: this is adapter input hardening for the existing
    vector query contract, not a new durable architecture decision.

Verification:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed with `Cannot read properties of null (reading 'length')`.
- GREEN focused: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`2` files passed; `141` tests passed; `12` skipped)
- Related: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/organization-id.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
  (`7` files passed; `319` tests passed; `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2158` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened vector upsert point vector boundaries:
  - Added RED coverage showing Qdrant and pgvector upserts threw incidental
    `point.vector.length` property-access errors for `null` point vector
    inputs.
  - Qdrant and pgvector point vector guards now reject non-array vectors with
    `upsert: point "<id>" vector must be an array`, and still validate empty
    vectors plus finite numeric components.
  - Both adapters now fail malformed point vector inputs before Qdrant or SQL
    calls, preserving existing empty-vector and finite-component behavior.
  - No `DECISIONS.md` entry: this is adapter input hardening for the existing
    vector upsert contract, not a new durable architecture decision.

Verification:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed with `Cannot read properties of null (reading 'length')`.
- GREEN focused: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`2` files passed; `143` tests passed; `12` skipped)
- Related: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/organization-id.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
  (`7` files passed; `321` tests passed; `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2160` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened vector query filter object boundaries:
  - Added RED coverage showing Qdrant and pgvector queries threw incidental
    `filter.organizationId` property-access errors for `null` query filters.
  - Qdrant and pgvector query paths now reject non-object filters with
    `filter must be an object` before validating organization, scope, and
    project-key fields.
  - pgvector query validation now checks vector and limit first, then validates
    the filter object before reading filter fields; storage clients are still
    untouched for malformed boundary inputs.
  - No `DECISIONS.md` entry: this is adapter input hardening for the existing
    vector query contract, not a new durable architecture decision.

Verification:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed with `Cannot read properties of null (reading 'organizationId')`.
- GREEN focused: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`2` files passed; `145` tests passed; `12` skipped)
- Related: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/organization-id.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
  (`7` files passed; `323` tests passed; `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2162` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened vector query scope-list boundaries:
  - Added RED coverage showing Qdrant queries accepted empty `filter.scopes`
    and pgvector queries reached the DB client path for the same malformed
    filter.
  - Qdrant and pgvector filter-scope guards now reject empty arrays with
    `filter.scopes must be a non-empty array`, preserving the existing
    non-array and per-scope object/string checks.
  - This keeps vector queries scoped to at least one caller-provided scope,
    matching `retrieveMemory`'s project/user query contract.
  - No `DECISIONS.md` entry: this is adapter input hardening for the existing
    vector query contract, not a new durable architecture decision.

Verification:
- RED: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed because Qdrant resolved and pgvector reached client-path property
  access for empty `filter.scopes`.
- GREEN focused: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`2` files passed; `147` tests passed; `12` skipped)
- Related: `npx vitest run tests/vector/qdrant-index.test.ts tests/vector/pgvector-index.integration.test.ts tests/vector/organization-id.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
  (`7` files passed; `325` tests passed; `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2164` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened pgvector query `memory_record_id` string parsing:
  - Added RED coverage showing a malformed row value of `"0x10"` was accepted
    by `Number(value)` and returned as `memory_record_id: 16`.
  - `toPgVectorPositiveSafeInteger` now permits string inputs only when they
    are decimal digit strings before numeric conversion; normal node-postgres
    BIGINT strings such as `"42"` remain supported.
  - No `DECISIONS.md` entry: this is adapter row-mapping hardening for the
    existing pgvector read contract, not a new durable architecture decision.

Verification:
- RED: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed because `"0x10"` resolved as `memory_record_id: 16`.
- GREEN focused: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`1` file passed; `73` tests passed; `12` skipped)
- Related: `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/vector/qdrant-index.test.ts tests/vector/organization-id.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
  (`7` files passed; `326` tests passed; `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2165` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened pgvector query `score` string parsing:
  - Added RED coverage showing a malformed row value of `"0x10"` was accepted
    by `Number(value)` and returned as `score: 16`.
  - `toPgVectorFiniteNumber` now permits string inputs only when they are
    decimal/exponent numeric strings before numeric conversion; normal
    pgvector score strings such as `"0.875"` remain supported.
  - No `DECISIONS.md` entry: this is adapter row-mapping hardening for the
    existing pgvector read contract, not a new durable architecture decision.

Verification:
- RED: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  failed because `"0x10"` resolved as `score: 16`.
- GREEN focused: `npx vitest run tests/vector/pgvector-index.integration.test.ts --reporter=dot`
  (`1` file passed; `74` tests passed; `12` skipped)
- Related: `npx vitest run tests/vector/pgvector-index.integration.test.ts tests/vector/qdrant-index.test.ts tests/vector/organization-id.test.ts tests/vector/point-builder.test.ts tests/search/retrieve-memory.test.ts tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts --reporter=dot`
  (`7` files passed; `327` tests passed; `12` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2166` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened shared DB number string parsing:
  - Added RED coverage showing shared `toNumber("0x10")` was accepted because
    it delegated directly to `Number(value)`.
  - `toNumber` now permits string inputs only when they are decimal/exponent
    numeric strings before numeric conversion; normal node-postgres numeric
    strings such as `"42"` and `"0.75"` remain supported.
  - This tightens all repository row mappers that use `toNumber` without
    adding per-repository code.
  - No `DECISIONS.md` entry: this is shared row-mapping hardening for the
    existing database utility contract, not a new durable architecture decision.

Verification:
- RED: `npx vitest run tests/store/db-utils.test.ts --reporter=dot`
  failed because `"0x10"` did not throw.
- GREEN focused: `npx vitest run tests/store/db-utils.test.ts --reporter=dot`
  (`1` file passed; `16` tests passed)
- Related: `npx vitest run tests/store/db-utils.test.ts tests/store/memory-repository.test.ts tests/store/memory-archive-repository.test.ts tests/store/canonical-indexing.test.ts tests/jobs/ingest-job-claim.test.ts tests/goal-run/goal-run-repository.test.ts tests/audit/audit-truncation.test.ts tests/audit/audit-write.test.ts --reporter=dot`
  (`8` files passed; `362` tests passed; `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`81` files passed, `2` skipped; `2167` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened background queue count string parsing:
  - Added RED coverage showing a malformed `COUNT(*)` row value of `"0x10"`
    was accepted by `Number(value)` and reported as queue backlog `16`.
  - `toNonNegativeInteger` now permits string inputs only when they are decimal
    digit strings before numeric conversion; normal Postgres count strings such
    as `"42"` remain supported.
  - No `DECISIONS.md` entry: this is metrics row-mapping hardening for the
    existing background queue metric contract, not a new durable architecture
    decision.

Verification:
- RED: `npx vitest run tests/app/background-queue-metrics.test.ts --reporter=dot`
  failed because `"0x10"` resolved as backlog counts of `16`.
- GREEN focused: `npx vitest run tests/app/background-queue-metrics.test.ts --reporter=dot`
  (`1` file passed; `10` tests passed)
- Related: `npx vitest run tests/app/background-queue-metrics.test.ts tests/app/metrics.test.ts tests/app/start-operator-server-metrics.test.ts tests/scripts/ci-workflow-hygiene.test.ts --reporter=dot`
  (`4` files passed; `81` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot` (`81` files passed, `2` skipped; `2168` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened MCP session prompt limit parsing:
  - Added RED coverage showing `akasha_session_start` accepted a prompt
    `limit` argument of `"0x10"` because `z.coerce.number()` converted it to
    `16` before dispatching to `build_context_pack`.
  - Replaced the prompt limit coercion with a schema that accepts numbers or
    decimal digit strings only, then applies the existing positive integer and
    max-100 bounds.
  - The existing decimal string prompt path (`"3"`) remains supported.
  - No `DECISIONS.md` entry: this is MCP prompt input hardening for the
    existing context-pack prompt contract, not a new durable architecture
    decision.

Verification:
- RED: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  failed because `"0x10"` resolved and dispatched instead of rejecting.
- GREEN focused: `npx vitest run tests/mcp/server.test.ts --reporter=dot`
  (`1` file passed; `132` tests passed)
- Related: `npx vitest run tests/mcp/server.test.ts tests/app/mcp-http.test.ts tests/app/server.test.ts --reporter=dot`
  (`3` files passed; `218` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- Initial `npm test -- --reporter=dot` run failed in
  `tests/app/start-background-workers-server.test.ts` and
  `tests/app/start-operator-server-metrics.test.ts` with transient worker
  startup expectations/timeouts.
- Isolated rerun: `npx vitest run tests/app/start-background-workers-server.test.ts tests/app/start-operator-server-metrics.test.ts --reporter=dot`
  (`2` files passed; `4` tests passed)
- Rerun: `npm test -- --reporter=dot`
  (`81` files passed, `2` skipped; `2169` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened background-worker operator server test isolation:
  - Observed a transient full-suite failure in
    `tests/app/start-background-workers-server.test.ts` and
    `tests/app/start-operator-server-metrics.test.ts` after the MCP prompt
    loop; both files passed when rerun in isolation and the full suite passed
    on immediate rerun.
  - Added per-test `vi.doUnmock(...)` and `vi.resetModules()` setup in the two
    files that import `startOperatorServer` after `vi.doMock`, ensuring their
    mocked `background-workers`, `background-queue-metrics`, and `db/connection`
    modules are applied before each dynamic server import.
  - No `DECISIONS.md` entry: this is test harness isolation hardening, not a
    runtime architecture decision.

Verification:
- Focused: `npx vitest run tests/app/start-background-workers-server.test.ts tests/app/start-operator-server-metrics.test.ts --reporter=dot`
  (`2` files passed; `4` tests passed)
- Related: `npx vitest run tests/app/start-background-workers-server.test.ts tests/app/start-operator-server-metrics.test.ts tests/app/background-workers.test.ts tests/app/operator-server-boundary.test.ts tests/app/server.test.ts --reporter=dot`
  (`5` files passed; `124` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`81` files passed, `2` skipped; `2169` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened background worker sweeper handle validation:
  - Added RED coverage showing a compaction sweeper starter that returned
    `{ stop: null }` was still recorded as a started `compaction` worker.
  - `startBackgroundWorkers` now validates each returned compaction/ingest
    sweeper handle before pushing it into the started-worker list.
  - Malformed handles now flow through the existing worker start failure path;
    by default other workers can still start, and fail-fast mode still cleans
    up already-started services before rejecting.
  - No `DECISIONS.md` entry: this tightens an existing runtime boundary rather
    than changing worker architecture.

Verification:
- RED: `npx vitest run tests/app/background-workers.test.ts --reporter=dot`
  failed because `startedWorkers` included malformed `compaction`.
- GREEN focused: `npx vitest run tests/app/background-workers.test.ts --reporter=dot`
  (`1` file passed; `22` tests passed)
- Related: `npx vitest run tests/app/background-workers.test.ts tests/app/worker.test.ts tests/app/start-background-workers-server.test.ts tests/app/start-operator-server-metrics.test.ts tests/app/operator-server-boundary.test.ts --reporter=dot`
  (`5` files passed; `76` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`81` files passed, `2` skipped; `2170` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened background worker stop cleanup:
  - Added RED coverage showing a worker `stop()` method that throws
    synchronously prevented later worker stops and canonical service cleanup.
  - `stopStartedWorkers` now wraps each `handle.stop()` call in an async
    callback before `Promise.allSettled`, so sync throws become rejected
    promises and cleanup proceeds consistently.
  - No `DECISIONS.md` entry: this is lifecycle cleanup hardening inside the
    existing worker architecture.

Verification:
- RED: `npx vitest run tests/app/background-workers.test.ts --reporter=dot`
  failed because the ingest stop and service close were not called after a
  synchronous compaction stop failure.
- GREEN focused: `npx vitest run tests/app/background-workers.test.ts --reporter=dot`
  (`1` file passed; `23` tests passed)
- Related: `npx vitest run tests/app/background-workers.test.ts tests/app/worker.test.ts tests/app/start-background-workers-server.test.ts tests/app/start-operator-server-metrics.test.ts tests/app/operator-server-boundary.test.ts --reporter=dot`
  (`5` files passed; `77` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`81` files passed, `2` skipped; `2171` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened operator server cleanup task wrapping:
  - Added RED coverage showing a probe-pool `end()` method that throws
    synchronously escaped the close-event cleanup path and skipped background
    worker shutdown.
  - `startOperatorServer` now wraps `probePool.end()` in
    `Promise.resolve().then(...)` and uses an async worker-stop continuation, so
    synchronous cleanup failures become rejected cleanup tasks.
  - Remaining cleanup work now runs through `settleCleanup`, and
    `closeOperatorServer` surfaces the original cleanup error as a rejection.
  - No `DECISIONS.md` entry: this is lifecycle cleanup hardening inside the
    existing operator server shutdown path.

Verification:
- RED: `npx vitest run tests/app/start-background-workers-server.test.ts --reporter=dot`
  failed because the synchronous probe-pool cleanup throw escaped the cleanup
  promise and worker shutdown was not observed.
- GREEN focused: `npx vitest run tests/app/start-background-workers-server.test.ts --reporter=dot`
  (`1` file passed; `4` tests passed)
- Related: `npx vitest run tests/app/start-background-workers-server.test.ts tests/app/start-operator-server-metrics.test.ts tests/app/operator-server-boundary.test.ts tests/app/background-workers.test.ts tests/app/server.test.ts tests/app/mcp-http.test.ts --reporter=dot`
  (`6` files passed; `146` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`81` files passed, `2` skipped; `2172` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened MCP HTTP per-request cleanup task wrapping:
  - Added RED coverage showing a `StreamableHTTPServerTransport.close()` method
    that throws synchronously prevented the per-request `McpServer.close()` from
    running.
  - MCP HTTP cleanup now wraps transport and server close calls in
    `Promise.resolve().then(...)`, so synchronous close failures become settled
    rejections and remaining cleanup tasks still run.
  - No `DECISIONS.md` entry: this is request cleanup hardening inside the
    existing Streamable HTTP path.

Verification:
- RED: `npx vitest run tests/app/mcp-http.test.ts --reporter=dot`
  failed because `McpServer.close()` was not called after synchronous transport
  cleanup failure.
- GREEN focused: `npx vitest run tests/app/mcp-http.test.ts --reporter=dot`
  (`1` file passed; `20` tests passed)
- Related: `npx vitest run tests/app/mcp-http.test.ts tests/app/mcp-http-boundary.test.ts tests/app/server.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`4` files passed; `230` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`81` files passed, `2` skipped; `2173` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened shared DB timestamp mapping:
  - Added RED coverage showing `toIsoString` returned malformed timestamp
    strings as-is and did not canonicalize valid timestamp strings without
    milliseconds.
  - `toIsoString` now accepts valid `Date` values and timezone-qualified
    timestamp strings, rejects malformed values with a clear database timestamp
    error, and returns canonical ISO strings.
  - This tightens repository row mapping for memory, archive, chunk, ingest
    job, goal-run, and audit-log records that share `toIsoString`.
  - No `DECISIONS.md` entry: this is boundary validation hardening for an
    existing shared mapper.

Verification:
- RED: `npx vitest run tests/store/db-utils.test.ts --reporter=dot`
  failed because malformed timestamp strings were returned and a valid
  timestamp string without milliseconds was not canonicalized.
- GREEN focused: `npx vitest run tests/store/db-utils.test.ts --reporter=dot`
  (`1` file passed; `29` tests passed)
- Related: `npx vitest run tests/store/db-utils.test.ts tests/store/memory-repository.test.ts tests/store/memory-archive-repository.test.ts tests/store/canonical-indexing.test.ts tests/jobs/ingest-job-repository.test.ts tests/goal-run/goal-run-repository.test.ts tests/audit/audit-write.test.ts tests/audit/audit-truncation.test.ts --reporter=dot`
  (`7` files passed, `1` skipped; `355` tests passed, `13` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`81` files passed, `2` skipped; `2186` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened audit log row outcome mapping:
  - Added RED coverage showing malformed stored audit `outcome` values were
    returned by `listByOrganization` instead of failing at the repository
    boundary.
  - Audit row mapping now treats DB `outcome` as unknown and reuses the
    existing `"ok" | "error"` guard before returning `StoredAuditLogEntry`.
  - No `DECISIONS.md` entry: this is row boundary validation hardening for an
    existing enum contract.

Verification:
- RED: `npx vitest run tests/audit/audit-truncation.test.ts --reporter=dot`
  failed because malformed audit row outcomes resolved instead of rejecting.
- GREEN focused: `npx vitest run tests/audit/audit-truncation.test.ts --reporter=dot`
  (`1` file passed; `41` tests passed)
- Related: `npx vitest run tests/audit/audit-truncation.test.ts tests/audit/audit-write.test.ts tests/mcp/server.test.ts tests/app/server.test.ts --reporter=dot`
  (`4` files passed; `247` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`81` files passed, `2` skipped; `2189` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened memory hydrated row enum mapping:
  - Added RED coverage showing malformed stored `kind`, `durability`,
    `scope_type`, source scope, and source type values were returned by
    `listMemory` instead of failing at the repository boundary.
  - Memory row mapping now treats those DB enum fields as unknown and maps them
    through explicit guards before returning `SearchMemoryResult`.
  - Update-memory entity graph re-persistence now also reuses the guarded row
    values before building graph inputs.
  - No `DECISIONS.md` entry: this is row boundary validation hardening for
    existing enum contracts.

Verification:
- RED: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  failed because malformed hydrated enum rows resolved instead of rejecting.
- GREEN focused: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `111` tests passed, `7` skipped)
- Related: `npx vitest run tests/store/memory-repository.test.ts tests/search/retrieve-memory.test.ts tests/mcp/server.test.ts tests/app/server.test.ts tests/compact/compact-memory.test.ts tests/compact/apply-compaction.test.ts --reporter=dot`
  (`6` files passed; `422` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`81` files passed, `2` skipped; `2194` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened goal-run row enum mapping:
  - Added RED coverage showing malformed stored run `scope_type`/`status` and
    iteration `outcome` values were returned by `get` instead of failing at the
    repository boundary.
  - Goal-run row mapping now treats these DB enum fields as unknown and reuses
    the existing scope/status/outcome guards before returning repository
    models.
  - No `DECISIONS.md` entry: this is row boundary validation hardening for
    existing enum contracts.

Verification:
- RED: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  failed because malformed goal-run enum rows resolved instead of rejecting.
- GREEN focused: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  (`1` file passed; `41` tests passed)
- Related: `npx vitest run tests/goal-run/goal-run-repository.test.ts tests/goal-run/goal-run-handlers.test.ts tests/goal-run/build-goal-context.test.ts tests/goal-run/find-repeat-attempts.test.ts tests/mcp/server.test.ts tests/app/server.test.ts --reporter=dot`
  (`6` files passed; `310` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`81` files passed, `2` skipped; `2197` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened ingest job row enum mapping:
  - Added RED coverage showing malformed stored `status` and `qdrant_status`
    values were returned by `create` result mapping instead of failing at the
    repository boundary.
  - Ingest job row mapping now treats those DB enum fields as unknown and maps
    them through explicit guards before returning repository models.
  - Added a non-PG unit block to the existing Postgres-gated ingest job suite
    so this boundary stays covered without requiring a database.
  - No `DECISIONS.md` entry: this is row boundary validation hardening for
    existing enum contracts.

Verification:
- RED: `npx vitest run tests/jobs/ingest-job-repository.test.ts --reporter=dot`
  failed because malformed ingest job enum rows resolved instead of rejecting.
- GREEN focused: `npx vitest run tests/jobs/ingest-job-repository.test.ts --reporter=dot`
  (`1` file passed; `2` tests passed, `6` skipped)
- Related: `npx vitest run tests/jobs/ingest-job-repository.test.ts tests/jobs/ingest-job-claim.test.ts tests/jobs/serialize-error.test.ts tests/compact/ingest-sweeper.test.ts tests/compact/ingest-sweeper-loop.test.ts tests/store/canonical-indexing.test.ts --reporter=dot`
  (`6` files passed; `154` tests passed, `6` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2199` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened memory archive row enum mapping:
  - Added RED coverage showing malformed stored compaction run `status` and
    archive record `scope_type`, `kind`, and `durability` values were returned
    instead of failing at the repository boundary.
  - Memory archive row mapping now validates those DB enum fields before
    returning compaction run or archive row models.
  - No `DECISIONS.md` entry: this is row boundary validation hardening for
    existing enum contracts.

Verification:
- RED: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  failed because malformed compaction/archive enum rows resolved instead of
  rejecting.
- GREEN focused: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `83` tests passed)
- Related: `npx vitest run tests/store/memory-archive-repository.test.ts tests/compact/apply-compaction.test.ts tests/compact/unarchive-compaction.test.ts tests/compact/outbox-sweeper.test.ts tests/compact/sweeper-loop.test.ts tests/compact/compact-memory.test.ts --reporter=dot`
  (`6` files passed; `243` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2203` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened canonical chunk row enum mapping:
  - Added RED coverage showing malformed stored `scope_type`, `kind`, and
    `durability` values were returned by `listChunks` instead of failing at the
    repository boundary.
  - `mapReindexableMemoryChunkRow` now treats DB enum fields as unknown and
    maps them through explicit guards before returning reindexable chunk
    results.
  - No `DECISIONS.md` entry: this is row boundary validation hardening for
    existing enum contracts.

Verification:
- RED: `npx vitest run tests/store/canonical-indexing.test.ts --reporter=dot`
  failed because malformed canonical chunk enum rows resolved instead of
  rejecting.
- GREEN focused: `npx vitest run tests/store/canonical-indexing.test.ts --reporter=dot`
  (`1` file passed; `61` tests passed)
- Related: `npx vitest run tests/store/canonical-indexing.test.ts tests/compact/ingest-sweeper.test.ts tests/compact/ingest-sweeper-loop.test.ts tests/search/retrieve-memory.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`5` files passed; `300` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2206` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened unarchive archive enum mapping:
  - Added RED coverage showing malformed archive `scopeType`, `kind`, and
    `durability` values were restored successfully instead of failing before
    side effects.
  - `restoreOne` now maps archive enum fields through explicit guards before
    canonical restore, chunk insertion, embedding, and vector upsert.
  - No `DECISIONS.md` entry: this is dependency-boundary validation hardening
    for existing enum contracts.

Verification:
- RED: `npx vitest run tests/compact/unarchive-compaction.test.ts --reporter=dot`
  failed because malformed archive enum values restored successfully.
- GREEN focused: `npx vitest run tests/compact/unarchive-compaction.test.ts --reporter=dot`
  (`1` file passed; `31` tests passed)
- Related: `npx vitest run tests/compact/unarchive-compaction.test.ts tests/store/memory-archive-repository.test.ts tests/compact/apply-compaction.test.ts tests/compact/outbox-sweeper.test.ts tests/compact/compact-memory.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`6` files passed; `355` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2209` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened compaction run completion input mapping:
  - Added RED coverage showing malformed direct `completeCompactionRun`
    run id, status, counters, and error message inputs resolved instead of
    failing before SQL.
  - Completion now validates all direct fields before issuing the
    `compaction_runs` update.
  - No `DECISIONS.md` entry: this is repository input-boundary validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  failed because malformed completion inputs resolved instead of rejecting.
- GREEN focused: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `91` tests passed)
- Related: `npx vitest run tests/store/memory-archive-repository.test.ts tests/compact/apply-compaction.test.ts tests/compact/compact-memory.test.ts tests/compact/outbox-sweeper.test.ts tests/compact/unarchive-compaction.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`6` files passed; `363` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2217` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened archive record apply input mapping:
  - Added RED coverage showing malformed direct `applyCompactionRecord`
    run/record ids, reason, kept record id, decay score, and timestamp inputs
    resolved or failed with incidental errors instead of clear pre-SQL errors.
  - Archive record apply now validates all direct fields before issuing the
    destructive delete/archive CTE.
  - No `DECISIONS.md` entry: this is repository input-boundary validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  failed because malformed apply inputs resolved or failed with an incidental
  timestamp error instead of clear boundary errors.
- GREEN focused: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `97` tests passed)
- Related: `npx vitest run tests/store/memory-archive-repository.test.ts tests/compact/apply-compaction.test.ts tests/compact/compact-memory.test.ts tests/compact/outbox-sweeper.test.ts tests/compact/unarchive-compaction.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`6` files passed; `369` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2223` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened compaction run create input mapping:
  - Added RED coverage showing malformed direct `createCompactionRun` actor,
    dry-run flag, timestamp, and idempotency key inputs resolved or failed with
    incidental timestamp errors instead of clear pre-SQL errors.
  - Compaction run creation now validates all run metadata fields before
    issuing the insert.
  - No `DECISIONS.md` entry: this is repository input-boundary validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  failed because malformed create-run inputs resolved or failed with an
  incidental timestamp error instead of clear boundary errors.
- GREEN focused: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `101` tests passed)
- Related: `npx vitest run tests/store/memory-archive-repository.test.ts tests/compact/apply-compaction.test.ts tests/compact/compact-memory.test.ts tests/compact/outbox-sweeper.test.ts tests/compact/unarchive-compaction.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`6` files passed; `373` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2227` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened archive lookup id input mapping:
  - Added RED coverage showing malformed direct `findArchiveByIds`
    archive id lists either threw incidental property-access errors or resolved
    after querying instead of failing before SQL.
  - Archive lookup now validates the id list and each id as a positive safe
    integer before querying archive rows.
  - No `DECISIONS.md` entry: this is repository input-boundary validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  failed because malformed archive id lists were not rejected with clear
  pre-SQL boundary errors.
- GREEN focused: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `105` tests passed)
- Related: `npx vitest run tests/store/memory-archive-repository.test.ts tests/compact/unarchive-compaction.test.ts tests/compact/apply-compaction.test.ts tests/compact/outbox-sweeper.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`5` files passed; `341` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2231` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened recent apply window input mapping:
  - Added RED coverage showing malformed direct `countRecentApplyRuns`
    window durations resolved after coercion instead of failing before SQL.
  - Recent apply counting now validates `windowMs` as a positive safe integer
    before building the Postgres interval parameter.
  - No `DECISIONS.md` entry: this is repository input-boundary validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  failed because malformed window durations resolved instead of rejecting.
- GREEN focused: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `110` tests passed)
- Related: `npx vitest run tests/store/memory-archive-repository.test.ts tests/compact/apply-compaction.test.ts tests/compact/compact-memory.test.ts tests/compact/outbox-sweeper.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`5` files passed; `351` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2236` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened compaction run lookup key mapping:
  - Added RED coverage showing malformed direct `findRunByIdempotencyKey`
    keys resolved after querying instead of failing before SQL.
  - Run lookup now validates idempotency keys as non-blank text before querying
    compaction run rows.
  - No `DECISIONS.md` entry: this is repository input-boundary validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  failed because malformed idempotency keys resolved instead of rejecting.
- GREEN focused: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `112` tests passed)
- Related: `npx vitest run tests/store/memory-archive-repository.test.ts tests/compact/apply-compaction.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`3` files passed; `285` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2238` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened archive restore input mapping:
  - Added RED coverage showing malformed direct `restoreToCanonical` archive
    objects, ids, enum values, and timestamps either inserted successfully or
    failed with incidental property-access errors instead of clear pre-SQL
    errors.
  - Restore now maps archive objects through explicit id, org, enum, content,
    nullable-string, and timestamp guards before inserting canonical memory
    rows.
  - No `DECISIONS.md` entry: this is repository input-boundary validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  failed because malformed restore archive inputs inserted or failed with
  incidental errors instead of clear boundary errors.
- GREEN focused: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `118` tests passed)
- Related: `npx vitest run tests/store/memory-archive-repository.test.ts tests/compact/unarchive-compaction.test.ts tests/compact/apply-compaction.test.ts tests/compact/outbox-sweeper.test.ts tests/compact/compact-memory.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`6` files passed; `390` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2244` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened archive scope lock input mapping:
  - Added RED coverage showing malformed direct `acquireScopeLock` inputs
    failed through incidental property access or field errors instead of clear
    pre-SQL object validation.
  - Advisory lock acquisition now validates the input object before reading
    organization and scope fields.
  - No `DECISIONS.md` entry: this is repository input-boundary validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  failed because malformed lock inputs were not rejected with clear object
  boundary errors.
- GREEN focused: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `120` tests passed)
- Related: `npx vitest run tests/store/memory-archive-repository.test.ts tests/compact/apply-compaction.test.ts tests/compact/compact-memory.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`4` files passed; `329` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2246` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened archive command object input mapping:
  - Added RED coverage showing malformed direct `createCompactionRun`,
    `applyCompactionRecord`, and `completeCompactionRun` input objects failed
    through incidental property access or field errors instead of clear
    pre-SQL object validation.
  - Compaction command entrypoints now validate direct input objects before
    reading command fields, while preserving the existing field-level guards.
  - No `DECISIONS.md` entry: this is repository input-boundary validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  failed because malformed command input objects were not rejected with clear
  object boundary errors.
- GREEN focused: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `126` tests passed)
- Related: `npx vitest run tests/store/memory-archive-repository.test.ts tests/compact/apply-compaction.test.ts tests/compact/compact-memory.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`4` files passed; `335` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2252` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened pending qdrant cleanup row metadata mapping:
  - Added RED coverage showing malformed pending/claimed cleanup row
    `organization_id` and `qdrant_point_ids` values were returned directly
    instead of failing at the repository boundary.
  - Pending cleanup reads and atomic claims now share one row mapper that
    validates cleanup row objects, organization IDs, qdrant point ID arrays,
    archive IDs, and attempt counts before returning worker payloads.
  - No `DECISIONS.md` entry: this is repository row-mapping validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  failed because malformed cleanup row metadata resolved instead of rejecting.
- GREEN focused: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `133` tests passed)
- Related: `npx vitest run tests/store/memory-archive-repository.test.ts tests/compact/outbox-sweeper.test.ts tests/compact/apply-compaction.test.ts tests/compact/compact-memory.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`5` files passed; `374` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2259` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened compaction run row organization mapping:
  - Added RED coverage showing malformed compaction run `organization_id`
    values were returned directly from replay lookups instead of failing at the
    repository boundary.
  - Compaction run row mapping now validates row objects and organization IDs
    before exposing run metadata, while preserving the existing status and
    counter guards.
  - No `DECISIONS.md` entry: this is repository row-mapping validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  failed because malformed compaction run organization metadata resolved
  instead of rejecting.
- GREEN focused: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `135` tests passed)
- Related: `npx vitest run tests/store/memory-archive-repository.test.ts tests/compact/apply-compaction.test.ts tests/compact/compact-memory.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`4` files passed; `344` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2261` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened archive lookup row scalar mapping:
  - Added RED coverage showing malformed archive lookup row organization,
    scope, content, and nullable text values were returned directly instead of
    failing at the repository boundary.
  - Archive lookup rows now pass through a shared mapper that validates row
    objects, IDs, scalar metadata, enums, integer importance, and timestamps
    before returning `ArchiveRow` results.
  - No `DECISIONS.md` entry: this is repository row-mapping validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  failed because malformed archive scalar metadata resolved instead of
  rejecting.
- GREEN focused: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `142` tests passed)
- Related: `npx vitest run tests/store/memory-archive-repository.test.ts tests/compact/unarchive-compaction.test.ts tests/compact/apply-compaction.test.ts tests/compact/outbox-sweeper.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`5` files passed; `378` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2268` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened archive apply qdrant point row mapping:
  - Added RED coverage showing malformed apply result `qdrant_point_ids` rows
    resolved by falling back to empty cleanup payloads or returning invalid
    point IDs.
  - Apply result rows now validate qdrant point ID arrays with the same
    non-blank string array guard used by pending cleanup row mapping.
  - No `DECISIONS.md` entry: this is repository row-mapping validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  failed because malformed apply qdrant point rows resolved instead of
  rejecting.
- GREEN focused: `npx vitest run tests/store/memory-archive-repository.test.ts --reporter=dot`
  (`1` file passed; `145` tests passed)
- Related: `npx vitest run tests/store/memory-archive-repository.test.ts tests/compact/apply-compaction.test.ts tests/compact/outbox-sweeper.test.ts tests/compact/compact-memory.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`5` files passed; `386` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2271` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened hydrated memory tag row mapping:
  - Added RED coverage showing malformed hydrated `tags` rows resolved by
    falling back to empty arrays or returning invalid tag values.
  - Hydrated memory row mapping now validates stored tag arrays and each tag as
    non-blank text before returning list/search records.
  - No `DECISIONS.md` entry: this is repository row-mapping validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  failed because malformed hydrated tag rows resolved instead of rejecting.
- GREEN focused: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `115` tests passed, `7` skipped)
- Related: `npx vitest run tests/store/memory-repository.test.ts tests/search/retrieve-memory.test.ts tests/context-pack/build-context-pack.test.ts tests/compact/compact-memory.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`5` files passed; `341` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2275` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened archive memory result row mapping:
  - Added RED coverage showing malformed `archiveMemoryRecord` result rows
    resolved by falling back to empty qdrant point IDs or returning invalid
    boolean status values.
  - Governance archive results now validate the `found` and `archived`
    booleans, and validate qdrant point IDs with the shared non-blank string
    array guard before returning cleanup payloads.
  - No `DECISIONS.md` entry: this is repository row-mapping validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  failed because malformed archive result rows resolved instead of rejecting.
- GREEN focused: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `120` tests passed, `7` skipped)
- Related: `npx vitest run tests/store/memory-repository.test.ts tests/app/memory-routes-boundary.test.ts tests/mcp/server.test.ts tests/search/retrieve-memory.test.ts tests/context-pack/build-context-pack.test.ts --reporter=dot`
  (`5` files passed; `324` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2280` tests passed, `34` skipped)
- `git diff --check` (passed)

- Hardened archive memory direct id mapping:
  - Added RED coverage showing malformed direct `archiveMemoryRecord` IDs
    reached the Postgres query and failed incidentally instead of failing with
    a clear pre-SQL boundary error.
  - Governance archive now validates direct memory IDs as positive safe
    integers before querying.
  - No `DECISIONS.md` entry: this is repository input-boundary validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  failed because malformed archive IDs reached the query path.
- GREEN focused: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `125` tests passed, `7` skipped)
- Related: `npx vitest run tests/store/memory-repository.test.ts tests/app/memory-routes-boundary.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`3` files passed; `271` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2285` tests passed, `34` skipped)
- `git diff --check` (passed)

## 2026-07-02 15:00 KST - Hydrated Memory Scalar Row Validation

- Hardened hydrated memory scalar row mapping:
  - Added RED coverage showing malformed hydrated organization, scope,
    content, and nullable scalar metadata resolved instead of failing at the
    repository boundary.
  - Hydrated memory row mapping now validates required memory/source scalar
    fields as non-blank text, content with the memory-content guard, and
    nullable text fields as string-or-null before returning list/search
    records.
  - No `DECISIONS.md` entry: this is repository row-mapping validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  failed with `14` malformed hydrated scalar row cases resolving instead of
  rejecting.
- GREEN focused: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `139` tests passed, `7` skipped)
- Related: `npx vitest run tests/store/memory-repository.test.ts tests/search/retrieve-memory.test.ts tests/context-pack/build-context-pack.test.ts tests/compact/compact-memory.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`5` files passed; `365` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check` (passed)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2299` tests passed, `34` skipped)

## 2026-07-02 15:04 KST - Graph Memory Row Scalar Validation

- Hardened graph entity and relationship row mapping:
  - Added RED coverage showing malformed graph organization IDs, entity kind
    values, normalized/display text, relationship types, nullable validity
    bounds, and endpoint entity metadata resolved instead of failing at the
    repository boundary.
  - Graph row mapping now validates required scalar fields as non-blank text,
    nullable validity bounds as null-or-nonblank text, and graph entity kind
    values against the extracted-entity kind set before returning inspection
    results.
  - No `DECISIONS.md` entry: this is repository row-mapping validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  failed with `25` malformed graph scalar/entity-kind cases resolving instead
  of rejecting.
- GREEN focused: `npx vitest run tests/store/memory-repository.test.ts --reporter=dot`
  (`1` file passed; `164` tests passed, `7` skipped)
- Related: `npx vitest run tests/store/memory-repository.test.ts tests/mcp/server.test.ts tests/app/server.test.ts tests/app/mcp-http.test.ts --reporter=dot`
  (`4` files passed; `383` tests passed, `7` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check` (passed)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2324` tests passed, `34` skipped)

## 2026-07-02 15:08 KST - Reindexable Memory Chunk Row Scalar Validation

- Hardened stored and reindexable memory chunk row mapping:
  - Added RED coverage showing malformed returned chunk content, embedding
    versions, organization/scope metadata, nullable text fields, and tag arrays
    resolved instead of failing at the repository boundary.
  - Stored chunk row mapping now validates content and embedding version as
    non-blank text; reindexable chunk rows now validate organization/scope
    metadata, nullable text fields, and non-blank tag arrays before returning
    indexing results.
  - No `DECISIONS.md` entry: this is repository row-mapping validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/store/canonical-indexing.test.ts --reporter=dot`
  failed with `15` malformed chunk row cases resolving instead of rejecting.
- GREEN focused: `npx vitest run tests/store/canonical-indexing.test.ts --reporter=dot`
  (`1` file passed; `76` tests passed)
- Related: `npx vitest run tests/store/canonical-indexing.test.ts tests/jobs/ingest-sweeper.test.ts tests/context-pack/build-context-pack.test.ts tests/vector/point-builder.test.ts --reporter=dot`
  (`3` files passed; `131` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check` (passed)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2339` tests passed, `34` skipped)

## 2026-07-02 15:11 KST - Ingest Job Row Scalar Validation

- Hardened ingest job scalar row mapping:
  - Added RED coverage showing malformed returned organization IDs and
    nullable ingest/qdrant error values resolved instead of failing at the
    repository boundary.
  - Ingest job rows now validate organization IDs as non-blank text and
    nullable error fields as string-or-null before returning job state to
    retry and background worker paths.
  - No `DECISIONS.md` entry: this is repository row-mapping validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/jobs/ingest-job-repository.test.ts --reporter=dot`
  failed with `4` malformed ingest job scalar row cases resolving instead of
  rejecting.
- GREEN focused: `npx vitest run tests/jobs/ingest-job-repository.test.ts --reporter=dot`
  (`1` file passed; `6` tests passed, `6` skipped)
- Related: `npx vitest run tests/jobs/ingest-job-repository.test.ts tests/jobs/ingest-job-claim.test.ts tests/jobs/serialize-error.test.ts tests/store/canonical-indexing.test.ts --reporter=dot`
  (`4` files passed; `104` tests passed, `6` skipped)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check` (passed)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2343` tests passed, `34` skipped)

## 2026-07-02 15:14 KST - Audit Log Row Scalar Validation

- Hardened audit log scalar row mapping:
  - Added RED coverage showing malformed returned organization IDs, actors,
    tools, nullable project/request IDs, and error message types resolved
    instead of failing at the repository boundary.
  - Audit log rows now validate required metadata as non-blank text, nullable
    project/request IDs as null-or-nonblank text, and error messages as
    string-or-null before returning stored audit entries.
  - No `DECISIONS.md` entry: this is repository row-mapping validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/audit/audit-truncation.test.ts --reporter=dot`
  failed with `11` malformed audit row scalar cases resolving instead of
  rejecting.
- GREEN focused: `npx vitest run tests/audit/audit-truncation.test.ts --reporter=dot`
  (`1` file passed; `52` tests passed)
- Related: `npx vitest run tests/audit/audit-truncation.test.ts tests/audit/audit-write.test.ts tests/app/memory-routes-boundary.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`4` files passed; `205` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check` (passed)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2354` tests passed, `34` skipped)

## 2026-07-02 15:19 KST - Goal Run Row Scalar Validation

- Hardened goal-run run and iteration scalar row mapping:
  - Added RED coverage showing malformed returned run organization/scope/goal
    text, nullable project/termination/close-note metadata, iteration
    organization IDs, attempts, summaries, and errors resolved instead of
    failing at the repository boundary.
  - Goal-run rows now validate required scalar metadata as non-blank text and
    nullable text fields as null-or-nonblank text before returning goal state
    to continuation and repeat-check paths.
  - No `DECISIONS.md` entry: this is repository row-mapping validation
    hardening for an existing contract.

Verification:
- RED: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  failed with `20` malformed goal-run scalar row cases resolving instead of
  rejecting.
- GREEN focused: `npx vitest run tests/goal-run/goal-run-repository.test.ts --reporter=dot`
  (`1` file passed; `61` tests passed)
- Related: `npx vitest run tests/goal-run/goal-run-repository.test.ts tests/goal-run/goal-run-handlers.test.ts tests/goal-run/build-goal-context.test.ts tests/goal-run/find-repeat-attempts.test.ts tests/mcp/server.test.ts --reporter=dot`
  (`5` files passed; `263` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `git diff --check` (passed)
- `npm test -- --reporter=dot`
  (`82` files passed, `1` skipped; `2374` tests passed, `34` skipped)
