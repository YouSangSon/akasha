# Akasha Extensibility Hardening Design

> Date: 2026-06-25
> Scope: public documentation correctness, tool-surface extensibility, MCP module boundaries, sweeper coordination, and deployment hardening.

## Goal

Make Akasha easier to extend and safer to operate by removing the remaining drift points between transports, shrinking the MCP server into clearer modules, correcting a weak multi-replica cleanup claim, hardening the container deployment defaults, and aligning public documentation with the current source.

This wave intentionally goes beyond the user's originally visible implementation needs: it targets the next set of maintainability and operational problems that would slow future tool additions, backend changes, and production deployment.

## Evidence Summary

- `src/app/routes/memory.ts` performs only minimal HTTP body validation, while `src/mcp/server.ts` owns the richer zod input schemas for MCP registration. The same tool contract is therefore expressed in two places.
- `src/mcp/server.ts` is over the project's 800-line guideline and mixes handler implementation, registry instrumentation, MCP registration, utility mapping, and repository conversion logic.
- `src/store/memory-archive-repository.ts` uses a bare `SELECT ... FOR UPDATE SKIP LOCKED` for archive cleanup claims. In autocommit mode, that lock is released after the select, while `docs/deployment.md` describes the sweeper as SQL-level multi-replica safe.
- `docker/app.Dockerfile` runs the app as the default image user, and `compose.yaml` still provides weak local defaults for Postgres and Qdrant credentials.
- Public docs are mostly aligned after the resilience waves, but stale code comments and operational claims remain. Internal `docs/superpowers/**` reports are historical artifacts and should not drive product-facing documentation promises.
- Baseline verification before this design: `npm run typecheck` passed and `npm test` passed with 375 passing tests and 27 environment-gated skips.

## Scope Boundary

This wave uses a product-facing documentation boundary:

- In scope: `README*.md`, `CONTRIBUTING*.md`, `SECURITY*.md` when touched by the changes, `.env.example`, `docs/*.md`, `docs/*.ko.md`, and source comments that describe current behavior.
- In scope: test coverage that prevents HTTP and MCP tool contracts from drifting again.
- Out of scope: translating every historical file under `docs/superpowers/**`. Those files are planning and audit artifacts, not the public operator documentation set.
- Out of scope: a UI, hosted service features, new vector backends, or read-replica routing.

## Architecture

### Tool Descriptors

Introduce a small descriptor layer for the seven public tools:

- Each descriptor has `name`, `description`, `inputSchema`, and a registry dispatch function.
- MCP registration reads from the descriptor list instead of hand-writing one `server.registerTool` block per tool.
- HTTP route validation uses the same `inputSchema` with `safeParse` after JSON parsing and organization resolution.
- HTTP keeps transport-specific behavior outside the descriptor: bearer-token org binding, body size cap, route path, status mapping, and envelope formatting remain in `src/app`.

This is a descriptor list, not a plugin framework. The goal is one source of truth for the existing tool contracts.

### MCP Module Boundaries

Split `src/mcp/server.ts` into focused modules without changing the public exports that tests and CLI code already import:

- `src/mcp/tool-schemas.ts`: tool descriptors and zod schemas.
- `src/mcp/tool-registry.ts`: registry construction, instrumentation, and audit wrapping.
- `src/mcp/tool-handlers.ts`: handler implementations and canonical-service orchestration.
- `src/mcp/tool-utils.ts`: shared conversion helpers such as memory id formatting, row conversion helpers, kind mapping, and git actor fallback.
- `src/mcp/server.ts`: MCP SDK server construction, stdio start, `toToolResult`, and compatibility re-exports.

The split should be mechanical where possible. Behavior changes belong in separate focused commits.

### Archive Cleanup Claiming

Align archive cleanup with the safer ingest outbox shape:

- Replace the bare pending-archive `SELECT ... FOR UPDATE SKIP LOCKED` claim with a single-statement claim update that changes claim visibility and returns claimed rows.
- Preserve the existing 60-second age guard so the inline compaction apply path has time to delete vector points itself.
- Add a visibility-timeout style recovery so a process crash after claim does not leave archive rows invisible forever.
- Keep `runOutboxSweep` idempotent: vector deletes remain safe to retry, and failed rows still move toward operator-visible `failed` status after the configured attempt cap.

If the implementation proves too invasive during planning, the fallback is to correct the documentation and comments to say only one compaction cleanup sweeper should run. The preferred design is to fix the claim semantics.

