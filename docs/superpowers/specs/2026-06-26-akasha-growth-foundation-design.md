# Akasha Growth Foundation Design

Date: 2026-06-26

Status: Design for user review. No implementation work has started from this
spec.

## Goal

Make Akasha more extensible, more reliable to operate, and better positioned
against modern AI-agent memory systems before adding larger graph or hook-based
features.

This wave intentionally goes beyond the originally visible implementation needs.
It does not chase a broad rewrite. It closes current operational and
documentation drift first, then lays the smallest useful retrieval-quality
foundation for later hybrid search.

## Evidence

### External Signals

- MCP draft documentation treats tools, structured content, output schemas,
  resources, prompts, and Streamable HTTP as first-class protocol surfaces:
  https://modelcontextprotocol.io/specification/draft/server/tools
  https://modelcontextprotocol.io/specification/draft/server/resources
  https://modelcontextprotocol.io/specification/draft/server/prompts
- Mem0's 2026 README describes multi-signal retrieval: semantic, BM25 keyword,
  entity matching, and temporal reasoning:
  https://raw.githubusercontent.com/mem0ai/mem0/main/README.md
- agentmemory's README positions hybrid search, knowledge graphs, lifecycle,
  confidence scoring, and agent hooks as the competitive memory-system pattern:
  https://raw.githubusercontent.com/rohitg00/agentmemory/main/README.md
- Zep markets temporal context graphs, provenance, and governed substrate-level
  audit/retention as enterprise memory differentiators:
  https://www.getzep.com/

### Current Akasha Evidence

- MCP protocol parity has improved: tools are descriptor-driven in
  `src/mcp/tool-schemas.ts`, MCP resources/prompts are registered in
  `src/mcp/server.ts`, and `/mcp` is served by `src/app/mcp-http.ts`.
- Retrieval remains vector-first only. `src/search/retrieve-memory.ts` asks the
  active `VectorIndex` for candidates, hydrates by `memory_record_id`, then
  calls `rankResults`. Lexical/BM25, entity graph traversal, and temporal
  candidate generation are not part of the canonical search path.
- `src/search/rank-results.ts` currently applies scope precedence, memory type,
  source type, relative recency, and a generic-note penalty. It does not preserve
  the original vector score in the returned records or expose score components.
- `src/context-pack/build-context-pack.ts` uses fixed section limits and simple
  classification. It does not have a token budget, diversity policy, source
  coverage policy, or selection rationale.
- Compose currently sets `HOST=0.0.0.0` but does not pass through important app
  env such as `MEMORY_API_TOKENS`, sweeper flags, `LEGACY_ANONYMOUS_SEARCH`, or
  `LOG_LEVEL`. The fail-closed startup gate in `src/app/server.ts` therefore
  can make the documented Compose flow fail to start when tokens are only set in
  `.env`.
- `unarchive_memory` can restore the canonical row before later chunk,
  embedding, vector upsert, or archive-mark steps fail. The current catch path
  reports a failed outcome but does not compensate for a partially restored
  record.
- Public docs still contain drift after PR #19:
  migration range references stop at `001-008` in some files even though
  migration `009_memory_archive_qdrant_retry.sql` exists; architecture/security
  docs under-describe `/mcp`; API docs drift from actual `kind` schema; backup
  docs assume Qdrant even when `VECTOR_BACKEND=pgvector`.

## Recommended Approach

Use a foundation wave with three tracks:

1. Operational correctness and production readiness.
2. Public documentation accuracy and drift tests.
3. Retrieval-quality foundation without implementing full hybrid/graph search.

This order is intentional. Fixing Compose, unarchive consistency, and docs first
prevents the next retrieval features from being built on confusing deployment
and API contracts. Separating scorer components before BM25 gives a measurable
extension point without overcommitting to graph memory in this wave.

## Architecture

### Track 1: Operational Correctness

#### Compose Environment Pass-Through

Update `compose.yaml` so the app service receives all public runtime knobs that
the docs say are configured through `.env`.

Required pass-through groups:

- Auth and tenant behavior:
  - `MEMORY_API_TOKENS`
  - `LEGACY_ANONYMOUS_SEARCH`
- Logging:
  - `LOG_LEVEL`
- Embeddings:
  - `EMBEDDING_PROVIDER`
  - `TRANSFORMERS_EMBEDDING_MODEL`
  - `OPENAI_API_KEY`
  - `OPENAI_EMBEDDING_MODEL`
  - `EMBEDDING_DIMENSIONS`
  - `EMBEDDING_MODEL`
- Vector backend:
  - `VECTOR_BACKEND`
  - `QDRANT_URL`
  - `QDRANT_API_KEY`
  - `QDRANT_COLLECTION_NAME`
