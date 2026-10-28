# GATES

Last updated: 2026-10-25 KST. Valid states are `GREEN`, `RED`, `NOT RUN`, and
`EXTERNAL`. A green local gate is not client, deployment, or production proof.

The current delivery scope is defined in `goal.md` from the user's implementation
and portfolio request. Public contracts, organization isolation, default-stack
behavior, required checks, and safe resource/data handling remain mandatory.
Client efficacy benchmarks retain their own thresholds and measured results;
neither a positive result for every hypothesis nor Claude execution is required
for this delivery. Claude remains unverified because the user does not use it.
This distinction does not turn a RED benchmark or an unresolved safety incident
GREEN. The scope correction is recorded in `DECISIONS.md`.

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
| Codex MCP A/B | Paired successful runs have median input-token reduction >= 15%, no success-rate loss, omission/leakage = 0 | fixed-SHA off/on harness, three tasks x three repeats | 2026-10-23 at `fe24b4d`, CLI 0.163.0, requested `gpt-6.1-sol` / medium: 18/18 successful, omission/leakage 0; median input-token reduction **0.35%**, below 15%. No new credit decline observed | RED |
| Supplemental Codex CLI-prefetch A/B | Same per-profile 15% bar; exact actual CLI pack and zero model tool calls | fresh nine-pair comparison, protocol below | 2026-10-23 at `d459e20`, same corpus v3, CLI 0.163.0 and requested model/effort: 18/18 correct, no omission/contradiction/leakage; median total input-token reduction **53.40%**. Nine fresh CLI receipts and 36 usage checks passed | GREEN |
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
from input tokens alone. The protocol was committed at `d459e20` before execution.

The complete run at that SHA passed all 18 answers with zero omissions,
contradictions, leakage, or model tool calls. Total input was 576,431 off and
269,369 on, with cached input of 19,200 and 66,816 respectively still included.
The independently recomputed median reduction was 53.3954%. All nine actual CLI
receipts retained required scoped memories; 36 before/after usage checks observed
no new credit decline. CLI events still omitted the observed model ID. CLI
process duration was 31.21–34.60 seconds (median 31.41), so this is not evidence
of lower end-to-end latency or total monetary cost.

