# CONTEXT

This glossary defines the product language used by `goal.md`, `DESIGN.md`,
`PLAN.md`, and `GATES.md`. Implementation detail belongs in
`docs/architecture.md`.

- **Organization** — the tenant boundary. Every memory operation, including
  reads, must be bound to one `organizationId`; records from another
  organization must never influence results.
- **Project memory** — durable knowledge attached to a project identity, such
  as a decision, constraint, fact, or summary.
- **User memory** — durable user-level knowledge that can apply across projects
  inside the same organization.
- **Canonical memory** — the authoritative Postgres record. Vector entries are
  rebuildable projections, not the source of truth.
- **Chunk** — a bounded portion of canonical memory embedded and indexed for
  retrieval.
- **Vector point** — one chunk's derived vector-index representation, identified
  consistently across Qdrant and pgvector.
- **Context pack** — a bounded, cited selection of retrieved memories prepared
  for an agent prompt. It is not proof of token savings by itself.
- **Goal run** — persisted attempts and outcomes for one objective; distinct
  from the repository-level goal in `goal.md`.
- **Durable memory** — information explicitly stored to survive agent sessions
  and clients.
- **Code intelligence** — repository symbols, references, routes, and call
  graphs. It complements Akasha but is not an Akasha product responsibility.
- **Local verification** — evidence produced in this checkout with owned local
  processes and fixtures.
- **Client verification** — evidence from an actual Codex or Claude invocation
  using Akasha through MCP.
- **Production verification** — evidence from a deployed environment. Local or
  client verification does not imply it.