- Background jobs:
  - `COMPACTION_SWEEP_ENABLED`
  - `COMPACTION_SWEEP_INTERVAL_MS`
  - `INGEST_SWEEP_ENABLED`
  - `INGEST_SWEEP_INTERVAL_MS`
- Backup:
  - `BACKUP_DIR`
  - `BACKUP_TARGET_HOST`
  - `BACKUP_TARGET_DIR`
- Rate limit:
  - `RATE_LIMIT_PER_MINUTE`

Prefer explicit environment entries over `env_file` so Compose defaults remain
visible and testable. The local defaults can stay local-development friendly,
but production docs must say which values must be replaced.

#### App Healthcheck

Add an app healthcheck in `compose.yaml` that probes `/readyz` on the configured
port from inside the container. This makes Compose detect dependency readiness,
not just process startup.

The Docker image is Alpine-based. Use a healthcheck command available in the
runtime image, or add the smallest dependency necessary. The healthcheck must
not require bearer auth because `/readyz` is intentionally unauthenticated for
orchestrators.

#### Bearer Token Parsing

Harden `MEMORY_API_TOKENS` parsing:

- Empty entries are ignored as today.
- Plain token: `rawToken`
- Org-bound token: `rawToken:organizationId`
- Invalid:
  - empty token before the colon
  - empty org after a colon
  - multiple colons in a single entry

Multiple-colon tokens should fail at startup instead of silently parsing to an
unexpected token/org split. Document that raw token values must not contain
colon characters.

#### Unarchive Partial Restore Compensation

Make `unarchive_memory` failure atomic from the user's perspective:

- If `restoreToCanonical` has inserted a new `memory_records` row and a later
  step fails, the system must remove that restored row using the org-scoped
  `deleteMemoryRecord` path or an equivalent repository method.
- If vector points were upserted before a later SQL step fails, delete those
  points best-effort while preserving the original error in the outcome.
- A failed unarchive must leave `memory_archive.unarchived_at` unset and must
  not leave an active duplicate restored record.

This can be implemented as compensating cleanup in the orchestrator rather than
as one large transaction, because embedding and vector upsert are external to
Postgres.

### Track 2: Documentation Completeness

Update English and Korean public docs together where mirrors exist.

Required corrections:

- `AGENTS.md`, `CONTRIBUTING.md`, `CONTRIBUTING.ko.md`,
  `docs/architecture.md`, `docs/architecture.ko.md`, `docs/operations.md`, and
  `docs/operations.ko.md` must refer to migrations `001-009` and say new
  migrations append the next unused number after the current range.
- `docs/architecture.*` must describe three transports:
  - MCP stdio
  - MCP Streamable HTTP at `/mcp`
  - JSON HTTP under `/v1/*`
- `docs/security.*` must treat `/mcp` as an HTTP attack surface with bearer auth,
  rate limiting, origin validation, and the same loopback no-auth exception as
  `/v1/*`.
- `docs/api-reference.*` must match actual tool schemas:
  - `add_memory.kind` is `decision | summary | fact`
  - `build_context_pack.sections` is an object with named section arrays, not a
    flat `SearchMemoryResult[]`
  - MCP structured output and text-content compatibility are described once,
    not with contradictory transport claims
- `README.ko.md` must avoid Qdrant-only wording when the active vector backend
  can be Qdrant or pgvector.
- `CHANGELOG.md` and `CHANGELOG.ko.md` must add PR #19 user-visible changes:
  `/mcp` Streamable HTTP, MCP resources/prompts, and structured MCP tool output.
- Backup and restore docs must clearly distinguish:
  - Qdrant backend: `backup:create` captures Postgres plus Qdrant snapshot.
  - pgvector backend: vectors live in Postgres, so Qdrant snapshot is not part of
    the logical data path. Existing scripts may still be Qdrant-oriented until a
    later script split, but docs must not imply Qdrant is required for pgvector
    operation.

Add drift tests for the high-risk doc contracts above. The tests should avoid
overfitting to whole paragraphs; assert stable facts and source/doc parity.

### Track 3: Retrieval-Quality Foundation

Do not implement full BM25, entity graph, or hooks in this wave. Instead,
prepare the canonical search path to support them cleanly.

#### Scored Result Contract

Introduce an internal scored candidate type, for example:

```ts
type RetrievedMemoryCandidate = {
  record: SearchMemoryResult;
  scores: {
    vector?: number;
    lexical?: number;
    metadata: number;
    recency: number;
    total: number;
  };
  reasons: string[];
};
```

The public `search_memory` result shape can remain unchanged in this wave unless
the API design explicitly adds `debugScores`. Internal tests should verify that
vector score affects final ordering when metadata ties.

#### Ranker Separation

Split ranking into pure scoring helpers:

- scope score
- memory type score
- source type score
- recency score
- generic-note penalty
- vector score normalization