An earlier attempt at the same SHA stopped after 11 successful conditions when
the laptop entered clamshell sleep during condition 12; that command timed out
and the subsequent usage query failed. The incomplete attempt and its failure
were retained. After a documented full wake and successful live usage query, a
new complete comparison used fresh pairs; no partial pair was reused. Neither
this supplemental pass nor the recovered execution changes the MCP or Claude gates.

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
| Typecheck | `npm run typecheck` | PR #37 final head `356ec10`: Node 22/24 CI passed with the patched dependency graph; local Node checks deferred for shared-host resource pressure | GREEN |
| Build | `npm run build` | PR #37 final head `356ec10`: Node 22/24 CI passed with the patched dependency graph | GREEN |
| CI full test suite | All required CI jobs pass; skips reported | PR #37 final head `356ec10`: [CI](https://github.com/YouSangSon/akasha/actions/runs/40113140656) passed all five jobs; Node 22/24 each 2669 passed, 35 skipped, PostgreSQL 246, pgvector 115, default retrieval 5. Each Node job passed 19 OpenAI adapter cases, including the three new real-SDK fake-fetch checks | GREEN |
| Historical local full suite | Retain the previous fixed-source result; do not reuse it for changed dependencies | Existing local Podman, Debian 12 arm64, Node 22.23.4: clean fixed checkout `e937ef7`, lockfile `npm ci`, typecheck/build/audit passed (0 vulnerabilities), then network detached. Previously failing seven cases passed; one full run passed 2667 with 35 expected DB/eval skips. The 2026-10-25 user request permits lightweight local checks only; no new local integration stack or full suite. Old Linux success is not a current dependency or macOS pass | GREEN |
| Diff hygiene | `git diff --check` and staged review | 2026-10-23 core diff passed; final UI diff checked separately before commit | GREEN |
| Dependency security | Required audit passes without an exception or forced peer override; actual reachability remains separately assessed | PR #37 final head `356ec10`: both Node 22/24 CI audit reports contain zero vulnerabilities with Zod 4.6.7, OpenAI 6.0.0 and body-parser 2.4.0. PR #36's earlier three-high failure is retained separately. No exception or forced peer override; not an OS-image vulnerability assessment | GREEN |
| Admin UI truth and accessibility | no-op/pending results are truthful; archive confirmation and keyboard/status basics pass | 2026-10-23 real admin + HTTP + owned PostgreSQL/Qdrant/transformers: auth, empty, invalid save, save/tag persistence, org/user isolation, controlled archive cancel/approve, reload, desktop/mobile passed. Archived Save exposed vector resurrection, now corrected and rechecked against DB/index snapshots; loading/no-op/pending proof comes from the separate fixture-backed checks. No screen-reader test | GREEN |
| Archived index maintenance | Observed archived records stay out of vector refresh, reindex, and pending ingest retries | Six new regression cases; four focused files, 310 tests passed. Actual UI Save/Tag, HTTP reindex/reactivation/rearchive/search, and a rearmed real ingest retry passed. Concurrent archive/index races remain outside this sequential fix | GREEN |
| Backup/restore | Owned local backup, restore, and data/index smoke pass for the default backend | 2026-10-23 owned run passed: Postgres dump + Qdrant snapshot, identical point ID/payload/vector, authenticated restored-app search + selected scoped ID/content in the context pack | GREEN |
| Previously verified local resource cleanup | Identified task-owned local resources are removed after ownership and use checks | Owned real-DB UI project `akasha-ui-db-20261023-1235` and its listener/UI resources were removed after ownership checks. Three failed-test directories were preserved privately then removed after open-handle checks. The subsequent Linux validator's exact container/bind mount and clean clone were verified, removed, and logs retained; the preexisting image/VM were preserved. This does not establish safety of the earlier deletion or remote VM cleanup | GREEN |
| Historical deletion incident follow-up | 사고 해결에는 정확한 소유권 또는 데이터 영향·필요한 복구 근거가 필요 | Earlier anonymous volume `d11530edf3ec7e875503f64d81a35dafc634cdee2509804cc83d02608ba51dab` was removed without an exact ownership receipt. Retained metadata and timestamp proximity do not prove ownership or absence of data loss. 2026-10-25 사용자는 이를 미확인 사고로 별도 보존하고 비-VM 제품 전달 후 Goal을 종료하도록 명시했다. 사고가 해결된 것은 아니다 | OPEN |
| Private VM follow-up | VM 접속 복구 후 원본 영수증·실행 버전·대표 동작·정리 확인 | 2026-10-25 사용자 요청으로 이번 완료 범위에서 보류. PR #36은 Draft로 보존한다. 이전 빌드 도중 접속이 끊겼고, 승인된 제공사 재시작 1회 후에도 SSH 연결이 시간 초과됐다. 빌드·실제 앱·원격 정리는 미확인으로 남긴다 | DEFERRED |
| Production operation | Explicit production scope, effective config/image, rollout, smoke, rollback, and operating evidence | 실서비스 운영은 검증하지 않았다. 개인 VM 구성의 CI 통과와 제공사 재시작 기록으로 운영 경험을 주장하지 않는다 | EXTERNAL |

## Next Gate

