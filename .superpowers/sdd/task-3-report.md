# Task 3 Report: MCP Resources and Prompts

## Summary

- Task: Implement MCP resources and prompts in `createMcpServer`
- Branch: `feat/mcp-streamable-http-roadmap`
- Base before task: `23b3787`

## RED

Command:

```bash
npm test -- tests/mcp/server.test.ts
```

Result:

- FAIL as expected
- `createMcpServer resources and prompts > lists and reads Akasha memory resources`
- `createMcpServer resources and prompts > lists and returns Akasha prompts`
- Failure reason: `MCP error -32601: Method not found`

## GREEN

Command:

```bash
npm test -- tests/mcp/server.test.ts
```

Result:

- PASS
- `35` tests passed in `tests/mcp/server.test.ts`

## Regression

Command:

```bash
npm test -- tests/app/mcp-http.test.ts
```

Result:

- PASS
- `7` tests passed in `tests/app/mcp-http.test.ts`

## Typecheck

Command:

```bash
npm run typecheck
```

Result:

- PASS
- One intermediate failure occurred in the new test due to a `readResource` content union type; fixed by narrowing the `text` payload before parsing JSON, then reran typecheck successfully.

## Changed Files

- `src/mcp/server.ts`
- `tests/mcp/server.test.ts`

## Commit

- Commit message: `feat: add Akasha MCP resources and prompts`
- Commit hash: `294abe2`

## Self-Review Notes

- Followed TDD: added the two brief-specified tests first, captured the expected RED failure, then implemented minimal registrations.
- Reused `createMcpServer` registry bindings directly so stdio and `/mcp` share the same resources/prompts surface automatically.
- Kept scope limited to the owned files.

## Concerns

- None at implementation time.

---

## Task 3 Review Fixes

### Summary

- Task: Fix Task 3 review findings for MCP resource validation and resource/prompt coverage
- Branch: `feat/mcp-streamable-http-roadmap`
- Base before fix: `294abe2`

### RED

Command:

```bash
npm test -- tests/mcp/server.test.ts
```

Result:

- FAIL as expected
- `13` new tests failed in `tests/mcp/server.test.ts`
- Failure reasons:
  - resource template variables were capturing the query string in the last path segment for recent memory and context-pack reads
  - invalid resource `query`/`limit` values were accepted instead of rejected

### GREEN

Command:

```bash
npm test -- tests/mcp/server.test.ts
```

Result:

- PASS
- `48` tests passed in `tests/mcp/server.test.ts`

### Regression

Commands:

```bash
npm test -- tests/app/mcp-http.test.ts
npm run typecheck
```

Result:

- PASS
- `8` tests passed in `tests/app/mcp-http.test.ts`
- typecheck passed

### Changed Files

- `src/mcp/server.ts`
- `tests/mcp/server.test.ts`
- `tests/app/mcp-http.test.ts`

### Commit

- Commit message: `fix: validate MCP resource inputs`
- Commit hash: `08cf986`

### Self-Review

- Added the review-requested red cases first, captured the expected failures, then implemented the smallest server-side parsing/validation fix.
- Resource reads stay read-only; `akasha_store_memory` remains prompt-only and does not invoke `add_memory`.
- `/mcp` regression stays narrow and only proves the shared resource/prompt surface exposed by `createMcpServer`.

### Concerns

- None.
