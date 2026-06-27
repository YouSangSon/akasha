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

Decision: move Akasha's minimum supported Node runtime from Node 20 to Node 22,
and test Node 22 plus Node 24 in CI.

Why:
- The Node.js release schedule marks Node 20 as End-of-Life on 2026-04-30.
- The June 2026 Node.js security release covers supported 22.x, 24.x, and 26.x
  lines, not Node 20.

Sources:
- Node release schedule: https://github.com/nodejs/release#release-schedule
- June 2026 Node.js security release:
  https://nodejs.org/en/blog/vulnerability/june-2026-security-releases

Implementation:
- `package.json` and lockfile root metadata use `engines.node: >=22`.
- `@types/node` is on the Node 22 line to match the oldest supported runtime.
- `.github/workflows/ci.yml` tests Node 22 and 24.
- `install.sh` refuses Node majors below 22.

## 2026-06-28 — Guard Tracked Secret-Shaped Literals Without Reporting Values

Decision: add a repo-level Vitest script that scans tracked text files with the
existing `scanForSecrets` helper, while reporting only file path and category.

Why:
- Runtime memory writes are already blocked by `src/store/secret-scrub.ts`, but
  tracked tests, fixtures, docs, env examples, YAML, JSON, TOML, Docker, and
  CI files can still contain high-confidence secret-shaped literals.
- GitHub push protection is designed to stop hardcoded credentials before they
  reach a repository, so synthetic contiguous examples can block pushes even
  when fake.
- OWASP Secrets Management identifies API keys, database credentials, SSH keys,
  certificates, and similar values hardcoded in source/config as a common
  secret-leak source.

Implementation:
- `tests/scripts/repo-secret-hygiene.test.ts` scans `git ls-files` text files.
- The test excludes `src/store/secret-scrub.ts` and
  `tests/store/secret-scrub.test.ts`, where detector regexes and examples are
  intentional.
- The test allowlists only exact placeholder database URL userinfo pairs such as
  `memory:memory`, `user:pass`, `user:pw`, `postgres:test`, `memory:STRONG_PW`,
  and the exact `${POSTGRES_USER:-memory}:${POSTGRES_PASSWORD:-memory}` form;
  other embedded DB credentials still fail.
- Non-scrubber store tests now build fake AWS/GitHub tokens from string
  fragments at runtime so the tracked source does not contain contiguous
  secret-shaped literals.

Sources:
- GitHub push protection:
  https://docs.github.com/en/code-security/concepts/secret-security/push-protection
- OWASP Secrets Management Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
