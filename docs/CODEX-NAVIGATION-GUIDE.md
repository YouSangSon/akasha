> **English** | [한국어](CODEX-NAVIGATION-GUIDE.ko.md)

# Codex Navigation Guide

Use this guide to find the smallest owner for a change while preserving the
public contract. It supplements `AGENTS.md`; it does not replace the product and
architecture docs.

## Read Order

1. `goal.md`, `GATES.md`, and `PLAN.md` for the active objective and evidence.
2. `CONTEXT.md` and `DESIGN.md` for product language and evaluation design.
3. `CONTRACTS.md` for frozen public surfaces.
4. `README.md`, `CONTRIBUTING.md`, `docs/architecture.md`, and
   `docs/configuration.md` for runtime and contributor rules.
5. The focused source owner and its nearest tests.

## Ownership Map

| Surface | Primary owner |
| --- | --- |
| MCP assembly, schemas, prompts, resources | `src/mcp/` |
| Streamable MCP and JSON HTTP transports | `src/app/` |
| Memory persistence and canonical indexing | `src/store/` |
| Qdrant and pgvector adapters | `src/vector/` |
| Embedding providers | `src/embedding/` |
| Hybrid retrieval and ranking | `src/search/` |
| Context-pack rendering | `src/context-pack/` |
| Archive, compaction, and retry workers | `src/compact/` |
| Goal-run state | `src/goal-run/` |
| Schema history | `src/db/migrations/001_initial.sql` through `015_*` |

Follow callers before moving an owner. Public descriptors in
`src/mcp/tool-schemas.ts`, SDK types in `src/mcp/types.ts`, and the runtime
handler must stay aligned.

## Fast Navigation

```bash
rg -n "tool_name|route_path|field_name" src tests docs
rg -n "function_name|TypeName" src tests
rg --files src tests docs | sort
git status --short --branch
git diff -- path/to/owner path/to/test
```

Prefer the nearest existing helper and test. Do not add an abstraction until a
real second caller requires it.

## Public Contract Change Packet

Before changing a tool, route, envelope, auth rule, CLI flag, or migration,
review together:

- `CONTRACTS.md` and `docs/api-reference.md`
- `src/mcp/tool-schemas.ts`, `src/mcp/types.ts`, and the owning handler
- MCP, JSON HTTP, and SDK-facing tests for that surface
- English/Korean documentation mirrors and `docs/README*.md`
- compatibility, migration, rollback, and organization-isolation impact

If compatibility cannot be preserved, stop the batch and design a versioned
adapter or migration before editing the public surface.

## Verification Scale

| Change | Minimum check |
| --- | --- |
| Documentation only | relevant docs drift test and `git diff --check` |
| One private owner | nearest focused test, typecheck, diff check |
| Shared schema/handler/vector/store | focused contract and integration tests, typecheck, build |
| Batch closeout | full `npm test`, typecheck, build, audit, diff review |

Integration skips are not passes. Record the exact backend, versions, executed
and skipped counts, and whether evidence is local, client, or production.

## Worktree And Data Safety

- Inspect branch, HEAD, dirty paths, and linked worktrees before editing.
- Preserve unrelated tracked and untracked files; stage only the bounded owner.
- Never rewrite or delete migrations `001-015`. New schema work gets the next
  migration after a data and rollback review.
- Use explicit `organizationId` values in every memory test and operation.
- Clean only processes, containers, volumes, and fixtures created by the current
  task. Do not push, deploy, publish, spend, or change credentials without the
  user's explicit authorization.
