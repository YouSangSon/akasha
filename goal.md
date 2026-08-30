# Goal

Prove with reproducible local evidence that Akasha's default
`transformers + Qdrant` stack helps Codex and Claude recover the right durable
project and user knowledge while reducing input context tokens without lowering
task success or omitting required decisions. Complete the goal only when the
default write-search-context-pack flow works end to end; a fixed, org-scoped
corpus passes the retrieval and latency thresholds recorded in `GATES.md`;
controlled Akasha-on/off runs for both clients report task success, required
decision recall, and input-token deltas; public transports, 20 service tools,
three MCP-only tools, `organizationId` semantics, and migrations `001-015`
remain compatible; security, error handling, accessibility, tests, and product
claims match the evidence. Keep repository symbol and call-graph indexing,
external deployment or production-performance proof, paid model calls,
credential changes, and external publication outside this goal unless the user
explicitly authorizes them. Resume in the order `goal.md` → `GATES.md` →
`PLAN.md`, and never promote partial or local-only evidence to client,
deployment, or production proof.
