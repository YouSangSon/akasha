# DESIGN

This file defines the value-validation design for `goal.md`. The runtime
architecture remains in `docs/architecture.md`, and public compatibility stays
governed by `CONTRACTS.md`.

## User Flow Under Test

1. Store project and user decisions through the public service surface with an
   explicit organization.
2. Start a later task with only its question and stable experiment fixtures.
3. Retrieve memories and build a bounded context pack.
4. Complete the same task with Akasha off and on.
5. Compare task success, required-decision recall, input tokens, and failures.

## Retrieval Evaluation

- Keep one versioned corpus with project memories, user memories, hard
  negatives, and organization-isolation decoys.
- Record expected relevant memory IDs before running the system. Retrieval code
  must not construct the answer key.
- Run the real default `transformers + Qdrant` factories after a warm-up query.
- Gate project/user retrieval at `k=5` with recall, reciprocal rank, and warmed
  p50/p95 latency. Report cold start separately.
- Treat organization leakage as an immediate failure, regardless of aggregate
  ranking scores.

## Context And Agent Evaluation

- Evaluate retrieval and context-pack rendering separately so formatting cannot
  hide a ranking miss.
- Compare Akasha off/on with the same repository snapshot, task prompt, model,
  settings, tool permissions, and maximum attempts.
- The answer key lists required decisions and forbidden contradictions. A run is
  successful only when its task check passes and it includes every required
  decision.
- Count actual client-reported input tokens when available. Also record context
  pack tokens with the model's tokenizer; character count is diagnostic only.
- A smaller prompt with lower success or a required-decision omission is a
  failure, not a saving.

## Trust Boundaries

- Public request and response contracts, organization isolation, secret
  rejection, and migration order do not change for an evaluation shortcut.
- Operator UI success messages must reflect returned results, including no-op
  updates and pending vector cleanup.
- Keyboard access, focus, readable errors, and status announcements remain
  required for local-only UI.

## Evidence Boundary

Each product claim maps to a gate in `GATES.md` with a command, date, and
result. Local integration does not establish real-client behavior; real-client
behavior does not establish deployment, backup recovery, or production
performance. Missing external authority is recorded as `EXTERNAL`, never
silently treated as green.

## Non-goals

- Repository symbol, reference, and call-graph indexing.
- New public tools or transport versions for the evaluation harness.
- External deployment, credential changes, paid inference, or publication.
