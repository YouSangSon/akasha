# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — Embedding Provider Factory Input Guards

Status:
- `createEmbeddingProvider` now rejects malformed router/config input, unknown
  provider names, invalid model/dimensions values, and non-string OpenAI API
  key values before provider construction.
- The OpenAI branch now treats missing and whitespace-only API keys as the
  same documented `OPENAI_API_KEY` configuration error.
- Existing local provider routing and provider-name helper behavior are
  preserved.
- Focused embedding factory tests, typecheck, build, audit, and single-worker
  full suite passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
