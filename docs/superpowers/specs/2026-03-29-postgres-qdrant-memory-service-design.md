# Developer Memory OS Postgres + Qdrant Design

**Date:** 2026-03-29  
**Status:** Proposed for implementation planning  
**Audience:** Project author and future implementation contributors

## Summary

This document supersedes the earlier SQLite-first retrieval direction for the deployed version of Developer Memory OS.

The new target is a self-hosted memory service with:

- `Postgres` as the canonical system of record
- `Qdrant` as the retrieval index
- a `Node/TypeScript` application layer for ingestion, ranking, and MCP/CLI exposure
- `Docker Compose` deployment on a single VPS for v1

The design goal is not just storage. It is to build a deployable, Supermemory-like developer memory layer that supports:

- project + user scope recall
- provenance and auditability
- vector-backed retrieval
- conservative compaction and promotion
- operational recovery through backups, snapshots, and reindexing
- operator-only access in milestone 1

## Why This Design

`pgvector` alone would minimize infrastructure count, but it would push more hybrid-search, filter-tuning, and retrieval orchestration into application SQL.

`Qdrant` alone would improve retrieval but is a poor canonical store for memory provenance, relationships, operator workflows, and durable audit history.

`Postgres + Qdrant` gives the best separation of concerns:

- Postgres owns truth, history, and relationships
- Qdrant owns retrieval
- the application layer owns ranking policy and context-pack generation

## Product Shape

The deployed product is still a developer memory appliance, not a generic PKM system.

Its primary job remains:

> Given current project context and prior developer memory, assemble trustworthy context for the next coding task.

The difference is that retrieval is no longer limited to local SQLite FTS. It becomes a service-backed memory loop:

`ingest -> normalize -> persist -> chunk -> embed -> index -> retrieve -> rerank -> build context pack -> compact/promote`

## Deployment Topology

### v1 topology

- single VPS
- `docker compose`
- services:
  - `app`
  - `postgres`
  - `qdrant`

### Operator access model

Milestone 1 assumes a single trusted operator, not a public multi-user service.

The access contract is:

- the `app` service binds only to the internal Docker network and host loopback
- there is no public HTTP endpoint in milestone 1
- the operator reaches the app from a laptop through an `ssh -L` tunnel to the VPS
- MCP `stdio` remains local-only
- any remote operator flow goes through the tunneled app or CLI entrypoints

This is the authentication boundary for milestone 1. No separate application login system is required while the service remains SSH-tunneled and single-operator.

### Networking

- only SSH is exposed publicly in milestone 1
- the app remains private behind loopback and the internal Docker network
- Postgres and Qdrant remain on the internal Docker network
- Qdrant is never exposed directly to the public internet
- Postgres is never exposed directly to the public internet

### Why this topology

This is the lightest self-hosted production shape that still preserves a clean separation between truth store and retrieval store.

It is intentionally simpler than Kubernetes while remaining more future-proof than a `pgvector`-only design. It also avoids inventing a public auth surface before the service actually needs one.

## Data Boundaries

### Postgres is the source of truth

Postgres stores canonical memory state and operator metadata.

Core tables:

- `sources`
- `memory_records`
- `memory_chunks`
- `relationships`
- `context_pack_runs`
- `ingest_jobs`
- `user_profiles`
- `project_profiles`

Responsibilities:

- provenance
- project/user scope ownership
- durable memory lifecycle
- relationships such as `supersedes` and `derived_from`
- ingest retries and indexing state
- audit history for context-pack generation

### Qdrant is the retrieval index

Qdrant stores searchable chunk vectors and filter payloads.

Initial collection:

- `memory_chunks_v1`

Per-point payload:

- `chunk_id`
- `memory_record_id`
- `scope_type`
- `scope_id`
- `project_key`
- `kind`
- `durability`
- `tags`
- `updated_at`

Initial vector strategy:

- dense vector required in v1
- sparse vector planned behind a later milestone gate

Responsibilities:

- candidate retrieval
- payload filtering
- dense retrieval in v1
- dense + sparse hybrid retrieval in a later milestone

## Embedding Contract

The embedding contract is fixed in milestone 1 so the Qdrant collection, worker pipeline, and reindex behavior are all deterministic.

### Milestone 1 embedding provider

- provider: `OpenAI`
- model: `text-embedding-3-small`
- dimensions: `1536`
- query embedding model: same as document embedding model
- local embedding models are explicitly out of scope for milestone 1

### Chunking policy

- chunk target size: `800` tokens
- chunk overlap: `120` tokens
- chunks are derived from normalized source text, not raw file bytes
- each chunk stores its source offsets and chunk index in Postgres

### Versioning and reindexing

Postgres must store these fields for every indexed chunk:

- `embedding_provider`
- `embedding_model`
- `embedding_dimensions`
- `embedding_version`

`embedding_version` starts at `v1`.

