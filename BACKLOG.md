# BACKLOG

Prioritize in this order unless a core product capability materially changes
the value of Akasha: stability/bugs, testability, scalability, developer
experience, documentation, features.

## P0

- None currently known.

## P1

- Finish dedicated worker process documentation and verification.
  Evidence: `src/app/worker.ts`, `src/app/background-workers.ts`, package
  scripts, and operations docs should all agree.
- Move runtime support and CI off Node 20.
  Evidence: Node 20 is EOL as of 2026-04-30 in the official release schedule;
  `package.json` currently allows `>=20` and CI still runs Node 20.

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
