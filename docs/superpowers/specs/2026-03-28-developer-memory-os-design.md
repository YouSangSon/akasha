# Developer Memory OS Design

> Historical note: this document describes the earlier SQLite-first MVP direction. The deployed implementation path is superseded by [2026-03-29-postgres-qdrant-memory-service-design.md](/Users/yousang/Desktop/workspaces/context-forge/.worktrees/developer-memory-os-mvp/docs/superpowers/specs/2026-03-29-postgres-qdrant-memory-service-design.md).

**Date:** 2026-03-28  
**Status:** Proposed and approved for planning handoff  
**Audience:** Project author and future implementation contributors

## Summary

This project is a local-first memory layer for developer workflows, inspired by products like Supermemory but intentionally narrower. The first version is not a universal memory platform. It is a **Context Pack Appliance** for Claude/Codex sessions: ingest a small set of local developer artifacts, store them in a searchable local memory store, and generate high-signal context packs for the next coding task.

The MVP is optimized for one user on one machine. It uses TypeScript, an MCP-first interface, and a local SQLite database with FTS search. Embeddings are explicitly deferred until the simpler system proves useful.

## Problem

Developer sessions lose continuity. Important decisions, constraints, TODOs, and project context get scattered across notes, `.omx` artifacts, Markdown files, and git history. Starting a new session often means re-explaining the same project state.

The project should reduce that re-explanation cost by producing a compact, trustworthy context pack for a new session.

## Goals

- Build a local-only memory tool for personal developer use.
- Ingest a narrow set of developer artifacts with clear provenance.
- Support fast retrieval of relevant project memories.
- Generate compact task-oriented context packs for new agent sessions.
- Promote high-value decisions and constraints from transient notes into durable memory.
- Keep the system inspectable, debuggable, and easy to reset.

## Non-Goals

- Cloud sync, accounts, billing, or hosted infrastructure.
- Team sharing, permissions, or multi-user collaboration.
- Browser-wide or machine-wide passive capture.
- Rich GUI or dashboard in v1.
- Heavy semantic search infrastructure in v1.
- A general personal knowledge management product.

## Product Shape

The MVP is a **Context Pack Appliance**, not a generic searchable vault.

The primary job to be done is:

> Given my recent repo work, notes, and decisions, assemble the right context pack for my next coding session.

That leads to a narrow loop:

1. Ingest curated local artifacts.
2. Normalize them into memory records.
3. Retrieve relevant records for a task.
4. Build a compact context pack with provenance.
5. Promote selected decisions and constraints into durable memory.

## Target User

The initial user is the project author using Claude/Codex locally.

This design assumes:

- one developer
- one local machine
- one or more local repositories
- manual or semi-manual ingestion
- no requirement for sync or sharing in v1

## Source Scope

### Included in MVP

- Manual notes entered by the user.
- `.omx` context, plans, and related project artifacts.
- Project Markdown files such as `README.md` and design notes.
- Git metadata such as commit messages and branch history.

### Excluded in MVP

- tmux/session logs by default
- browser history
- Slack, email, or chat platform ingestion
- background ingestion of arbitrary desktop activity

## Technical Direction

- **Language:** TypeScript
- **Primary interface:** MCP server
- **Secondary interface:** CLI for manual operations and debugging
- **Storage:** SQLite
- **Search:** SQLite FTS
- **Semantic retrieval:** deferred

TypeScript is the default because the product is a local agent-facing tool rather than an ML research project. SQLite is preferred because the MVP is single-user, local-first, and optimized for zero-ops setup.

## System Architecture

The core pipeline is:

`ingest -> normalize -> store -> search -> rank -> build context pack -> compact/promote`

Conceptually the system has four layers:

1. **Ingestion layer**
   Reads approved local sources and converts them into normalized inputs.
2. **Memory store**
   Persists source records and memory records in SQLite.
3. **Retrieval layer**
   Uses FTS for initial candidate selection and rule-based reranking.
4. **Pack builder**
   Assembles a task-specific context pack from the top-ranked memories.

## Data Model

The MVP should stay small. Three main tables plus one FTS index are enough.

The storage model is split into two recall scopes:

- `project` scope for repository-specific knowledge
- `user` scope for cross-project preferences and durable operator habits

Session recall should merge both scopes, with project memories ranked ahead of user memories when both are relevant.

### `sources`

Represents original material captured by the system.

Suggested fields:

- `id`
- `scope_type`
- `scope_id`
- `source_type`
- `source_ref`
- `content_hash`
- `captured_at`

Typical `source_type` values:

- `manual_note`
- `omx_doc`
- `markdown_file`
- `git_commit`

### `memory_records`

Represents search and pack-building units.

Suggested fields:

- `id`
- `scope_type`
- `scope_id`
- `kind`
- `title`
- `content`
- `summary`
- `source_id`
- `tags`
- `importance`
- `durability`
- `created_at`
- `updated_at`
- `pinned`

Initial `kind` values:

- `note`
- `summary`
- `decision`
- `constraint`
- `todo`
- `context_fragment`

