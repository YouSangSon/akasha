# Project Agent Rules

## Before Starting

Read these to understand the codebase:

- **[README.md](README.md)** — project overview, quick-start, and architecture summary
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — dev setup, conventions, and PR expectations
- **[docs/architecture.md](docs/architecture.md)** — component diagram and data flow
- **[docs/configuration.md](docs/configuration.md)** — all environment variables
- **[docs/README.md](docs/README.md)** — index of all documentation

## Key Conventions

- Embedding default is `transformers` (free local ONNX). `OPENAI_API_KEY` is **optional** — only needed when `EMBEDDING_PROVIDER=openai`.
- All memory operations are org-scoped. Pass `organizationId` on every call.
- Migrations live in `src/db/migrations/`. The current range is `001-011`.
- Tests: `npm test`. Type-check: `npm run typecheck`.
