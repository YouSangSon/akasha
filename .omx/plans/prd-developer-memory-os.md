# Developer Memory OS PRD

**Date:** 2026-03-28  
**Status:** Approved for implementation planning  
**Primary user:** One developer using Claude/Codex locally

## Product Summary

Developer Memory OS is a local-first memory layer for developer workflows. The MVP is intentionally narrow: it ingests a curated set of local project artifacts, stores them in a searchable local memory store, and generates a compact context pack for the next agent session.

The product is not a universal memory platform in v1. It is a **Context Pack Appliance** optimized for local coding continuity.

## Problem

Important project state gets scattered across:

- `.omx` context and planning files
- project Markdown docs
- manual notes
- git commit history

As a result, a new agent session often starts with repeated explanation, forgotten constraints, and missing decisions.

## Target Outcome

Reduce the amount of repeated explanation required to start the next Claude/Codex session on the same project.

## Primary Job To Be Done

> Given my recent repo work, notes, and decisions, assemble the right context pack for my next coding session.

## User Stories

1. As a solo developer, I want to save important notes and decisions as memory records so I do not have to repeat them in future sessions.
2. As a solo developer, I want the system to ingest approved local artifacts from a project so recent work is available for retrieval.
3. As a solo developer, I want to search project memory by task or keyword so I can quickly recall relevant past context.
4. As a solo developer, I want a context pack built for a new task so I can paste it directly into a fresh agent session.
5. As a solo developer, I want durable decisions and constraints promoted from session summaries so important context survives ephemeral notes.
6. As a solo developer, I want all memory results to include provenance so I can trust what the system is telling me.

## Scope

### In Scope

- Local-only storage
- TypeScript implementation
- MCP-first interface with a small operator CLI
- Ingestion from:
  - manual notes
  - `.omx` documents
  - project Markdown files
  - git metadata
- SQLite-backed memory storage
- SQLite FTS-based retrieval
- Context pack generation
- Safe compaction and durable-memory promotion

### Out of Scope

- Cloud sync
- Multi-user or team memory
- Browser or desktop-wide passive capture
- Rich GUI/dashboard
- Embeddings in v1
- Automatic omniscient long-term memory

## Success Metric

The primary success metric is **context pack quality**.

The MVP is successful when:

- a generated context pack is concise enough to paste into a fresh session
- it consistently includes recent decisions, active constraints, open questions, and relevant notes
- it noticeably reduces repeated explanation at session start

## Functional Requirements

### FR-1 Add Memory

The system must allow manual or structured session inputs to be stored as memory records with project metadata, type, durability, and provenance.

### FR-2 Ingest Local Artifacts

The system must read approved local sources for a project and normalize them into memory records or source records.

### FR-3 Search Memory

The system must search memory records scoped to a project and return ranked results with provenance.

### FR-4 Build Context Pack

The system must build a task-specific context pack with sections for:

- project summary
- recent decisions
- constraints
- open questions
- relevant notes

### FR-5 Promote Durable Memory

The system must support durable-memory promotion for important decisions and constraints extracted from session summaries.

### FR-6 Compact Memory Safely

The system must support compaction by suggesting archive, merge, and promotion candidates with `dry_run` support.

## Non-Functional Requirements

- Local-first and inspectable
- Fast enough for interactive single-user use
- Safe to reset and rebuild indexes
- Provenance included in all user-facing memory results
- Minimal operator overhead

## Core Workflow

1. User or tool adds memory or ingests approved project sources.
2. Source material is normalized into source and memory records.
3. Search selects relevant records using FTS and reranking.
4. Context pack builder structures the top results into a compact output.
5. Session summaries can promote decisions and constraints into durable memory.

## MVP Tool Surface

- `add_memory`
- `search_memory`
- `build_context_pack`
- `compact_memory`

## Data Boundaries

The product stores only explicitly approved local artifacts in v1. It should not watch arbitrary system activity or collect sources outside the defined project workflow.

## Risks

1. Scope creep toward a generic memory platform.
2. Retrieval noise from low-signal ingestion.
3. Overengineering schema and ranking before usefulness is proven.
4. User distrust when summaries do not cite sources.
5. Confusion between ephemeral notes and durable memory.

## Risk Mitigations

1. Keep v1 focused on the context-pack loop.
2. Limit source ingestion to curated project artifacts.
3. Use SQLite + FTS before embeddings.
4. Require provenance in search and pack outputs.
5. Define simple durability rules for v1.

## Milestone 1: Local Context Pack Loop

Deliver a vertical slice that can:

- ingest curated local artifacts for one project
- store them under the MVP schema
- answer a task-oriented query
- generate a compact context pack through MCP

## Milestone 1 Acceptance Criteria

- At least 3-5 memories can be stored for one project.
- Search returns relevant memories for a project task query.
- Context packs include the required sections.
- Every surfaced result includes provenance.
- All data remains local.

## Open Questions Kept for Later

- Whether tmux/session logs should become a future ingestion source
- Whether skill recommendation should be layered on top of memory
- When embeddings become worth the added complexity
- Whether future export/share should influence the schema