The ranker must be deterministic and testable without database or vector
services.

#### Future Hybrid Interface

Add a narrow interface boundary that can later accept lexical candidates:

```ts
type CandidateSource = "vector" | "lexical";
```

No SQL `tsvector` migration is required in this wave. The design must leave a
clear place for later BM25/lexical candidates to merge via RRF or weighted
fusion.

#### Context Pack Selection Metadata

Keep the public context pack markdown stable, but have the internal pack builder
preserve why each memory was selected. This supports future documentation and
debug output without changing the first implementation's public response.

## Data Flow

### Search Today

`search_memory` -> embed query -> vector backend query -> hydrate records from
Postgres -> `rankResults` -> slice to limit.

### Search After This Wave

`search_memory` -> embed query -> vector backend query -> hydrate records from
Postgres -> build scored candidates with vector + metadata + recency components
-> deterministic rank -> slice to limit.

Lexical candidates are not produced yet, but the scored-candidate shape allows
the next wave to add:

`lexical query -> lexical candidates -> fusion with vector candidates -> same
scored ranker`.

### Unarchive Failure

`unarchive_memory` -> insert restored record -> insert chunks -> embed -> upsert
vectors -> update chunk point IDs -> mark archive unarchived.

If any step after the restored record insert fails, compensation runs:

1. delete any upserted vector points best-effort
2. delete the restored canonical record org-scoped, which cascades chunks/jobs
3. report failed outcome with original error

## Error Handling

- Compose env mistakes should fail at startup with actionable messages, not as
  confusing runtime auth failures.
- Invalid bearer token config should fail during token loading.
- Unarchive compensation failures should be logged, but the user-facing outcome
  should preserve the original unarchive failure message.
- Documentation drift tests should fail with names that identify the missing
  contract.

## Testing

Required focused tests:

- Compose/Docker config drift:
  - app service passes required env names
  - app service defines a `/readyz` healthcheck
- Bearer token parsing:
  - rejects empty bound org
  - rejects empty token before colon
  - rejects multiple-colon entry
  - preserves plain and single-bound token behavior
- Unarchive compensation:
  - embed failure after restored row insert deletes restored row
  - vector upsert success followed by chunk point update failure deletes vector
    points and restored row
  - failed outcome leaves archive unmarked
- Ranker:
  - vector score participates in ordering when other scores tie
  - metadata/recency/generic penalties remain deterministic
  - ranker exposes score components internally
- Public docs drift:
  - migration range is `001-009`
  - `/mcp` is mentioned in architecture and security docs
  - `add_memory.kind` docs match `decision | summary | fact`
  - PR #19 user-visible changes appear in both changelogs
  - pgvector backup/restore limitation is documented

Full gates after implementation:

- `npm run typecheck`
- `npm test`
- Docker build when available:
  `docker build -f docker/app.Dockerfile .`

## Non-Goals

- No full BM25/tsvector migration in this wave.
- No entity graph schema or temporal fact invalidation in this wave.
- No Claude/Codex hook auto-capture integration in this wave.
- No hosted dashboard or UI.
- No OAuth implementation for MCP authorization. The existing bearer-token model
  remains documented as Akasha's current auth model.
- No public search response shape change unless the later implementation plan
  explicitly scopes it.

## Follow-Up Waves

1. Hybrid retrieval:
   - Postgres lexical index or portable lexical scorer
   - vector + lexical fusion with RRF
   - larger eval fixture and ablation results
2. Temporal/entity memory:
   - entity extraction contract
   - relation/fact provenance
   - dated fact validity and contradiction handling
3. Agent lifecycle integrations:
   - session start/end capture recipes
   - Codex/Claude integration docs
   - optional hook installers

## Acceptance Criteria

- A fresh Compose run can start the app with `MEMORY_API_TOKENS` from `.env`.
- Compose can detect app readiness through `/readyz`.
- Invalid `MEMORY_API_TOKENS` entries fail deterministically at startup.
- A failed `unarchive_memory` after partial restore leaves no active restored
  memory record and does not mark the archive unarchived.
- Public docs and Korean mirrors match current source behavior for migrations,
  `/mcp`, MCP resources/prompts, tool schemas, backup modes, and PR #19 changes.
- Retrieval ranking has internal score components and preserves vector score for
  future fusion work.
- Focused tests and full `npm test` pass.

## Spec Self-Review

- Unfinished-marker scan: no incomplete markers remain.
- Internal consistency: scope is one foundation wave; graph, BM25, and hooks are
  explicitly follow-up waves.
- Ambiguity check: token parsing, unarchive compensation, doc drift, and scorer
  boundaries have concrete expected behavior.
- Scope check: implementation is large enough for SDD task decomposition but
  small enough to avoid a memory-system rewrite.
