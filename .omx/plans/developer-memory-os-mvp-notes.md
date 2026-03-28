# Developer Memory OS MVP - Planning Notes

## Evidence Base
- Repository state is effectively empty: tracked files are `.gitignore` and `.omx/context/developer-memory-os-20260328T142946Z.md`.
- There is no application scaffold, package manifest, test suite, or existing architecture to extend.
- The context snapshot frames the product as a local-first, developer-centric memory layer for Claude/Codex, not a general-purpose cloud knowledge platform.

## Recommendation Summary
Build the MVP as a **local MCP-facing memory service with a minimal ingestion/query loop**, not as a broad "memory OS" platform. The first version should optimize one job: **turn recent developer activity into reusable, high-signal context packs for future agent sessions**.

## Scope Boundaries
### In scope for MVP
- Local-first storage only.
- Single-user workflow.
- Developer-specific memory objects:
  - session summaries
  - project notes
  - reusable context packs
  - decisions / constraints / TODOs
- Manual or semi-automatic ingestion from local artifacts (chat/session notes, repo metadata, markdown notes).
- Retrieval exposed through a narrow MCP-friendly interface.
- Lightweight ranking/retrieval that favors recency + project relevance over "global intelligence".

### Explicitly out of scope for MVP
- Team collaboration or multi-user sharing.
- Cloud sync, hosted infra, accounts, auth, billing.
- Full browser history / universal personal memory ingestion.
- Autonomous background surveillance of the entire machine.
- Complex agentic workflows beyond ingest, search, summarize, and pack-context.
- Fancy UI before the retrieval loop proves useful.

## MVP Feature Set
1. **Memory store**
   - Persist memories locally with metadata: project, source, timestamp, tags, confidence, recency.
2. **Ingestion pipeline**
   - Accept markdown/text inputs and structured notes from local developer workflows.
   - Normalize them into small memory records.
3. **Retrieval API**
   - Query by project/task/keyword.
   - Return top relevant memories with compact summaries.
4. **Context pack builder**
   - Generate a concise pack for an upcoming task, e.g. project summary, recent decisions, open questions, active constraints.
5. **Memory management primitives**
   - Pin, archive, dedupe, and manually correct noisy memories.
6. **MCP surface**
   - Minimal tools such as `save_memory`, `search_memory`, `build_context_pack`, `list_recent_project_memories`.

## Recommended Product Shape
Prioritize **MCP server first**, with a thin local CLI for seeding/debugging.

Why:
- Matches the stated Claude/Codex-centric use case.
- Avoids premature UI work.
- Makes value testable quickly in real agent sessions.
- Keeps the architecture local and composable.

## Key Risks
1. **Too broad, too early**
   - Risk: the project drifts toward a universal memory platform.
   - Mitigation: define one narrow success metric for MVP.
2. **Low-signal ingestion**
   - Risk: memory becomes noisy and retrieval quality collapses.
   - Mitigation: start with curated/manual ingestion sources only.
3. **Poor retrieval usefulness**
   - Risk: the system stores notes but does not improve task startup quality.
   - Mitigation: optimize for context-pack usefulness, not storage volume.
4. **Overbuilding UX**
   - Risk: time is spent on app surfaces before proving core value.
   - Mitigation: keep UI optional until the MCP loop is validated.
5. **Schema churn**
   - Risk: early data model is too rigid or too abstract.
   - Mitigation: use a simple record schema with extensible metadata.

## Open Questions
- Is the first user strictly personal/local, or should the MVP anticipate future sharing/export?
- Should ingestion start manual-only, or include a small number of automatic local sources on day one?
- What is the primary success metric:
  - faster task restarts,
  - better agent continuity,
  - better context packs,
  - or fewer repeated explanations?
- What local artifacts are most important to ingest first: chat transcripts, markdown notes, git history, issue notes, or command logs?
- Is vector search actually required for v1, or is hybrid keyword + metadata + recency ranking enough?

## Recommended First Milestone
### Milestone 1: Local Context Pack Loop
Deliver a thin local memory service that can:
1. ingest a small set of curated markdown/session notes,
2. store them under a project-aware schema,
3. answer project/task queries,
4. generate a compact context pack for a new coding task via MCP.

### Milestone 1 acceptance criteria
- A developer can save at least 3-5 memories tied to one project.
- The system can return relevant memories for a task query.
- The system can generate a context pack that includes:
  - project summary,
  - recent decisions,
  - constraints,
  - open questions,
  - recent relevant notes.
- The pack is compact enough to paste directly into an agent session.
- All data remains local.

## Suggested Next Planning Artifacts
1. PRD for the Local Context Pack Loop.
2. Test/spec describing memory record schema, ingestion contracts, and retrieval quality checks.
3. Architecture note comparing storage/ranking options:
   - SQLite only
   - SQLite + FTS
   - SQLite + vectors (only if needed)
4. CLI/MCP command surface draft.

## Implementation Bias for Later
When execution begins, bias toward:
- SQLite or sqlite-backed local storage,
- simple metadata + FTS retrieval first,
- optional embeddings later,
- deterministic summarization points,
- explicit user control over saved memory.
