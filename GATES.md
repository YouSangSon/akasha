# GATES

Last updated: 2026-10-23 KST. Valid states are `GREEN`, `RED`, `NOT RUN`, and
`EXTERNAL`. A green local gate is not client, deployment, or production proof.

## Product And Contract Gates

| Gate | Passing bar | Reproducible check | Current evidence | State |
| --- | --- | --- | --- | --- |
| Public contract and organization isolation | 20 service tools, three MCP-only tools, envelopes, auth precedence, and org filters remain characterized | `npm test -- tests/mcp tests/app tests/store tests/vector --reporter=dot` plus full suite | PR #26 (`2fd9814`): Node 22/24, PostgreSQL, pgvector, and default retrieval CI passed; merged as `5e7770f`. UI changes remain outside that merge | GREEN |
| Cross-backend point identity | Every positive safe chunk ID maps injectively to a Qdrant-compatible ID; all write/recovery paths share it | focused vector/store/compact/MCP tests and real Qdrant smoke | Commit `e8f9136`; six focused files, 449 tests passed; Qdrant 1.13.2 accepted the UUID form in an owned local smoke | GREEN |
| Default stack flow | Pinned Postgres + Qdrant 1.13.2 + transformers completes org-scoped write, search, and context pack from one checked-in command | `./tests/eval/run-default-stack.sh` | 2026-10-22 local run: real write/search/context-pack passed; scoped containers and volumes removed | GREEN |
| Default retrieval quality | At `k=5`: recall >= 0.90, MRR >= 0.55, user-scope recall = 1.00, cross-org leakage = 0 | pinned default-stack eval after warm-up | 2026-10-22 Qdrant 1.13.2 + transformers 4.3.1, 20 unique queries x 3 repeats (60 samples): recall 1.00, MRR 0.7267, user recall 1.00, leakage 0, misses 0 | GREEN |
| Warm retrieval latency | On the pinned local runner after warm-up: p50 <= 100 ms and p95 <= 250 ms; cold start reported separately | same eval, at least 60 measured queries | 2026-10-22 local run, 60 samples: p50 17.89 ms, p95 72.89 ms, max 143.18 ms; latency enforcement disabled on this shared host | GREEN |
| Free client preflight | Fixed clean SHA, exact required scoped seed identities, no foreign-organization leakage | `AKASHA_EVAL_MODE=client-ab ./tests/eval/run-default-stack.sh` | 2026-10-23 at `fab19fe`, corpus v3: 82 seeded records, all 3 tasks retained required seeds/anchors, leakage 0; no model client called | GREEN |
| Context value | Required-decision omission = 0 and context-pack tokenizer count is lower than the defined raw/baseline context | context-pack fixture plus tokenizer report | Free corpus-v3 preflight: 19225 raw words versus 1696–1811 pack words, with required seeds retained. Word estimates do not prove tokenizer or real-client savings | RED |
| Codex A/B | Paired successful runs have median input-token reduction >= 15%, no success-rate loss, omission/leakage = 0 | fixed-SHA off/on harness, three tasks x three repeats | Local harness implemented; actual Codex CLI execution fails closed because no documented hard token cap is enforceable. No paid run | EXTERNAL |
| Claude A/B | Same per-client bar as Codex; never combine vendor token counts | fixed-SHA off/on harness, three tasks x three repeats | Local harness implemented; no paid run authorized. Claude budget flag is a per-call soft threshold, not a total hard cap | EXTERNAL |

The retrieval thresholds are regression-smoke minima anchored to the existing
20-query result, not evidence of broad product quality. A publishable product
claim requires at least 50 queries, at least 10 user-scope queries, and explicit
hard-negative and organization-leakage cases. Latency is a hard gate only on a
pinned runner; shared CI reports it without failing the build.

## Engineering Closeout Gates

| Gate | Passing bar | Latest evidence | State |
| --- | --- | --- | --- |
| Focused UUID batch | All touched vector/store/compact/MCP behavior passes | 2026-08-31: 6 files, 449 tests passed | GREEN |
| Focused retrieval batch | Shared ranking, cutoff, eval safety, and real default stack pass | 2026-08-31: 3 focused files, 67 passed and 2 eval tests skipped; real eval 4/4 passed | GREEN |
| Typecheck | `npm run typecheck` | 2026-10-23 passed on Node 24.14.0 | GREEN |
| Build | `npm run build` | 2026-10-23 passed in the successful owned restore run | GREEN |
| Full test suite | No new failure; skips reported | PR #26 final CI: Node 22/24 each 2625 passed, 35 skipped; separate PostgreSQL 246, pgvector 115, default retrieval 5 passed. Earlier local 2628 included the three unmerged UI assertions | GREEN |
| Diff hygiene | `git diff --check` and staged review | 2026-10-23 core diff passed; final UI diff checked separately before commit | GREEN |
| Dependency security | No unmitigated reachable critical/high advisory | PR #25: native npm audit reports 0 vulnerabilities, no exception policy. This is not an OS-image vulnerability assessment | GREEN |
| Admin UI truth and accessibility | no-op/pending results are truthful; archive confirmation and keyboard/status basics pass | 2026-10-23 real shell/HTTP + in-memory fixture: auth/error/loading/empty, save/tag success + no-op, native archive cancellation/approval, pending cleanup, archive no-op, selection retention and focus fallback passed. Desktop and 390x844 mobile visually inspected; no horizontal overflow. Archived detail shows archived with durability/archive controls disabled. No database E2E or screen-reader test; integration evidence belongs to PR #27 | GREEN |
| Backup/restore | Owned local backup, restore, and data/index smoke pass for the default backend | 2026-10-23 owned run passed: Postgres dump + Qdrant snapshot, identical point ID/payload/vector, authenticated restored-app search + selected scoped ID/content in the context pack | GREEN |
| Owned-resource cleanup | No test process, temporary container, volume, or fixture remains | 2026-10-23 restore projects `15810` have no remaining containers, volumes, or networks. One earlier anonymous-volume deletion lacked conclusive ownership evidence; its impact remains unknown | RED |
| Deployment and production | Explicit deploy, effective config/image, rollout, smoke, rollback, and operating evidence | No external deployment authorized or observed | EXTERNAL |

## Next Gate

Core changes are merged in PR #26. Browser validation is complete within the
local fixture boundary; PR #27 owns UI integration evidence. Real client
token reduction and task-success claims remain external;
paid execution, credential changes, and deployment are not authorized.

Free client preflight: from a clean, committed checkout, run
`AKASHA_EVAL_MODE=client-ab ./tests/eval/run-default-stack.sh`. It records the
exact HEAD, seeds an owned local database/collection, checks required scoped
context identities and a foreign-organization decoy, and does not call either
model client. Word estimates are not tokenizer measurements.
