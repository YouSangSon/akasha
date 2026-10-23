# GATES

Last updated: 2026-10-23 KST. Valid states are `GREEN`, `RED`, `NOT RUN`, and
`EXTERNAL`. A green local gate is not client, deployment, or production proof.

## Product And Contract Gates

| Gate | Passing bar | Reproducible check | Current evidence | State |
| --- | --- | --- | --- | --- |
| Public contract and organization isolation | 20 service tools, three MCP-only tools, envelopes, auth precedence, and org filters remain characterized | `npm test -- tests/mcp tests/app tests/store tests/vector --reporter=dot` plus full suite | PR #28 (`abd64a4`): all five CI jobs passed; implementation is merged as `61534fc` | GREEN |
| Cross-backend point identity | Every positive safe chunk ID maps injectively to a Qdrant-compatible ID; all write/recovery paths share it | focused vector/store/compact/MCP tests and real Qdrant smoke | Commit `e8f9136`; six focused files, 449 tests passed; Qdrant 1.13.2 accepted the UUID form in an owned local smoke | GREEN |
| Default stack flow | Pinned Postgres + Qdrant 1.13.2 + transformers completes org-scoped write, search, and context pack from one checked-in command | `./tests/eval/run-default-stack.sh` | 2026-10-22 local run: real write/search/context-pack passed; scoped containers and volumes removed | GREEN |
| Default retrieval quality | At `k=5`: recall >= 0.90, MRR >= 0.55, user-scope recall = 1.00, cross-org leakage = 0 | pinned default-stack eval after warm-up | 2026-10-22 Qdrant 1.13.2 + transformers 4.3.1, 20 unique queries x 3 repeats (60 samples): recall 1.00, MRR 0.7267, user recall 1.00, leakage 0, misses 0 | GREEN |
| Warm retrieval latency | On the pinned local runner after warm-up: p50 <= 100 ms and p95 <= 250 ms; cold start reported separately | same eval, at least 60 measured queries | 2026-10-22 local run, 60 samples: p50 17.89 ms, p95 72.89 ms, max 143.18 ms; latency enforcement disabled on this shared host | GREEN |
| Free client preflight | Fixed clean SHA, exact required scoped seed identities, no foreign-organization leakage | `AKASHA_EVAL_MODE=client-ab ./tests/eval/run-default-stack.sh` | 2026-10-23 at `fab19fe`, corpus v3: 82 seeded records, all 3 tasks retained required seeds/anchors, leakage 0; no model client called | GREEN |
| Context value | Required-decision omission = 0 and context-pack tokenizer count is lower than the defined raw/baseline context | context-pack fixture plus tokenizer report | Required seeds retained in corpus-v3 preflight; real Codex on/off succeeds but median total input-token reduction is only 0.35%, below the product bar | RED |
| Codex A/B | Paired successful runs have median input-token reduction >= 15%, no success-rate loss, omission/leakage = 0 | fixed-SHA off/on harness, three tasks x three repeats | 2026-10-23 at `fe24b4d`, CLI 0.163.0, requested `gpt-6.1-sol` / medium: 18/18 successful, omission/leakage 0; median input-token reduction **0.35%**, below 15%. No new credit decline observed | RED |
| Claude A/B | Same per-client bar as Codex; never combine vendor token counts | fixed-SHA off/on harness, three tasks x three repeats | No actual run: the user does not yet use Claude Code; local CLI is not logged in. Paid/API execution is not authorized | EXTERNAL |

For an explicitly authorized Codex subscription evaluation on a clean commit:

```sh
AKASHA_EVAL_MODE=client-ab AKASHA_CLIENT_AB_EXECUTE_SUBSCRIPTION=1 \
AKASHA_CLIENT_AB_CLIENT=codex AKASHA_CLIENT_AB_MODEL=gpt-6.1-sol \
AKASHA_CLIENT_AB_EFFORT=medium AKASHA_CLIENT_AB_RESULT_DIR=artifacts/client-ab-subscription \
./tests/eval/run-default-stack.sh
```

