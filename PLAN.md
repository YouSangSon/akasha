# PLAN

This file is the durable continuation plan for ongoing Akasha improvement work.
Keep it short; detailed evidence belongs in `WORKLOG.md` and one-off rationale in
`DECISIONS.md`.

## Current Loop — OpenAI Embedding Client Input Guards

Status:
- `createOpenAiEmbeddingClient` now rejects malformed client input, blank or
  non-string API key/model values, invalid injected client factories, and
  malformed injected client results before embedding calls.
- Single-text and batch embedding methods now reject malformed direct text
  input before calling the injected API client.
- Injected `createClient` results are validated directly instead of falling
  back to the real OpenAI SDK when an injection returns `null`.
- Focused OpenAI embedding tests, typecheck, build, audit, and single-worker
  full suite passed.
- Default parallel `npm test` remains timing-sensitive on unrelated server and
  backup shell tests under load, so full-suite verification used one worker.

Loop closeout:
- Commit locally; do not push.

## Next Loop Candidates

- Pick one clear target from `BACKLOG.md`, preferring stability,
  tests, scalability, developer experience, documentation, then new features.
