# BACKLOG

Prioritize in this order unless a core product capability materially changes
the value of Akasha: stability/bugs, testability, scalability, developer
experience, documentation, features.

## P0

- None currently known.

## P1

- None currently known.

## P2

- None currently known.

## Done In This Branch

- Goal-run close notes, scoped start/list behavior, schema validation, and docs.
- Sweeper tick/duration/row Prometheus metrics.
- Background queue backlog gauges with partial indexes.
- Dedicated background worker lifecycle and worker scripts.
- Operator guidance for dedicated worker metrics boundaries.
- Node runtime support moved from Node 20 to Node 22+, with CI on Node 22/24.
- Repo secret hygiene guard for tracked secret-shaped literals.
- Restore smoke Qdrant collection-name and uploaded-snapshot runbook alignment.
- Public docs index drift guard for tracked docs pages and English/Korean pairs.
- Transformers dependency docs/comments aligned with package metadata.
- Stale Transformers dynamic-import `@ts-ignore` removed.
- Architecture docs local embedding module filename drift fixed.
- Operations restore examples use Qdrant collection-name variables.
- Operations restore examples use host Qdrant curl path.
- In-range dependency lockfile/install updates refreshed.
- Static bearer-token comparison scans fixed-width digests across configured
  tokens.
- Sweeper interval env parsing requires plain decimal integer strings.
- Rate-limit env parsing and bucket capacity require positive integers.
- Compaction apply candidate IDs require positive safe decimal integers before
  run creation.
- Whitespace-only memory content is rejected before dispatch or persistence.
- Service config `PORT` and `EMBEDDING_DIMENSIONS` require plain decimal
  positive integer strings.
- Whitespace-only search queries and context-pack tasks are rejected before
  dispatch or retrieval work.
- Whitespace-only session-start prompt tasks are rejected before context-pack
  dispatch.
- Whitespace-only MCP resource path/search parameters are rejected before
  resource dispatch.
- Whitespace-only governance tag/query filters are rejected before repository
  dispatch.
- Whitespace-only required goal-run text is rejected before service or
  embedding dispatch.
- Blank optional goal-run notes normalize to `null` before persistence.
- Whitespace-only project/user scope identifiers are rejected before dispatch.
- Whitespace-only MCP prompt/context identifiers and sampled summaries are
  rejected before storage or dispatch.
- Whitespace-only organization IDs are rejected on MCP/direct paths, while
  HTTP rejects malformed non-string organization IDs before enrichment.
- Whitespace-only governance tag entries are rejected before tag update or
  vector refresh.
- Whitespace-only MCP context optional text is rejected before elicitation or
  sampling side effects.
- Invalid direct repeat-check thresholds are rejected before goal-run lookup or
  embedding work.
- Invalid direct retrieval limits are rejected before search/context-pack
  retrieval work.
- Invalid direct iteration memory links are rejected before iteration mutation.
- Invalid direct/public goal-run IDs are rejected before service dispatch.
- Invalid direct/public unarchive archive IDs are rejected before archive lookup.
- Invalid direct governance memory IDs are rejected before repository dispatch.
- Invalid direct audit log limits are rejected before audit repository dispatch.
- Invalid direct governance list and graph limits are rejected before repository
  dispatch.
- Invalid direct goal-context limits are rejected before goal-run lookup.
- Invalid direct compaction limits are rejected before repository dispatch.
- Invalid direct compaction thresholds are rejected before repository dispatch.
- Invalid public/direct memory importance values are rejected before repository
  dispatch.
- Invalid direct memory kind and durability updates are rejected before
  repository dispatch.
- Invalid direct goal-run enum values are rejected before service dispatch.
- HTTP goal-run enum validation is covered before registry dispatch.
- Invalid direct memory scope enum values are rejected before repository
  dispatch.
- Invalid direct graph entity-kind enum values are rejected before repository
  dispatch.
- Invalid direct add-memory kind enum values are rejected before repository
  dispatch.
- Invalid store-memory prompt kind enum values are rejected before prompt
  rendering.
- Blank direct update-memory title and summary patches normalize to `null`
  before repository dispatch.
- Blank repository update title and summary patches normalize to `null` before
  persistence.
- Invalid repository update kind, durability, and importance values are
  rejected before persistence.
- Invalid repository add kind, durability, and importance values are rejected
  before persistence.
- Secret-shaped repository add content, titles, and summaries are rejected
  before persistence.
- Blank repository add title and summary values normalize to `null` before
  persistence.
- Whitespace-only repository add organization IDs are rejected before
  persistence.
- Whitespace-only repository update organization IDs are rejected before
  persistence.
- Whitespace-only repository archive organization IDs are rejected before
  persistence.
- Whitespace-only repository delete organization IDs are rejected before
  persistence.
- Whitespace-only read organization IDs are rejected before repository or vector
  work, even with the legacy anonymous read flag enabled.
- Whitespace-only repository search organization IDs are rejected before
  persistence.
- Whitespace-only governance list organization IDs are rejected before
  persistence.
- Whitespace-only graph inspect organization IDs are rejected before
  persistence.
- Whitespace-only repository get-by-id organization IDs are rejected before
  persistence.
- Whitespace-only archive apply organization IDs are rejected before
  persistence.
- Whitespace-only archive run creation organization IDs are rejected before
  persistence.
- Whitespace-only archive lookup organization IDs are rejected before
  persistence.
- Whitespace-only archive restore organization IDs are rejected before
  persistence.
- Whitespace-only restored-record cleanup organization IDs are rejected before
  persistence.
- Whitespace-only recent apply-count organization IDs are rejected before
  persistence.
- Whitespace-only scope-lock organization IDs are rejected before persistence.
- Whitespace-only scope-lock key inputs are rejected before persistence.
- Whitespace-only compaction run scope inputs are rejected before persistence.
- Whitespace-only canonical chunk delete organization IDs are rejected before
  persistence.
- Whitespace-only canonical chunk list organization IDs are rejected before
  persistence.
- Whitespace-only context-pack run organization IDs are rejected before
  persistence.
- Whitespace-only canonical chunk insert organization IDs are rejected before
  persistence.
- Whitespace-only canonical chunk replacement organization IDs are rejected
  before transaction side effects.
- Whitespace-only canonical refresh organization IDs are rejected before
  indexing side effects.
- Whitespace-only canonical write-path organization IDs are rejected before
  ingest and indexing side effects.
- Whitespace-only canonical reindex organization IDs are rejected before
  indexing side effects.
- Whitespace-only audit repository organization IDs are rejected before
  persistence.
- Whitespace-only ingest job creation organization IDs are rejected before
  persistence.
- Whitespace-only vector organization filters are rejected before backend
  query/delete work, while exact empty-string legacy behavior remains covered.
- Whitespace-only vector point organization IDs are rejected before payload
  construction.
- Whitespace-only goal-run repository organization IDs are rejected before SQL
  or transaction side effects.
- Whitespace-only apply-compaction organization IDs are rejected before
  embedding, rate-limit, archive, or vector side effects.
