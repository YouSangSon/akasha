# WORKLOG

## 2026-06-27

- Read project rules, README, contributing guide, architecture/config docs,
  docs index, package scripts, CI, and test layout.
- Confirmed no repo-local `CLAUDE.md` or `.agents/skills/` directory exists.
- Implemented goal-run hardening and documentation refresh in the active branch.
- Added sweeper metrics for compaction and ingest loops.
- Added `/metrics` background queue backlog gauges and partial indexes to avoid
  historical-row scans.
- Added dedicated background worker lifecycle:
  - `src/app/background-workers.ts`
  - `src/app/worker.ts`
  - `npm run dev:worker`
  - `npm run start:worker`
- Fixed review findings:
  - HTTP executable shutdown now awaits worker/probe cleanup via
    `closeOperatorServer()`.
  - Worker startup now happens only after HTTP bind succeeds.
  - Listen failure cleans the probe pool and does not start workers.
- Focused worker tests passed:
  `npm test -- tests/app/background-workers.test.ts tests/app/start-background-workers-server.test.ts tests/app/worker.test.ts tests/app/start-operator-server-metrics.test.ts`.
- Web/GitHub research:
  - Node HTTP docs confirmed `server.close()` handles HTTP close, while
    Akasha-owned worker/pool cleanup needs an app wrapper:
    https://nodejs.org/api/http.html#serverclosecallback
  - Redis `agent-memory-server` uses separate production API and background
    worker processes, matching the dedicated worker topology:
    https://github.com/redis/agent-memory-server
  - Node release data shows Node 20 is EOL as of 2026-04-30; added a backlog
    item to move runtime/CI support to active LTS lines:
    https://github.com/nodejs/release#release-schedule

Next:
- Commit locally.