Any change to:

- provider
- model
- dimensions
- chunking policy
- payload schema used for Qdrant filtering

requires a full `reindex` run and a new Qdrant collection generation.

## Recall Model

The service always treats memory as two recall scopes:

- `project`
- `user`

Query-time policy:

- retrieve from both scopes
- prefer project memories over user memories when both are relevant
- hydrate canonical records from Postgres after retrieval
- rerank in the application layer

The application layer, not Qdrant alone, remains responsible for final ranking policy:

- scope precedence
- recency
- durability
- decision/constraint promotion
- source weighting

## Write Path

1. `add_memory` or artifact ingest arrives at the application layer.
2. Postgres transaction writes the canonical memory record and chunk rows.
3. An embedding/indexing job is created in `ingest_jobs`.
4. The worker computes embeddings.
5. The worker upserts points into Qdrant.
6. If indexing fails, the canonical record remains valid and the retry state is preserved in Postgres.

This makes Qdrant rebuildable from Postgres.

## Search Path

1. Resolve active `project` and `user` scopes.
2. Build query embedding.
3. Query Qdrant for top candidates with scope filters.
4. Hydrate `memory_records` and provenance from Postgres.
5. Apply application reranking.
6. Assemble a context pack.
7. Persist the pack run in `context_pack_runs`.

## Backup and Recovery

### v1 backup policy

- nightly `pg_dump`
- off-box backup copy to an SSH-reachable backup host
- scheduled Qdrant snapshots
- off-box snapshot copy

Backup artifacts:

- `postgres-YYYYMMDD-HHMM.sql.gz`
- `qdrant-YYYYMMDD-HHMM.snapshot`
- `manifest-YYYYMMDD-HHMM.json` containing SHA256 checksums and creation timestamps

### Recovery policy

- Postgres recovery from dump in v1
- Qdrant recovery from snapshot
- full Qdrant rebuild from Postgres `memory_chunks` if needed

### Backup verify contract

`backup verify` passes only when all of the following are true:

- the newest Postgres dump exists locally
- the newest Qdrant snapshot exists locally
- both artifacts also exist on the off-box backup host
- manifest checksums match both local and off-box copies
- newest successful backup age is less than `24` hours

### Restore smoke contract

`restore smoke` passes only when all of the following are true:

- a fresh isolated Compose project can boot Postgres and Qdrant
- the latest Postgres dump restores into the empty Postgres instance
- the latest Qdrant snapshot restores into the empty Qdrant instance
- the app can start against the restored services
- one seeded search query returns at least one result
- one `build_context_pack` call succeeds

### Deferred but planned

- Postgres `base backup + WAL archiving + PITR`

This is intentionally deferred out of the first production milestone to keep self-hosted ops tractable.

## Security

- SSH key login only on the VPS
- app access is operator-only through SSH local port forwarding
- Qdrant protected behind the internal network and API key
- Postgres restricted to the internal network
- secrets passed through environment files or secret injection, not hardcoded
- public HTTPS ingress is deferred until a later auth design exists

## Milestone Gates

“Later” items are not left as vague future work. They are attached to explicit gates.

### M1: Deployable Foundation

Must include:

- Postgres + Qdrant + app in Docker Compose
- operator-only SSH-tunneled access model
- dense retrieval through Qdrant
- project + user scope recall
- the fixed `text-embedding-3-small` embedding contract
- nightly Postgres backup
- scheduled Qdrant snapshots
- `reindex` command
- `backup verify` command
- `restore smoke` command

Exit criteria:

- deploy succeeds on a fresh VPS
- restore smoke succeeds once
- Qdrant can be rebuilt from Postgres

### M2: Retrieval Quality Upgrade

Must include:

- sparse vector support
- hybrid dense + sparse query path
- stronger reranking

Gate condition:

- M1 restore drill already proven

### M3: Memory Lifecycle

Must include:

- `supersedes`
- promotions
- decay
- stronger profile learning

## Risks

### Operational overhead

Running both Postgres and Qdrant self-hosted is more work than a single-DB design.

Mitigation:

- single VPS
- Docker Compose
- strict backup discipline
- explicit restore drills
- no public ingress in milestone 1

### Index drift

Qdrant can diverge from canonical data.

Mitigation:

- Postgres remains truth
- keep chunk rows in Postgres
- provide full reindex tooling

### Scope policy bugs

Project/user precedence can become inconsistent across features.

Mitigation:

- one shared ranking policy in the application layer
- contract tests for `project > user`

## Final Decision

For the deployed version of Developer Memory OS, the project will use:

- self-hosted `Postgres`
- self-hosted `Qdrant`
- a `Node/TypeScript` application layer
- `Docker Compose` on a single VPS for v1

The system starts with the final infrastructure shape on day one, while retrieval quality improvements are gated across milestones instead of being left as vague future work.