Implementation and evaluation changes are merged through
[PR #32](https://github.com/YouSangSon/akasha/pull/32) at `183433b`. Its archived-index
unit has local DB/UI evidence and five passing CI jobs at `b98c397`, whose tree
matches the merge. A subsequent fixed-checkout local Linux run passed all required
commands and 2667 tests; prior macOS timeout/cleanup failures remain recorded separately. The supplemental
CLI-prefetch run now passes its 15% bar, while the MCP baseline still fails it.
Preserve both results and the source audit above. Claude stays outside the current
delivery scope and unverified. 과거 삭제 사고의 해결에는 정확한 소유권 또는 영향·복구
근거가 여전히 필요하다. 사용자는 이 미확인 사고를 별도 후속으로 보존한 채
비-VM 제품 전달로 이번 Goal을 종료하도록 명시했다. 실패한 MCP 측정은 그대로
부정적인 결과로 유지한다.
2026-10-25 사용자는 VM 검증을 우선 건너뛰도록 명시했다. 따라서 현재 전달 범위는
구현·기존 검증·문서·포트폴리오이며 VM 성공을 완료 조건으로 요구하지 않는다.
미확인 원격 자원과 과거 삭제 기록은 보존한다. 유료 실행과 credential 변경은
승인 범위에 포함되지 않는다.

Historical client-preflight reproduction reference; rerun only in an authorized
environment matching the current shared-host policy. From a clean, committed checkout:
`AKASHA_EVAL_MODE=client-ab ./tests/eval/run-default-stack.sh`. It records the
exact HEAD, seeds an owned local database/collection, checks required scoped
context identities and a foreign-organization decoy, and does not call either
model client. Word estimates are not tokenizer measurements.


## 2026-10-26 Additional Contract Verification

| Gate | Scope | Evidence | State |
| --- | --- | --- | --- |
| Opt-in context-pack byte budget | Entire compact structured tool data fits `maxOutputBytes`; selected decisions/constraints and trust notice retained; no partial context-run record on failure; existing failure audit retained | 8 focused files, 316 cases across final affected-file recheck and unchanged passing files; typecheck passed. Includes native MCP, HTTP 400, CLI, exact UTF-8/escaping and persisted selection checks | GREEN |

This row describes local unit/in-memory contract evidence; PR #40's required five-job CI and main merge are recorded below.
No live provider, VM runtime, or new real-client token-saving result follows from this row.


### MCP 입력 비용 관측과 예산 변형의 범위

PR #40의 head `11fcdb9`는 [CI 40295261552](https://github.com/YouSangSon/akasha/actions/runs/40295261552)의
필수 5개 작업을 통과했고 main `2314ba3`과 tree가 같다. Node 22/24 각각 2696 통과·35 skip,
Postgres 246, pgvector 115, 기본 transformers/Qdrant 5개 통과, 의존성 감사 0건이다.

추가 계측은 단위를 분리한다. 아래 바이트 값은 관측 객체를 재직렬화한 UTF-8 크기이며,
원래 wire bytes나 전체 모델 프롬프트 토큰 기여도가 아니다. 서로 겹치는 값이므로 합산하지 않는다.

| 기록 | 의미 |
| --- | --- |
| `inputTokens`, `cachedInputTokens` | 클라이언트가 보고한 전체 턴 입력. Codex cached input은 input에 이미 포함되어 추가 합산하지 않는다. |
| `payloadBytes.argumentsJsonUtf8Bytes` | 관측된 도구 인자의 compact JSON 크기 |
| `payloadBytes.resultJsonUtf8Bytes` | 관측된 결과 객체의 compact JSON 크기 |
| `payloadBytes.structuredContentJsonUtf8Bytes` | structured data가 노출된 경우 그 JSON 크기 |
| `payloadBytes.textContentUtf8Bytes` | 관측된 text 블록 내용만의 UTF-8 크기 |
| `clientStdinUtf8Bytes` | 실행을 시도한 클라이언트 명령의 stdin 크기. 전역 지시·도구 스키마·이력 전체가 아니다. |
| `clientDurationMs` | 해당 클라이언트 명령 실행 시간. 도구 실행만의 지연이나 전체 제품 응답 시간이 아니다. 실패한 실행도 기록한다. |

preflight에는 기존 word estimate와 별도로 raw context, pack Markdown, 전체 structured data의 바이트를 기록한다.
모델 실행 전 필요한 seed ID·본문 anchor·조직 격리 검증은 유지한다.

MCP 프로필의 별도 예산 변형은 runner `--max-output-bytes 8192` 또는 기존 wrapper의
`AKASHA_CLIENT_AB_MAX_OUTPUT_BYTES=8192`로 명시한다. preflight·도구 인자·관측 응답·결과 영수증이
같은 예산을 유지해야 한다. 실제 응답의 compact data 크기와 예산 메타데이터도 검증하므로,
인자만 맞고 서버가 옵션을 무시한 실행은 통과하지 못한다. CLI-prefetch 프로필과의 혼용은 거부한다.
기존 유료 실행 금지·구독 허용량·크레딧 변화·실패 보존·원자적 결과 기록 조건은 그대로다.

새 스택이나 모델을 실행하지 않는 재현 명령은
`node node_modules/vitest/vitest.mjs run tests/eval/payload-metrics.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose`다.
여기서 같은 합성 기록의 기본 응답과 4096-byte 응답을 비교한다. 이는 in-memory native serialization 실험이며
실제 DB 검색·클라이언트 A/B·토큰 절감 결과가 아니다. 기존 실제 MCP 0.35% RED와 별도 CLI-prefetch 53.40% 결과는 유지한다.

계측 단위 PR #41은 head `89eacc0`의 [CI 40299154275](https://github.com/YouSangSon/akasha/actions/runs/40299154275)
필수 5개 작업을 통과했고 main `74dc5b8`과 tree가 같다. Node 22/24 각각 2711 통과·35 skip,
Postgres 246, pgvector 115, 기본 검색 5개 통과, 감사 0건이다. 같은 합성 입력의 비교는 두 Node 버전에서
structured JSON 70976→2477 bytes, 관측 native 결과 JSON 143769→6396 bytes로 재현됐다.
이 겹치는 크기를 합산하지 않으며 모델 토큰·실제 DB 검색·전체 프롬프트 절감 수치로 사용하지 않는다.

## 확장 검색 평가 프로토콜 v2

`tests/eval/fixtures/retrieval-corpus.ts`는 기존 14개 seed·20개 질문 파일을 SHA-256으로 보존하고
검색 전용 36개 seed·32개 질문을 추가한다. 총 50개 target 기록과 동일 내용의 다른 조직 기록 50개,
고유 질문 52개, 요청한 사용자의 실제 정답을 요구하는 질문 12개, 동일 범위의 유사 오답 대비 질문 12개다.
클라이언트 A/B의 14개 seed 계약은 바꾸지 않는다. 반복 3회는 156개 관측이며 고유 질문 수에 더하지 않는다.

측정 전 고정한 통과 기준은 전체 52개·기존 20개·추가 32개 각각 recall@5 ≥ 0.90,
MRR@5 ≥ 0.55, 사용자 recall@5 = 1, 조직/요청 범위 유출 = 0이다. 오답 대비가 있는 cohort는
`hardNegativeOrderingAt5 = 1`도 요구한다. 이 값은 top-5 안에 정답이 있고 명시한 오답보다 먼저 나와야 1이다.
정답 뒤의 관련 없는 기록을 모두 금지하는 지표는 아니다. 다른 사용자·프로젝트 기록은 순위 오답으로
사용하지 않고 별도 scope 유출로 검사한다. 집계 성공으로 기존 질문의 회귀를 가리지 않는다.

Beta의 후보 기록은 7개로 top-5보다 많다. 별도 격리 탐침은 Alice 시간대 질문을 Bob 범위로,
Beta 포트 질문을 Alpha 범위로 요청해 의미가 일치하는 금지 정답이 반환되지 않는지 확인한다.
이 두 탐침은 정답 recall 집계나 52개 질문 수에 합산하지 않는다.

새 50개 seed 안의 기존 20개 질문 결과는 과거 14개 seed 평가와 별도다. 영어 중심 합성 질문의
측정이며 다국어·실사용 분포·새 모델 토큰 절감을 입증하지 않는다. 같은 실제 검색 결과의 8192-byte
팩 검사도 도구 클라이언트 왕복이나 모델 실행은 아니다. 모든 반복의 누락·오답 순위·유출을 진단 로그에 남긴다.

검증 상태: 소스 `a6dc2e3`의 [CI 40336598356](https://github.com/YouSangSon/akasha/actions/runs/40336598356)
필수 5개 작업 통과. Node 22/24 각각 2728 통과·36 skip, typecheck/build/audit 0건,
Postgres 246, pgvector 115, 실제 기본 검색 6개 통과. 기본 Node 작업의 추가 skip은 별도 기본 검색 작업에서
실행한 격리 탐침이다. 로컬 전체 스택/Node 검사는 공유 호스트 자원 압박으로 실행하지 않았다.
독립 검토는 두 source head에서 차단 결함 없이 완료했다.

| cohort (50개 target seed) | 고유 질문/관측 | recall@5 | MRR@5 | 사용자 recall@5 | 오답 순위 | 조직/scope 유출 |
| --- | --- | --- | --- | --- | --- | --- |
| 전체 | 52/156 | 1.00 | 0.800962 | 1.00 | 1.00 | 0/0 |
| 기존 질문 | 20/60 | 1.00 | 0.797500 | 1.00 | 해당 없음 | 0/0 |
| 추가 질문 | 32/96 | 1.00 | 0.803125 | 1.00 | 1.00 | 0/0 |

두 불일치 격리 탐침도 각각 허용 결과 5개·금지 정답 회수 0·조직/scope 유출 0으로 통과했다.
warm p50 21.00 ms, p95 28.74 ms는 이 CI의 관측값이며 성능 개선 비교가 아니다.
실제 검색 결과 팩은 기본 6966 bytes, 8192-byte 예산 결과 7016 bytes였다. 원래 결과가 충분히 작아
선택을 줄이지 않았고 예산 메타데이터 50 bytes가 추가됐다. 예산 준수 GREEN이며 절감의 증거는 아니다.
질문/정답/통과 기준을 바꾸지 않고 Beta 방해 기록·격리 탐침만 보강했다. 이전 47-seed head의 결과도
기존 CI 40336221187에 보존하며 최종 50-seed 결과와 섞지 않는다.

<a id="multilingual-retrieval-v3"></a>
## 2026-10-28 — Multilingual retrieval v3 (#43 part 3)

기존 52개 질문은 보존하고, 16개 기록과 18개 질문을 추가했다. 총 66개 target seed와
동일 내용의 타 조직 mirror 66개, 질문 70개×3회=210회 관측이다. 새 질문은 KO/JA/ZH
같은 언어 검색과 EN↔KO/JA/ZH의 9방향이다. 방향마다 질문 2개이며 정답 사실 8개를
번역·재사용하므로 54회 관측을 독립된 54개 사례로 해석하지 않는다.

측정 전 고정한 qualification은 **각 방향 recall@5=1, MRR@5≥0.75,
유사 오답보다 정답을 먼저 배치=1**, 전체 조직/scope 유출=0이다. 이 기준과
정답은 바꾸지 않았다. 아래 값은 새 18개 질문만의 결과다.

| ONNX 모델 | 차원 | recall@5 | MRR@5 | 유사 오답 순위 | 엄격 qualification |
| --- | --- | --- | --- | --- | --- |
| all-MiniLM-L6-v2 (기본) | 384 | 0.500000 | 0.381481 | 0.500000 | RED |
| paraphrase-multilingual-MiniLM-L12-v2 | 384 | 1.000000 | 0.944444 | 0.888889 | RED |
| paraphrase-multilingual-mpnet-base-v2 | 768 | 1.000000 | 0.972222 | 0.944444 | RED |
| multilingual-e5-small (query/passage 형식 실험) | 384 | 0.944444 | 0.668519 | 0.944444 | RED |

기본 모델은 같은 언어 6개는 모두 1위였지만 교차 언어 12개 중 3개만 top5에 찾았다.
MPNet은 18개 모두 top5에 찾았고 17개는 1위였다. 중국어 `m17`은 감사 파일을 청구
파일보다 먼저 반환했다. raw vector 점수도 0.534528/0.532394여서 최종 정렬만의
오류가 아니다. 모든 후보에서 기존 20개·추가 32개 gate와 조직/scope 유출 0은 유지했다.

근거: 기본·multilingual MiniLM은 source `4a4cf55`, [CI115](https://github.com/YouSangSon/akasha/actions/runs/40665985632);
MPNet과 raw vector 진단은 `3066bf5`, [CI116](https://github.com/YouSangSon/akasha/actions/runs/40666756063);
E5는 `2ccda80`, [CI117](https://github.com/YouSangSon/akasha/actions/runs/40668983093).
이 세 CI의 실패 결과를 보존한다. E5의 query 형식 대칭 비교에서는 다른 사실 8쌍
모두가 기존 반복 판정 0.85를 넘었다(0.8854–0.9383). 0.95를 넘은 쌍은 없지만
이 표본만으로 의미 중복 정리를 검증했다고 주장하지 않는다. E5 구현은 채택하지 않았다.

현재 제공 범위는 기본 모델 유지, 한계가 명시된 MPNet 실험 설정, 방향별 평가다.
필수 CI는 기존 52개 제품 회귀 기준과 전체 유출 검사를 유지하고, 새 방향의 qualification을
명시적인 RED/GREEN 데이터로 출력한다. **CI 통과는 다국어 qualification 통과가 아니다.**
수동으로 `EVAL_REQUIRE_MULTILINGUAL=1`을 주면 같은 엄격 기준을 실패 gate로 실행할 수 있다.
추가 모델 교체나 정답/임계값 조정으로 이번 실패를 숨기지 않는다. 의미 중복 정리·반복
자동화의 모델별 임계값 조정은 별도 검증이 필요하다.
