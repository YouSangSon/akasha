# Task 4 Report

## Summary

- Task: Public Documentation Drift Fixes
- Branch: `feat/akasha-growth-foundation-wave`
- Commit: `ecfd957` (`docs: close growth foundation drift`)
- Scope: public docs and drift tests only, plus this required report file

## TDD Red

Added the exact public docs drift tests from `task-4-brief.md` to
`tests/scripts/public-docs-drift.test.ts`, covering:

- migration range `001-009` and next migration `010_`
- the three public transports, including MCP Streamable HTTP at `/mcp`
- API schema details for `add_memory.kind`, context-pack sections, and MCP response output
- changelog PR `#19` coverage
- Qdrant vs pgvector backup distinctions

Ran:

```bash
npm test -- tests/scripts/public-docs-drift.test.ts
```

Result: FAIL as expected.

Observed failures:

- stale migration range in `AGENTS.md`
- missing `MCP Streamable HTTP` wording in architecture/security docs
- stale `add_memory.kind` API docs
- missing PR `#19` changelog entry
- missing `VECTOR_BACKEND=qdrant` / `VECTOR_BACKEND=pgvector` backup distinctions

## Green Changes

Updated the owned docs to match current source behavior:

- migration range is now documented as `001-009`
- next migration guidance now points to `010_*.sql`
- architecture transport layer names:
  - `src/mcp/server.ts` -> MCP SDK stdio
  - `src/app/mcp-http.ts` -> MCP Streamable HTTP at `/mcp`
  - `src/app/routes/memory.ts` -> JSON HTTP under `/v1/*`
- read data flow now uses `vectorIndex.query` and the active vector backend
- security docs now treat `/mcp` as an HTTP attack surface alongside `/v1/*`
- API docs now document `decision | summary | fact`, context-pack section arrays, `structuredContent`, and one serialized JSON text content item
- changelogs now mention PR `#19`, `/mcp`, MCP resources, MCP prompts, and structured MCP tool output
- backup/restore docs now distinguish Qdrant snapshots from pgvector-in-Postgres data
- Korean mirrors were updated with the same literal drift-guard tokens

Re-ran:

```bash
npm test -- tests/scripts/public-docs-drift.test.ts
```

Result: PASS, 10 tests passed.

## Verification

Focused test:

```bash
npm test -- tests/scripts/public-docs-drift.test.ts
```

PASS: 1 test file, 10 tests.

Typecheck:

```bash
npm run typecheck
```

PASS.

Full test suite:

```bash
npm test
```

PASS: 45 test files passed, 2 skipped; 450 tests passed, 27 skipped.

Docker:

```bash
docker build -f docker/app.Dockerfile .
```

PASS. Docker server was available (`5.7.1`). Build completed; Docker printed the expected cache-only warning because no output target was specified.

Diff checks:

```bash
git diff --check main...HEAD
```

PASS: no whitespace errors.

`git diff --stat main...HEAD` completed. It includes prior Tasks 1-3 branch changes as expected; the Task 4 commit itself changes 17 files with 260 insertions and 91 deletions.

Self-review command:

```bash
rg -n "001[–-]008|my-token:|src/mcp/server.ts\\s+→ http|Qdrant \\(cosine|Both transports share" AGENTS.md CONTRIBUTING.md CONTRIBUTING.ko.md README.ko.md CHANGELOG.md CHANGELOG.ko.md docs src tests compose.yaml docker/app.Dockerfile
```

Matches inspected:

- `tests/scripts/public-docs-drift.test.ts`: intentional negative assertions guarding stale docs.
- `tests/app/bearer-auth.test.ts:208`: legitimate existing test fixture asserting `MEMORY_API_TOKENS="my-token:"` is rejected for empty org binding.

No stale public-docs matches remain.

## Commit

- `ecfd957` `docs: close growth foundation drift`

Note: `AGENTS.md` is ignored by `.git/info/exclude`, but the task explicitly owns and requires it, so it was staged with `git add -f AGENTS.md`.

## Concerns

- None.

---

## Task 4 Review Fix — 2026-06-26

### Reviewer Findings Addressed

- Backup docs now warn that the current packaged `npm run backup:create`
  command still invokes `scripts/snapshot-qdrant.sh` and therefore requires
  `QDRANT_URL`, even for pgvector operators whose logical vector data lives in
  Postgres.
- API docs now document `build_context_pack.sections` arrays as
  `SearchMemoryResult[]`, matching `ContextPackSections` in source.
- Drift tests now assert the `SearchMemoryResult[]` element type and the
  packaged Qdrant snapshot caveat.

### Tests Run

```bash
npm test -- tests/scripts/public-docs-drift.test.ts
```

Result: PASS. 1 test file passed, 10 tests passed.

Typecheck was not re-run because the test changes were string assertions only.

### Files Changed

- `docs/api-reference.md`
- `docs/api-reference.ko.md`
- `docs/operations.md`
- `docs/operations.ko.md`
- `docs/self-hosted-operations.md`
- `docs/self-hosted-operations.ko.md`
- `tests/scripts/public-docs-drift.test.ts`
- `.superpowers/sdd/task-4-report.md`

---

## Task 4 Second Review Fix — 2026-06-26

### Reviewer Findings Addressed

- API reference docs now reserve `SearchMemoryResult` for the individual memory
  record shape from `src/types.ts`.
- API reference docs now name the `search_memory` response envelope
  `SearchMemoryResponse`, with `results: SearchMemoryResult[]`.
- README common-command backup guidance now states that the packaged
  `npm run backup:create` command still invokes `scripts/snapshot-qdrant.sh`,
  requires `QDRANT_URL`, and remains Qdrant-oriented until a later script split.
- README common-command backup guidance now states that with
  `VECTOR_BACKEND=pgvector`, logical vector data lives in Postgres even though
  the packaged backup command still runs the Qdrant snapshot step.
- Drift tests now fail if API docs define `SearchMemoryResult` as the wrapper
  instead of a record, and now assert the README EN/KO backup caveat.

### Tests Run

```bash
npm test -- tests/scripts/public-docs-drift.test.ts
```

Result: PASS. 1 test file passed, 10 tests passed.

### Files Changed

- `README.md`
- `README.ko.md`
- `docs/api-reference.md`
- `docs/api-reference.ko.md`
- `tests/scripts/public-docs-drift.test.ts`
- `.superpowers/sdd/task-4-report.md`
