<!--
Thanks for the PR. Fill in the sections below to help reviewers.
For details on conventions and the dev environment, see CONTRIBUTING.md.
-->

## Summary

<!-- 1-2 sentences: what this PR changes and why. -->

## Linked issue

<!-- "Closes #123" / "Related to #456" / leave blank if N/A. -->

## Changes

<!-- Bulleted list of the user-visible / code-shape changes. -->

-

## Test plan

<!--
What did you test? Include commands run and observed outcomes. For
non-trivial changes, also include `npm run typecheck` + `npm test`
output.
-->

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (or expected skips noted)
- [ ] Manual test of the affected path

## Checklist

- [ ] Tests cover new code paths (unit + integration where applicable).
- [ ] Repository pattern preserved — no SQL outside the `createXRepository` factories.
- [ ] Migrations (if any) are idempotent and added to `MIGRATION_FILES` + the embedded snapshot.
- [ ] No new `any`; `unknown` narrowed at boundaries; no bare `catch (e)`.
- [ ] CHANGELOG.md `[Unreleased]` updated for user-visible changes (skip for internal refactors).
- [ ] Bilingual docs touched if user-visible (English + 한국어 versions stay in sync).

## Notes for reviewers

<!-- Anything specific you'd like extra eyes on. -->
