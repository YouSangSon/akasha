# DECISIONS

## 2026-06-27 — Separate Sweeper Lifecycle From HTTP Serving

Decision: add a dedicated background worker entrypoint while preserving the
existing opt-in sweeper behavior inside the HTTP server.

Why:
- Sweepers are operational background work, not request handling.
- Multi-replica HTTP deployments need a simple way to run many web replicas
  while keeping recovery workers on one continuously running process.
- Existing sweeper claim queries already use visibility windows and
  `FOR UPDATE SKIP LOCKED`, so the worker can reuse the same domain logic.

Implementation:
- `startBackgroundWorkers()` bootstraps canonical services once and starts the
  enabled compaction and ingest loops.
- `src/app/worker.ts` runs that lifecycle in fail-fast mode.
- `startOperatorServer()` keeps log-and-continue behavior and shares the same
  metrics registry with in-process sweepers.

Tradeoff:
- The dedicated worker currently logs sweeper activity but does not expose its
  own HTTP metrics endpoint. Existing HTTP `/metrics` still exposes queue
  backlog gauges from Postgres; add a worker metrics endpoint only when
  operators need to scrape per-worker tick counters from a separate process.

Sources checked:
- Node HTTP docs: `server.close()` stops accepting new connections and closes
  idle connections, which supports a small `closeOperatorServer()` wrapper for
  app-owned cleanup after HTTP close:
  https://nodejs.org/api/http.html#serverclosecallback
- Redis `agent-memory-server` documents separate production API and background
  worker processes for non-blocking background work, which supports Akasha's
  one-web-replica-or-one-worker guidance without adding a new queue system:
  https://github.com/redis/agent-memory-server

## 2026-06-27 — Keep Node Runtime Support Under Review

Decision: do not change `engines.node` or CI in the worker loop, but add a
high-priority backlog item to move from Node 20 support to supported LTS lines.

Why:
- The Node.js release schedule marks Node 20 as End-of-Life on 2026-04-30.
- The June 2026 Node.js security release covers supported 22.x, 24.x, and 26.x
  lines, not Node 20.

Sources:
- Node release schedule: https://github.com/nodejs/release#release-schedule
- June 2026 Node.js security release:
  https://nodejs.org/en/blog/vulnerability/june-2026-security-releases
