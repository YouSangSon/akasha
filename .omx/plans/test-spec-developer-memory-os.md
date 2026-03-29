# Developer Memory OS Test Spec

**Date:** 2026-03-28  
**Status:** Ready for implementation

## Test Strategy

The MVP should be validated at three levels:

1. **Unit tests** for schema, repository, ranking, pack building, and compaction logic
2. **Integration tests** for ingestion, MCP tool handlers, and CLI flows
3. **Manual acceptance checks** for real session-handoff usefulness

The test suite should use deterministic fixtures and avoid hidden network dependencies.

## Test Data Fixtures

Create fixtures under `tests/fixtures/project-alpha/`:

- `.omx/context/session-1.md`
- `.omx/plans/plan.md`
- `README.md`
- `docs/decision-log.md`
- `git-log.txt`

The fixture corpus must include:

- at least one decision
- at least one constraint
- at least one unresolved question
- one transient note
- one duplicated context fragment

## Schema and Migration Tests

### T-1 Database initialization

Verify database bootstrap creates:

- `sources`
- `memory_records`
- `context_pack_runs`
- `memory_records_fts`

### T-2 FTS availability

Verify inserted memory content becomes searchable through the FTS table.

### T-3 WAL configuration

Verify the database connection enables WAL mode on startup.

## Repository Tests

### T-4 Add memory

Verify `addMemory()` persists a record with:

- project key
- kind
- durability
- source provenance

### T-5 Search memory

Verify `searchMemory()` returns ranked results scoped to one project and excludes unrelated projects.

### T-6 Update durability

Verify a promoted memory moves from `ephemeral` to `durable`.

## Ingestion Tests

### T-7 Read approved project sources

Verify the ingestion layer reads:

- `.omx` Markdown artifacts
- project Markdown files
- git metadata fixture

### T-8 Normalize to memory records

Verify notes, decisions, and constraints are normalized into expected `kind` values.

### T-9 Duplicate protection

Verify identical source content does not create duplicate source records when hashes match.

## Ranking and Retrieval Tests

### T-10 Project scoping

Verify results from another project never appear in the top results for the requested project.

### T-11 Recency weighting

Verify newer otherwise-equivalent records rank above older records.

### T-12 Importance weighting

Verify pinned or higher-importance records outrank low-importance records.

### T-13 Durable weighting

Verify durable decisions and constraints surface above generic transient notes for the same query.

## Context Pack Tests

### T-14 Pack sections

Verify `buildContextPack()` returns:

- `project_summary`
- `recent_decisions`
- `constraints`
- `open_questions`
- `relevant_notes`

### T-15 Provenance

Verify each surfaced memory in the pack has a source reference.

### T-16 Token budget behavior

Verify the pack builder trims lower-priority notes when a small token budget is supplied.

## Compaction Tests

### T-17 Dry run

Verify `compactMemory()` returns archive/merge/promotion candidates without changing stored records when `dryRun` is true.

### T-18 Archive behavior

Verify an approved archive operation changes durability or lifecycle state without deleting source provenance.

### T-19 Promotion suggestions

Verify a session summary containing explicit decision/constraint language yields promotion candidates.

## MCP and CLI Integration Tests

### T-20 MCP add/search tools

Verify the MCP server exposes `add_memory` and `search_memory` and both operate successfully against a temporary project database.

### T-21 MCP context pack tool

Verify `build_context_pack` returns pack markdown and selected memory IDs.

### T-22 CLI parity

Verify CLI commands mirror the same core operations:

- `memory add`
- `memory search`
- `memory pack`
- `memory compact`

## Manual Acceptance Checks

### A-1 Session restart usefulness

1. Seed one fixture project with at least five memories.
2. Run `memory pack --project project-alpha --task "continue indexing work"`.
3. Paste the pack into a fresh agent session.
4. Judge whether repeated explanation is reduced.

Expected result:

- the pack includes recent decisions, active constraints, unresolved questions, and relevant notes
- the operator does not need to restate the core project context from scratch

### A-2 Trustworthiness

Inspect search results and pack output and verify each important claim has provenance.

### A-3 Safe compaction

Run compaction in dry-run mode and confirm archive/merge/promotion suggestions are understandable before any state change is applied.

## Exit Criteria

Implementation is ready for broader use when:

- all unit and integration tests pass
- manual acceptance checks pass on at least one real project
- context packs consistently reduce repeated explanation
- no result path returns uncited memory content
