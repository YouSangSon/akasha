# Task 3 Report: Retrieval Scoring Foundation

## Summary

- Task: Add internal retrieval scoring candidates for future hybrid search.
- Base context: Task 1 `4c7364a`, Task 2 `f817fa3`.
- Scope followed:
  - `src/search/scored-candidate.ts`
  - `src/search/rank-results.ts`
  - `src/search/retrieve-memory.ts`
  - `tests/search/rank-results.test.ts`
  - `tests/search/retrieve-memory.test.ts`
- Public shape preserved: `rankResults` and `retrieveMemory` still return `SearchMemoryResult[]`.

## RED

Command:

```bash
npm test -- tests/search/rank-results.test.ts tests/search/retrieve-memory.test.ts
```

Result:

- FAIL as expected.
- `tests/search/rank-results.test.ts`: 2 failures.
- Failure reasons:
  - `scoreSearchResult` was not exported.
  - `buildRetrievedMemoryCandidate` was not exported.
- Note: the new retrieve-memory fixture did not independently fail during RED because its higher vector score also used the higher id, matching the existing tie-break order. The focused suite still failed before implementation due to the missing internal scoring API.

## GREEN

Command:

```bash
npm test -- tests/search/rank-results.test.ts tests/search/retrieve-memory.test.ts
```

Result:

- PASS.
- 2 test files passed.
- 11 tests passed.

## Typecheck

Command:

```bash
npm run typecheck
```

Result:

- PASS.
- `tsc --noEmit` completed without errors.

## Changed Files

- Added `src/search/scored-candidate.ts` with `CandidateSource` and `RetrievedMemoryCandidate`.
- Replaced `src/search/rank-results.ts` with scored candidate helpers:
  - `rankCandidates`
  - `buildRetrievedMemoryCandidate`
  - `scoreSearchResult`
  - `newestUpdatedAtFor`
  - preserved `rankResults`.
- Updated `src/search/retrieve-memory.ts` to preserve vector hit scores and rank hydrated records via candidates.
- Added brief-specified tests in `tests/search/rank-results.test.ts`.
- Added brief-specified vector propagation test in `tests/search/retrieve-memory.test.ts`.

## Self-Review

- Verified the implementation keeps scoring internal and does not add score fields to public `search_memory` results.
- Verified `rankResults` keeps the legacy public response shape while delegating to candidate ranking.
- Verified `retrieveMemory` carries max vector score per memory record id across duplicated chunk hits.
- Checked the diff with `git diff --check`; no whitespace errors.
- No unrelated files were staged for the implementation commit.

## Concerns

- None for implementation.

---

## Task 3 Review Fix: Vector Score Tie-Break Proof

### Reviewer Finding Addressed

- Fixed the vector-ordering coverage so the higher vector score belongs to the lower record id in both direct `rankCandidates` coverage and `retrieveMemory` hydrated-record coverage.
- This proves vector scores affect ordering because the fallback tie-break sorts by descending id.

### Tests

Command:

```bash
npm test -- tests/search/rank-results.test.ts tests/search/retrieve-memory.test.ts
```

Result:

- PASS.
- 2 test files passed.
- 11 tests passed.

### Typecheck

- Not run; no TypeScript types changed.

### Files Changed

- `tests/search/rank-results.test.ts`
- `tests/search/retrieve-memory.test.ts`
- `.superpowers/sdd/task-3-report.md`