Initial `durability` values:

- `ephemeral`
- `durable`
- `archived`

### `context_pack_runs`

Represents generated context packs for auditability and iteration.

Suggested fields:

- `id`
- `project_key`
- `task`
- `pack_markdown`
- `selected_memory_ids`
- `created_at`

### `memory_records_fts`

FTS index over `title`, `content`, and `summary`.

## Durable Memory Rules

The MVP uses a middle path between full manual curation and noisy automation.

### Durable by default

- user-authored saved memories
- pinned project notes

### Durable by promotion

- decisions extracted from session summaries
- project constraints extracted from session summaries

### Not durable by default

- transient notes
- duplicate context fragments
- weakly relevant search results

This keeps the system useful without pretending to solve fully automatic long-term memory in v1.

## MCP Interface

The MCP surface should stay intentionally small.

### `add_memory`

Stores a memory record from manual input or structured session output.

Input:

- `scope`
- `project_key?`
- `user_scope_id?`
- `kind`
- `content`
- `title?`
- `tags?`
- `source_type`
- `source_ref?`
- `durability?`

Output:

- `memory_id`
- saved metadata summary

### `search_memory`

Finds relevant memories for a project/task query.

Input:

- `project_key`
- `user_scope_id?`
- `include_user?` default `true`
- `query`
- `kinds?`
- `limit?`
- `include_archived?`

Output per result:

- `id`
- `kind`
- `summary`
- `source_ref`
- `score`
- `durability`

### `build_context_pack`

Builds the main output for a new session.

Input:

- `project_key`
- `user_scope_id?`
- `include_user?` default `true`
- `task`
- `limit?`
- `token_budget?`

Output:

- `pack_markdown`
- `selected_memory_ids`
- `sections`

Expected sections:

- `project_summary`
- `recent_decisions`
- `constraints`
- `open_questions`
- `relevant_notes`

### `compact_memory`

Compacts ephemeral memory safely and proposes promotion/archive actions.

Input:

- `project_key`
- `scope?`
- `dry_run?`

Output:

- `archived_ids`
- `merged_ids`
- `promotion_candidates`
- `summary`

## CLI Surface

The CLI is an operator tool, not the primary product interface.

Initial commands:

- `memory add`
- `memory search`
- `memory pack`
- `memory compact`

## Retrieval Strategy

The retrieval flow is intentionally simple.

1. Query the current `project` scope and the active `user` scope together.
2. Use FTS to find initial candidates from `title`, `content`, and `summary`.
3. Rerank candidates using:
   - recency
   - importance
   - `pinned`
   - `durability`
   - `kind`
   - source-type weighting
   - scope precedence, with `project > user`
4. Build a structured context pack from the highest-value results.

This is enough to validate the product without introducing embeddings yet.

## Context Pack Requirements

A context pack must be compact, source-aware, and directly useful in a new agent session.

Each pack should:

- stay within a configurable token budget
- include provenance or source references
- distinguish durable decisions from transient notes
- surface active constraints and open questions
- avoid dumping raw search results without structure

The quality bar is practical, not theoretical:

> If the pack is pasted into a new session, the amount of repeated explanation should noticeably decrease.

## Compaction Strategy

Compaction should be conservative in v1.

- archive instead of delete by default
- operate safely through `dry_run`
- suggest merges for near-duplicate ephemeral records
- suggest promotions for likely decisions and constraints
- keep human control over final durable promotion

Smart forgetting is deferred. Safe compaction comes first.

## Error Handling

- Partial source-ingest failures should not fail the entire run.
- Search should return low-confidence explanations rather than pretending certainty.
- Context pack generation should include only records with valid provenance.
- Schema migrations should be forward-only and explicit.

## Validation Plan

The project is validated by usefulness, not by storage volume.

### Functional checks

- records can be inserted and retrieved
- FTS search returns relevant memories by project
- context packs include expected sections
- durable promotion works for decisions and constraints
- compaction preserves data safely

### Quality checks

- every result includes provenance
- retrieval favors project-relevant recent memories
- packs stay concise enough for agent input
- packs reduce repeated explanation in a real session restart

## Milestone 1

The first milestone is the **Local Context Pack Loop**.

Deliverable:

- ingest a small set of curated local artifacts
- store them under the MVP schema
- answer task-oriented search queries
- generate a context pack for a new coding task through MCP

Acceptance criteria:

- 3-5 memories can be saved for one project
- relevant memories are returned for a task query
- the generated context pack includes summary, decisions, constraints, open questions, and relevant notes
- all data remains local

## Deferred Work

These may come later, but should not shape v1 too much:

- embeddings or hybrid search
- automatic tmux/session log ingestion
- richer promotion heuristics
- skill recommendation
- share/export flows
- server-backed or multi-user operation

## Final Decision

The MVP will be a **local-first, TypeScript, MCP-first Context Pack Appliance** backed by **SQLite + FTS**, focused on generating better session handoff context for Claude/Codex workflows.
