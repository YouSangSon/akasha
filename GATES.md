# GATES

Last updated: 2026-08-31 KST. Valid states are `GREEN`, `RED`, `NOT RUN`, and
`EXTERNAL`. A green local gate is not client, deployment, or production proof.

## Product And Contract Gates

| Gate | Passing bar | Reproducible check | Current evidence | State |
| --- | --- | --- | --- | --- |
| Public contract and organization isolation | 20 service tools, three MCP-only tools, envelopes, auth precedence, and org filters remain characterized | `npm test -- tests/mcp tests/app tests/store tests/vector --reporter=dot` plus full suite | Included in 2026-08-31 full suite: 83 files passed, one skipped; 2,580 tests passed, 34 skipped | GREEN |
| Cross-backend point identity | Every positive safe chunk ID maps injectively to a Qdrant-compatible ID; all write/recovery paths share it | focused vector/store/compact/MCP tests and real Qdrant smoke | Commit `e8f9136`; six focused files, 449 tests passed; Qdrant 1.13.2 accepted the UUID form in an owned local smoke | GREEN |
| Default stack flow | Pinned Postgres + Qdrant 1.13.2 + transformers completes org-scoped write, search, and context pack from one checked-in command | retrieval integration harness to be added | One-off smoke passed after `e8f9136`, but no durable command currently reproduces the entire flow | NOT RUN |
| Default retrieval quality | At `k=5`: recall >= 0.90, MRR >= 0.55, user-scope recall = 1.00, cross-org leakage = 0 | pinned default-stack eval after warm-up | Prior transformers + pgvector result: recall 0.90, MRR 0.5575, user recall 0/2; Qdrant default has not been measured | RED |
| Warm retrieval latency | On the pinned local runner after warm-up: p50 <= 100 ms and p95 <= 250 ms; cold start reported separately | same eval, at least 60 measured queries | Prior pgvector p50/p95 5.95/12.47 ms; default Qdrant result not measured | NOT RUN |
| Context value | Required-decision omission = 0 and context-pack tokenizer count is lower than the defined raw/baseline context | context-pack fixture plus tokenizer report | Small prior corpus produced a pack 1.35x the raw memory characters; no tokenizer measurement | RED |
| Codex A/B | Paired successful runs have median input-token reduction >= 15%, no success-rate loss, omission/leakage = 0 | fixed-SHA off/on harness, three tasks x three repeats | Client is not configured for this repo and no controlled run exists | EXTERNAL |
| Claude A/B | Same per-client bar as Codex; never combine vendor token counts | fixed-SHA off/on harness, three tasks x three repeats | Client is not configured for this repo and paid execution was not authorized | EXTERNAL |

The retrieval thresholds are regression-smoke minima anchored to the existing
20-query result, not evidence of broad product quality. A publishable product
claim requires at least 50 queries, at least 10 user-scope queries, and explicit
hard-negative and organization-leakage cases. Latency is a hard gate only on a
pinned runner; shared CI reports it without failing the build.

## Engineering Closeout Gates

| Gate | Passing bar | Latest evidence | State |
| --- | --- | --- | --- |
| Focused UUID batch | All touched vector/store/compact/MCP behavior passes | 2026-08-31: 6 files, 449 tests passed | GREEN |
| Typecheck | `npm run typecheck` | Passed 2026-08-31 | GREEN |
| Build | `npm run build` | Passed 2026-08-31 | GREEN |
| Full test suite | No new failure; skips reported | 83 passed files, one skipped; 2,580 passed, 34 skipped | GREEN |
| Diff hygiene | `git diff --check` and staged review | Passed for `e8f9136` | GREEN |
| Dependency security | No unmitigated reachable critical/high advisory | `npm audit --audit-level=moderate`: 12 nodes total; lock refresh can reduce to one `sharp` high, but has not been applied | RED |
| Admin UI truth and accessibility | no-op/pending results are truthful; archive confirmation and keyboard/status basics pass | Static audit found unconditional Saved/Tagged/Archived messages and focus loss | RED |
| Backup/restore | Owned local backup, restore, and data/index smoke pass for the default backend | Not run in this goal | NOT RUN |
| Owned-resource cleanup | No test process, temporary container, volume, or fixture remains | Akasha-owned Qdrant/Postgres probes removed; unrelated Parallax processes left untouched | GREEN |
| Deployment and production | Explicit deploy, effective config/image, rollout, smoke, rollback, and operating evidence | No external deployment authorized or observed | EXTERNAL |

## Next Gate

Implement the smallest org-scoped default-stack retrieval harness by reusing the
existing service bootstrap. It must expose the current user-scope ranking failure
instead of weakening the answer key or thresholds.
