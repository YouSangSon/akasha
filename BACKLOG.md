# BACKLOG

Prioritize in this order unless a core product capability materially changes
the value of Akasha: stability/bugs, testability, scalability, developer
experience, documentation, features.

## P0

- None currently known.

## P1

- None currently known.

## P2

- Add CI coverage for docs drift on every public doc surface if gaps remain.
- Review backup/restore runbooks against current pgvector and Qdrant paths.
- Add operator guidance for worker metrics exposure if a future dedicated
  worker needs its own scrape endpoint.

## Done In This Branch

- Goal-run close notes, scoped start/list behavior, schema validation, and docs.
- Sweeper tick/duration/row Prometheus metrics.
- Background queue backlog gauges with partial indexes.
- Dedicated background worker lifecycle and worker scripts.
- Node runtime support moved from Node 20 to Node 22+, with CI on Node 22/24.
- Repo secret hygiene guard for tracked secret-shaped literals.
