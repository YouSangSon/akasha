> **English** | [한국어](CONTRIBUTING.ko.md)

# Contributing to Akasha

Thanks for taking the time to contribute. This document covers what we expect
from a contribution, how to get a working dev environment, and the conventions
the codebase already follows.

## Ground rules

- **Open an issue first** for non-trivial changes. A 30-second sketch of the
  problem and proposed shape avoids days of work going the wrong way.
- **One concern per pull request.** Refactor + feature + dependency bump in
  one PR is hard to review and hard to revert.
- **Tests are mandatory** for new code paths. The codebase has 200+ unit tests;
  matching that bar keeps regressions from creeping in.
- **No breaking changes without a CHANGELOG note** (see below).

## Dev environment

```bash
git clone https://github.com/YouSangSon/akasha.git
cd akasha
cp .env.example .env
${EDITOR:-nano} .env       # set MEMORY_API_TOKENS (OPENAI_API_KEY only if using EMBEDDING_PROVIDER=openai)
./install.sh
```

Daily commands:

| Goal | Command |
|------|---------|
| HTTP API watch mode | `npm run dev:server` |
| MCP server watch mode | `npm run dev:mcp` |
| CLI watch mode | `npm run dev:cli` |
| Type-check | `npm run typecheck` |
| Run all tests | `npm run test` |
| Watch tests | `npm run test:watch` |
| Apply migrations | `npm run db:migrate` |

The 3 PG-dependent test files (`tests/store/memory-repository.test.ts`,
`tests/jobs/ingest-job-repository.test.ts`, `tests/db/migrate.test.ts`) skip
gracefully when Postgres on `127.0.0.1:5432` isn't reachable; bring it up via
`docker compose up -d postgres` if you want them to run locally.

## Code conventions

### TypeScript

- Strict mode; no `any`; `unknown` for untrusted input narrowed at the boundary.
- Functions ≤ 50 lines, files ≤ 800 lines (a few existing files exceed this;
  prefer splitting on next touch).
- Immutable updates (`{ ...obj, field: value }`); avoid mutation.
- `catch (err: unknown)` always; never bare `catch (e)`.

### Tests

- Vitest (`tests/**/*.test.ts`).
- Arrange / Act / Assert layout.
- Descriptive names: `it("falls back to substring search when Redis is unavailable", …)`.
- Mocked dependencies for unit tests; real Postgres + Qdrant for integration tests
  (gated by environment availability, not skipped categorically).

### Repository pattern

Data access lives behind interfaces in `src/types.ts` (`MemoryRepository`,
`CanonicalMemoryRepository`) and `src/store/memory-archive-repository.ts`
(`MemoryArchiveRepository`). New SQL goes in the matching `createXRepository`
factory. Tool handlers and orchestrators consume the interface, not the impl.

### Migrations

SQL files live in `src/db/migrations/NNN_*.sql`. Current migration files span
`001-009`; the next migration should be `010_*.sql`. Future schema changes
append the next unused number after the current range, add the filename to
`MIGRATION_FILES` in `src/db/migrate.ts`, and add the embedded snapshot string
for production fallbacks. All migrations must be idempotent
(`CREATE … IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) and safe to run on
populated databases.

## Pull-request workflow

1. **Branch** off `main` with a descriptive name (`feat/something`,
   `fix/something`, `docs/something`).
2. **Commits**: prefer logical, atomic commits over one giant squash. Use
   conventional prefixes:
   - `feat:` new user-visible capability
   - `fix:` bug fix
   - `refactor:` no behavior change
   - `docs:` documentation only
   - `test:` test additions or fixes
   - `chore:` deps, build, tooling
3. **Tests + typecheck pass locally** before pushing.
4. **CHANGELOG.md**: add a line to the `## [Unreleased]` section describing
   the user-visible change (skip for purely internal refactors).
5. **PR description**: link the issue if any, describe what changed and why,
   include a small test-plan checklist.

## Reporting bugs / requesting features

Use the issue templates under `.github/ISSUE_TEMPLATE/`. For security issues,
follow [SECURITY.md](SECURITY.md) — don't open a public issue.

## License

Contributions are accepted under the same [MIT license](LICENSE) as the
project.