Verification:
- `npm test -- tests/app/background-workers.test.ts tests/app/start-background-workers-server.test.ts tests/app/worker.test.ts tests/app/start-operator-server-metrics.test.ts`
- `npm test -- tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`62` files passed, `2` skipped; `605` tests passed, `34` skipped)
- `git diff --check`

## 2026-06-28

- Refreshed in-range dependency lockfile/install updates:
  - `@modelcontextprotocol/sdk` 1.28.0 -> 1.29.0.
  - `@qdrant/js-client-rest` 1.17.0 -> 1.18.0.
  - `pg` 8.20.0 -> 8.22.0, including its in-range transitive `pg-*`
    packages.
  - Skipped major upgrades reported by `npm outdated` without approval.
  - Checked package metadata: Node engines remain compatible with the Node 22
    floor, licenses are MIT or Apache-2.0, and `npm audit` reported 0
    vulnerabilities after update.

Verification:
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (615 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Updated general operations Qdrant restore examples to use the host-published
  Qdrant port:
  - English/Korean operations docs now call host `curl` against
    `http://127.0.0.1:6333/...` instead of assuming the Qdrant container has
    `curl` installed.
  - Public docs drift coverage now guards against reintroducing
    `docker compose exec qdrant curl -X POST` in the restore example.

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (615 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Aligned general operations Qdrant restore examples with collection-name
  configuration:
  - English/Korean operations docs now use `QDRANT_COLLECTION_NAME` for the
    snapshot upload collection instead of hardcoding `memory_chunks_v1`.
  - The upload examples include `priority=snapshot`, matching the self-hosted
    restore-smoke command.
  - Public docs drift coverage now guards both operations and self-hosted
    restore upload paths.

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (615 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Fixed architecture docs embedding module filename drift:
  - English/Korean architecture docs now reference the real
    `src/embedding/local-embedding.ts` module instead of the stale pluralized
    path.
  - Public docs drift coverage now verifies all documented embedding provider
    module filenames exist and are listed in both architecture docs.

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (615 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Removed stale Transformers dynamic-import TypeScript suppression:
  - `@huggingface/transformers` is a regular dependency and ships declarations.
  - `src/embedding/transformers-embedding.ts` no longer needs the old
    `@ts-ignore` before the dynamic import.

Verification:
- `npx vitest run tests/embedding/transformers-embedding.test.ts tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (614 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Aligned Transformers dependency docs/comments with package metadata:
  - `package.json` installs `@huggingface/transformers` as a regular runtime
    dependency because `EMBEDDING_PROVIDER=transformers` is the default.
  - Code comments and public docs no longer call it an optional dependency.
  - The runtime error now points at a missing/pruned runtime install instead of
    optional dependency installation.
  - Public docs drift coverage now guards the English/Korean docs and source
    comments against reintroducing optional-dependency wording while the package
    remains in `dependencies`.

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (614 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Clarified dedicated worker metrics guidance:
  - Operations runbooks now separate in-process HTTP sweeper tick counters from
    dedicated worker mode.
  - Dedicated `npm run start:worker` operators should use worker process logs
    for tick activity and HTTP `/metrics` only for Postgres backlog gauges.
  - API and operations docs now state that the dedicated worker currently has
    no HTTP metrics listener.
  - Public docs drift coverage now guards the English/Korean wording.
- Source rationale:
  - Prometheus `scrape_config` entries define the targets Prometheus scrapes;
    a dedicated worker process without an HTTP listener is not a scrape target:
    https://prometheus.io/docs/prometheus/latest/configuration/configuration/#scrape_config

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (0 vulnerabilities)
- `npm test` (613 passed, 34 skipped across 65 files)
- `git diff --check`
- `git diff --cached --check`

- Implemented Node runtime support update:
  - `package.json` and root lock metadata now require Node `>=22`.
  - `@types/node` now targets the Node 22 line so TypeScript cannot silently
    admit Node 24-only APIs while package support starts at Node 22.
  - GitHub Actions CI now runs Node 22 and 24.
  - README badges/quick-start docs, troubleshooting docs, and `install.sh`
    now state/enforce Node.js >= 22.
  - Public docs drift tests now guard package metadata, lock metadata, README
    badges, troubleshooting docs, CI matrix, and installer runtime checks.
- Review gates:
  - Spec compliance passed.
  - Quality review initially caught Node 24 type definitions and missing
    installer drift coverage; both were fixed and re-review approved.
- Implemented repo secret hygiene guard:
  - Added `tests/scripts/repo-secret-hygiene.test.ts` to scan `git ls-files`
    text files with Akasha's existing `scanForSecrets` helper.
  - Failure output is limited to file path and secret category; matched values
    are never reported.
  - Excluded the detector source and scrubber unit test, where regexes and
    examples are intentional.
  - Allowed only exact placeholder DB URL userinfo pairs such as
    `memory:memory`, `user:pass`, `user:pw`, `postgres:test`, `memory:STRONG_PW`,
    and the exact `${POSTGRES_USER:-memory}:${POSTGRES_PASSWORD:-memory}` form;
    other embedded DB credentials still fail.
  - Split synthetic AWS/GitHub secret-shaped literals in non-scrubber store
    tests into runtime string fragments.
  - Review gates:
    - Spec compliance passed.
    - Quality review caught broad DB credential allowlisting and untracked test
      risk; both were fixed before final verification.
- Source rationale:
  - GitHub push protection blocks hardcoded credentials before they reach a
    repository, including test/fixture-shaped tokens:
    https://docs.github.com/en/code-security/concepts/secret-security/push-protection
  - OWASP Secrets Management calls out API keys, database credentials, SSH
    keys, certificates, and similar secrets hardcoded in source/config as a
    common leak source:
    https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts`
- `npx vitest run tests/scripts/repo-secret-hygiene.test.ts`
- `npx vitest run tests/store/secret-scrub.test.ts tests/store/canonical-indexing.test.ts tests/store/memory-repository.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`63` files passed, `2` skipped; `608` tests passed, `34` skipped)
- `git diff --check`

- Reviewed the backup/restore runbooks against the current Qdrant and pgvector
  paths.
  - `scripts/restore-smoke.ts` now passes the backup manifest's
    `qdrant.collectionName` to restore commands as
    `RESTORE_SMOKE_QDRANT_COLLECTION_NAME`, falling back to
    `QDRANT_COLLECTION_NAME` or `memory_chunks_v1` for older manifests.
  - The self-hosted restore examples now upload Qdrant snapshots to the
    manifest-derived collection and use `priority=snapshot`.
  - Public docs drift coverage now pins the restore command away from hardcoded
    `memory_chunks_v1`.
- Source rationale:
  - Qdrant's snapshot API recovers uploaded snapshots through the collection
    scoped `/collections/{collection_name}/snapshots/upload` endpoint and
    supports `priority=snapshot` for snapshot-led recovery:
    https://api.qdrant.tech/api-reference/snapshots/recover-from-uploaded-snapshot

Verification:
- `npx vitest run tests/scripts/restore-smoke.test.ts tests/scripts/public-docs-drift.test.ts`
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`63` files passed, `2` skipped; `611` tests passed, `34` skipped)
- `git diff --check`

- Implemented public docs index drift coverage:
  - `tests/scripts/public-docs-drift.test.ts` now discovers tracked public
    markdown under `docs/`, excluding `docs/superpowers/**` and the docs index
    files.
  - The guard checks every English public doc has a `.ko.md` sibling, every
    Korean doc has an English sibling, and both docs indexes contain the pair
    in English-first / Korean-first order.
  - No CI workflow change is needed because CI already runs `npm test`.

Verification:
- `npx vitest run tests/scripts/public-docs-drift.test.ts` (`19` tests passed)
- `npm run typecheck`
- `npm run build`
- `npm audit --audit-level=moderate` (`0` vulnerabilities)
- `npm test` (`63` files passed, `2` skipped; `612` tests passed, `34` skipped)
- `git diff --check`