This path uses the existing file-backed ChatGPT login, never forwards API keys,
and pins the auth store/service URL for both the account query and model client.
It requires live included-usage permission and weekly remaining usage above 1%;
unavailable usage, exhausted limits, or a new credit decline stops further calls.
The credit baseline starts with this run, not a historical balance. Checks run
before and after every call, including failures; finished condition evidence is
retained without a successful run summary when a stop condition occurs. These
observations do not guarantee billing prevention. The evaluation process exits
nonzero when the paired-results gate fails, while retaining the measured summary. Claude subscription execution
is not implemented; the existing paid mode still requires separate authorization.
Only the authorized `build_context_pack` tool is exposed and preapproved for the
disposable local evaluation database; its context-run record write is preserved.
The protocol is verified against Codex CLI 0.163.0 and its generated account types;
see the official [account API](https://learn.chatgpt.com/docs/app-server) and
[authentication settings](https://learn.chatgpt.com/docs/auth).

The completed Codex run used nine pairs across three tasks. Total input tokens
were 576,427 off and 573,546 on; on-side cached input was 242,048 tokens and
remains included in the input totals. CLI events did not report the observed
model, so the receipt records the requested model and leaves observed model null.
This is a negative token-savings result, not a passing product-value claim.
A read-only audit of CLI 0.163.0 confirms that `--ignore-user-config` leaves an
empty User configuration layer, from which global skill roots are still derived;
the app-server separately installs the global AGENTS provider. `--ignore-rules`
only excludes execpolicy `.rules` files. The temporary working directory therefore
does not make this a global-instruction-free benchmark. Sources: [configuration
loader](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/config/src/loader/mod.rs#L520-L528),
[skill roots](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/ext/skills/src/host_roots.rs#L95-L116),
and [global instructions](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/app-server/src/message_processor.rs#L370-L372).

The [direct MCP adapter](https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/protocol/src/models.rs#L2414-L2448)
prefers non-null `structuredContent` and serializes it compactly for this JSON-only
tool result. It does not append the equivalent text content too. Minifying the
text fallback would therefore not reduce this Codex input. The structured result
itself includes Markdown plus section records, as required by the existing public
contract. Exact per-request prompt contributions were not captured, so neither
host instructions nor result redundancy is proven to dominate the measured cost.
Do not remove user instructions or public response fields to manufacture a pass;
retain this host-profile baseline and require a concrete hypothesis before another
model run.

### Supplemental CLI-prefetch protocol

The existing `pack` CLI can supply `packMarkdown` to a new agent prompt, as in
the README's context-pack workflow. The hypothesis is that retrieving before
the model turn avoids the model-initiated MCP round trip while retaining the
same required context. This is a separate `cli-prefetch` profile; it cannot
replace the failed `mcp-roundtrip` baseline or satisfy the missing Claude gate.

Before measuring, pin a clean commit and keep corpus v3, the three tasks,
grading, model/effort, global instructions, and subscription guards unchanged.
For each of nine fresh off/on pairs, run the actual CLI with explicit org,
project, task, and user scope. Require exactly one matching DB receipt after
the pre-call cursor and byte-identical stdout (apart from `console.log`'s last
LF); independently check selected IDs, required seeds, and content anchors.
Off receives the full raw corpus; on receives that exact CLI pack. Neither side
connects MCP, and both must report zero tool calls. Record all 18 outcomes,
profile, nine receipt IDs/pack hashes/CLI durations, and total input tokens
including cached input. Retain failures without retries or discarded pairs.
The per-profile threshold remains 15%; no overall cost or latency claim follows
from input tokens alone. No result has been measured for this profile yet.

Select this profile by adding `AKASHA_CLIENT_AB_PROFILE=cli-prefetch` to the
authorized subscription command above and use a new result directory.

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
| Full test suite | No new failure; skips reported | PR #28 final CI at `abd64a4`: Node 22/24 each 2637 passed, 35 skipped; PostgreSQL 246, pgvector 115, default retrieval 5 passed. [Run](https://github.com/YouSangSon/akasha/actions/runs/39909684034) | GREEN |
| Diff hygiene | `git diff --check` and staged review | 2026-10-23 core diff passed; final UI diff checked separately before commit | GREEN |
| Dependency security | No unmitigated reachable critical/high advisory | PR #25: native npm audit reports 0 vulnerabilities, no exception policy. This is not an OS-image vulnerability assessment | GREEN |
| Admin UI truth and accessibility | no-op/pending results are truthful; archive confirmation and keyboard/status basics pass | 2026-10-23 real shell/HTTP + in-memory fixture: auth/error/loading/empty, save/tag success + no-op, native archive cancellation/approval, pending cleanup, archive no-op, selection retention and focus fallback passed. Desktop and 390x844 mobile visually inspected; no horizontal overflow. Archived detail shows archived with durability/archive controls disabled. No database E2E or screen-reader test; integration evidence belongs to PR #27 | GREEN |
| Backup/restore | Owned local backup, restore, and data/index smoke pass for the default backend | 2026-10-23 owned run passed: Postgres dump + Qdrant snapshot, identical point ID/payload/vector, authenticated restored-app search + selected scoped ID/content in the context pack | GREEN |
| Owned-resource cleanup | No test process, temporary container, volume, or fixture remains | 2026-10-23 restore projects `15810` have no remaining containers, volumes, or networks. One earlier anonymous-volume deletion lacked conclusive ownership evidence; its impact remains unknown | RED |
| Deployment and production | Explicit deploy, effective config/image, rollout, smoke, rollback, and operating evidence | No external deployment authorized or observed | EXTERNAL |

## Next Gate

Implementation and evaluation changes are merged through PR #28. Codex's actual task-success
checks pass, but its measured input-token reduction fails the 15% bar. Preserve
that baseline and the source audit above. The user does not yet use Claude Code,
so its proof remains external to this completed evaluation unit. The original
product goal is still unmet; do not mark it complete or lower its passing bar
without a scope decision. Paid execution, credential
changes, and deployment are not authorized.

Free client preflight: from a clean, committed checkout, run
`AKASHA_EVAL_MODE=client-ab ./tests/eval/run-default-stack.sh`. It records the
exact HEAD, seeds an owned local database/collection, checks required scoped
context identities and a foreign-organization decoy, and does not call either
model client. Word estimates are not tokenizer measurements.