### Deployment Hardening

Harden the default deployment while preserving a low-friction local quick start:

- Run the app container as a non-root user and ensure the backup volume path is writable by that user.
- Keep `.env.example` usable for local development, but make production guidance explicit: operators must replace default Postgres and Qdrant credentials.
- Consider compose-level required variables only if it does not break `./install.sh` and the README quick start. If it would break first-run local setup, use warnings and documentation rather than a hard compose failure.
- Document the exact boundary: local loopback defaults are acceptable for development; production must set strong credentials, token-org bindings, and a rate limit.

### Public Documentation

Update public docs and mirrors for the behavior after this wave:

- `api-reference.md` and `.ko.md`: tool schema validation behavior, 400 errors for malformed payloads, and unchanged auth/readiness contracts.
- `architecture.md` and `.ko.md`: descriptor-driven tool surface, module boundaries, and sweeper claim model.
- `deployment.md` and `.ko.md`: non-root container behavior, production credential expectations, and accurate sweeper coordination guidance.
- `configuration.md` and `.ko.md`: any new env vars or changed credential guidance.
- `operations.md` and `.ko.md`: cleanup backlog behavior, retry/failed-state handling, and operator recovery commands if needed.
- `security.md` and `.ko.md`: container least privilege and credential-default posture.
- `README.md` and `.ko.md`: only high-signal changes, not every internal refactor.

## Data Flow

### HTTP Tool Call

1. HTTP server reads and caps the JSON body.
2. Auth middleware resolves the bearer token and optional bound organization.
3. Route code resolves the effective `organizationId` and rejects token/body conflicts.
4. The route validates the enriched input against the shared tool descriptor schema.
5. The route dispatches to the registry handler and returns the existing envelope shape.

Malformed JSON remains a 400. Schema validation errors become 400 with a stable, concise message that does not expose internals.

### MCP Tool Call

1. `createMcpServer` iterates over tool descriptors.
2. Each descriptor's zod shape is passed to `server.registerTool`.
3. The callback dispatches through the same registry method as before.
4. Tool results keep the current JSON text MCP result shape.

### Archive Cleanup Sweep

1. Repository claim method atomically reserves due archive rows and returns them.
2. Sweeper deletes vector points through `VectorIndex.delete`.
3. Repository marks archive cleanup as `deleted`, `pending` with next retry, or `failed`.
4. A crashed sweeper claim becomes eligible again after the visibility window.

## Error Handling

- HTTP schema validation should not throw generic 500s. Validation failures return 400.
- Tool handler runtime errors keep the existing static 500 response and structured server log.
- Compaction rate-limit handling remains 429 with `Retry-After`.
- Sweeper claim/update failures are logged and swallowed only at the loop boundary, preserving current background-worker behavior.
- Audit logging remains best-effort and must not block primary tool calls.

## Testing Strategy

Focused tests:

- Descriptor parity: the descriptor list contains all seven tools and every tool has a schema, description, MCP registration, and HTTP route mapping.
- HTTP schema validation: invalid types that MCP would reject also fail over HTTP before handler execution.
- Existing MCP schema tests continue to prove `semanticDedupThreshold` and all recovery tools survive zod parsing.
- MCP split regression: `createMcpServer`, `createToolRegistry`, and CLI imports keep working from their existing public import paths.
- Archive cleanup claim: SQL shape uses a single atomic claim update with `FOR UPDATE SKIP LOCKED`, preserves the age guard, and reclaims after visibility timeout.
- Docker hardening: Dockerfile contains a non-root runtime user and the app command still points at the built server.

Full gates:

- `npm run typecheck`
- `npm test`
- `docker build -f docker/app.Dockerfile .` when Docker is available.

## Rollout

Implement as several small commits:

1. Add tool descriptor module and route validation parity tests.
2. Refactor MCP registry/server modules while preserving exports.
3. Fix archive cleanup claim semantics and update sweeper tests.
4. Harden Docker/Compose defaults and tests/docs.
5. Sweep public docs and stale comments, including Korean mirrors.

The implementation plan should keep each task independently reviewable. Broad final review should check transport parity, documentation accuracy, and whether public imports stayed compatible.

## Deferred Follow-Ups

- Shared rate limiting across multiple HTTP replicas with Redis or an external reverse proxy policy.
- Read-replica routing for search/list-heavy deployments.
- A generated documentation table from tool descriptors.
- Provider metadata registry for embedding providers.
- Full historical translation of `docs/superpowers/**` artifacts.
