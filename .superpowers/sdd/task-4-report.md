# Task 4 Report

## Summary

- Task: Documentation and drift coverage for MCP Streamable HTTP, MCP resources/prompts, and structured tool outputs
- Branch: `feat/mcp-streamable-http-roadmap`
- Base before task: `f968c58`
- Commit: `ae89b91` (`docs: document MCP HTTP resources and prompts`)

## RED

1. Added a new public-docs drift assertion in `tests/scripts/public-docs-drift.test.ts` covering:
   - `MCP Streamable HTTP`
   - `POST /mcp`
   - MCP prompt names
   - MCP resource template URIs
2. Ran:

```bash
npm test -- tests/scripts/public-docs-drift.test.ts
```

3. Result: FAIL, as expected.
   - Failure reason: `README.md` did not contain `MCP Streamable HTTP`.

## GREEN

Updated these public docs minimally and consistently:

- `README.md`
- `README.ko.md`
- `docs/api-reference.md`
- `docs/api-reference.ko.md`

Documented behavior:

- MCP stdio remains available
- MCP Streamable HTTP endpoint is `/mcp`
- Primary documented MCP HTTP entrypoint is `POST /mcp`
- SDK transport also supports `GET` and `DELETE` on `/mcp`
- JSON HTTP remains under `/v1/*`
- MCP tool outputs expose both `structuredContent` and JSON text `content`
- MCP resource templates:
  - `akasha://memory/recent/{projectKey}`
  - `akasha://context-pack/{projectKey}/{task}`
- MCP prompts:
  - `akasha_session_start`
  - `akasha_store_memory`

Re-ran:

```bash
npm test -- tests/scripts/public-docs-drift.test.ts
```

Result: PASS.

## Full verification

Ran:

```bash
npm run typecheck
npm test
```

Results:

- `npm run typecheck`: PASS
- `npm test`: PASS (`44` test files passed, `2` skipped; `428` tests passed, `27` skipped)

## Changed files

- `README.md`
- `README.ko.md`
- `docs/api-reference.md`
- `docs/api-reference.ko.md`
- `tests/scripts/public-docs-drift.test.ts`

## Self-review notes

- Kept the README changes narrow: transport wording only, no unrelated restructuring.
- Added the MCP resources/prompts section in API docs where readers already look for protocol surface details.
- Included `structuredContent` plus JSON text `content` in API docs because that behavior changed in Tasks 1-3 even though the brief's sample assertions did not cover it.
- Mirrored the same transport split and MCP endpoint details in Korean docs.

## Concerns

- None at implementation time.

---

## Task 4 Review Fix — 2026-06-25

### Summary

- Task: Fix Task 4 review findings for Akasha public docs
- Branch: `feat/mcp-streamable-http-roadmap`
- Base before fix: `ae89b91`
- Commit: `3658373` (`docs: align MCP HTTP auth documentation`)

### RED

1. Expanded `tests/scripts/public-docs-drift.test.ts` first to cover the review findings:
   - README architecture table distinguishes `src/mcp/` as the shared MCP server surface.
   - README architecture table distinguishes `src/app/` as serving MCP Streamable HTTP `/mcp` plus JSON HTTP `/v1/*`.
   - API reference auth wording states `/mcp` is auth-gated when `MEMORY_API_TOKENS` is configured.
   - API reference removes the stale “Both transports” wording now that three access paths are documented.
   - Korean docs mirror the same behavior claims.
2. Ran:

```bash
npm test -- tests/scripts/public-docs-drift.test.ts
```

3. Result: FAIL, as expected.
   - Failure reason: `README.md` did not contain `Shared MCP server surface`.

### GREEN

Updated these files:

- `README.md`
- `README.ko.md`
- `docs/api-reference.md`
- `docs/api-reference.ko.md`
- `tests/scripts/public-docs-drift.test.ts`

Documentation changes:

- Clarified that `src/mcp/` owns the shared MCP server surface.
- Clarified that `src/app/` serves MCP Streamable HTTP on `/mcp` and JSON HTTP under `/v1/*`.
- Updated HTTP auth wording so bearer-token requirements explicitly cover both `/mcp` and `/v1/*` when tokens are configured.
- Preserved the loopback-only local-development exception wording.
- Replaced “Both transports” with wording that matches the three documented access paths.
- Kept Korean wording aligned with the English behavior claims.

Re-ran:

```bash
npm test -- tests/scripts/public-docs-drift.test.ts
```

Result: PASS.

### Full verification

Ran:

```bash
npm run typecheck
npm test
```

Results:

- `npm test -- tests/scripts/public-docs-drift.test.ts`: PASS (`5` tests passed)
- `npm run typecheck`: PASS
- `npm test`: PASS (`44` test files passed, `2` skipped; `428` tests passed, `27` skipped)

### Changed files

- `README.md`
- `README.ko.md`
- `docs/api-reference.md`
- `docs/api-reference.ko.md`
- `tests/scripts/public-docs-drift.test.ts`
- `.superpowers/sdd/task-4-report.md`

### Self-review

- The new drift assertions cover the specific review regressions instead of broader doc text.
- The docs continue to distinguish MCP Streamable HTTP `/mcp` from JSON HTTP `/v1/*`; nothing suggests `/v1/*` is an MCP transport.
- The auth wording remains token-based only and does not imply OAuth support.
- Korean docs mirror the same transport and auth guarantees as English.

### Concerns

- None.

### Controller correction

- The fix subagent returned final commit `f6d4289`; the `3658373` value above is a stale intermediate hash from before the final commit landed.
