# Strict Organization-ID Read Guard — Implementation Report

## Gap closed

`listMemory` (`src/store/memory-repository.ts:197`) and `getMemoryRecordsByIds`
(line 223) previously only filtered by org when `organizationId` was defined
(`if (organizationId !== undefined)`). An unbound token with no org — no `:org`
in `MEMORY_API_TOKENS`, no `x-organization-id` header, no body field — calling
`compact_memory` dry-run would reach `listMemory` with `organizationId:
undefined` and read memories org-blind across all tenants. `retrieveMemory` had
a strict guard (PR #6); `listMemory` and `getMemoryRecordsByIds` did not.

## Guard added

New shared helper: `src/store/assert-organization-id.ts`

```ts
export function assertOrganizationId(
  organizationId: string | undefined,
  allowLegacyAnonymous: boolean | undefined,
  fnName: string,
): void {
  if (organizationId === undefined && !allowLegacyAnonymous) {
    throw new Error(
      `${fnName} requires organizationId. Bind your bearer token to ` +
        "an org with the `token:org` syntax in MEMORY_API_TOKENS, send the " +
        "`x-organization-id` header (or `organizationId` in the request " +
        "body), or opt into the legacy single-tenant org-blind read by " +
        "setting LEGACY_ANONYMOUS_SEARCH=true in the server's environment.",
    );
  }
}
```

Used in three places:
- `src/search/retrieve-memory.ts` — replaces the inline guard (same behavior)
- `src/store/memory-repository.ts` — `listMemory` (first line of method)
- `src/store/memory-repository.ts` — `getMemoryRecordsByIds` (first line of method)

## Type changes (BREAKING)

| Type | Change |
|---|---|
| `ListMemoryOptions` (`src/types.ts`) | Added `allowLegacyAnonymous?: boolean` |
| `CanonicalMemoryRepository.getMemoryRecordsByIds` | Added 3rd param `allowLegacyAnonymous?: boolean` |
| `MemoryRepository.getMemoryRecordsByIds` | Added 3rd param `allowLegacyAnonymous?: boolean` |
| Structural type in `RetrieveMemoryInput.repository` | Added 3rd param to match |

## Callers updated

| Call site | File | Change |
|---|---|---|
| `compact_memory` legacy-override path | `src/mcp/server.ts:522` | Added `allowLegacyAnonymous: process.env.LEGACY_ANONYMOUS_SEARCH === "true"` |
| `compact_memory` canonical path | `src/mcp/server.ts:529` | Same |
| `retrieveMemory` → `getMemoryRecordsByIds` | `src/search/retrieve-memory.ts:97` | Forwards `input.allowLegacyAnonymous` |

**`build_context_pack`**: reaches data exclusively via `retrieveRecordsWithCanonicalServices`
→ `retrieveMemory` (canonical path) or `resolveRecords` → `options.retrieveMemory` /
repository `searchMemory` (override path). Neither calls `listMemory` or
`getMemoryRecordsByIds` directly. No change required. The existing
`retrieveMemory` guard covers the canonical path.

**All other callers grepped**: no additional callers of `listMemory` or
`getMemoryRecordsByIds` exist outside `src/store/memory-repository.ts`,
`src/search/retrieve-memory.ts`, and `src/mcp/server.ts`.

## Tests

**New (mock pool, no PG)** in `tests/store/memory-repository.test.ts`:
- `listMemory` throws when `organizationId` undefined, no flag — SEC-read
- `listMemory` throws when `allowLegacyAnonymous: false` — SEC-read
- `listMemory` does not throw when `allowLegacyAnonymous: true` — SEC-read
- `listMemory` does not throw when `organizationId` is provided — SEC-read
- `getMemoryRecordsByIds` throws when `organizationId` undefined, no flag — SEC-read
- `getMemoryRecordsByIds` does not throw when `allowLegacyAnonymous: true` — SEC-read
- `getMemoryRecordsByIds` does not throw when `organizationId` is provided — SEC-read

**Updated** (broken by new guard, fixed without weakening assertions):
- `tests/store/memory-repository.test.ts`: PERF-8 `listMemory` limit test → added `{ allowLegacyAnonymous: true }`
- `tests/store/memory-repository.test.ts`: PG `listMemory` call → added `{ allowLegacyAnonymous: true }`
- `tests/store/memory-repository.test.ts`: PG `getMemoryRecordsByIds` call → added `allowLegacyAnonymous: true`
- `tests/search/retrieve-memory.test.ts`: 3 assertions on `getMemoryRecordsByIds` call shape → added forwarded 3rd arg

**Note on `compact_memory` handler-level "no org" test**: the canonical dry-run
path requires PG + Qdrant (skipped in non-PG CI); the override path uses the
in-memory `MemoryRepository` fixture which is synchronous and does not implement
the canonical guard. Testing handler-level enforcement via a stub would only test
the stub. The honest proof is at the repository layer (mock-pool tests above),
which is exactly the code `compact_memory` calls at runtime.

## Docs

- `docs/configuration.md` / `docs/configuration.ko.md`: `LEGACY_ANONYMOUS_SEARCH`
  description expanded to note the flag now gates all three read paths
  (`retrieve_memory`, `compact_memory` dry-run, vector hydration).
- `docs/architecture.md` / `docs/architecture.ko.md`: Multi-tenancy section
  updated — org enforcement on all read paths is now accurate; mentions
  `assertOrganizationId` helper and all three guarded entry points.

## BREAKING change

This is a deliberate BREAKING change (mirrors PR #6). Any caller of
`listMemory` or `getMemoryRecordsByIds` that omits both `organizationId` and
`allowLegacyAnonymous` will now receive an operational error. Single-tenant
operators: set `LEGACY_ANONYMOUS_SEARCH=true` in `.env`. Multi-tenant operators:
pass `organizationId` (token binding, `x-organization-id` header, or body field).
