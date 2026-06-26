import {
  newestUpdatedAtFor,
  rankCandidates,
  scoreSearchResult,
} from "./rank-results.js";
import { scoreLexicalMatch } from "./lexical-score.js";
import type { ScopeRef, SearchMemoryInput, SearchMemoryResult } from "../types.js";
import { assertOrganizationId } from "../store/assert-organization-id.js";
import type { VectorFilter, VectorHit, VectorIndex } from "../vector/vector-index.js";

export type RetrieveMemoryInput = {
  vectorIndex: VectorIndex;
  repository: {
    searchMemory?(input: SearchMemoryInput): Promise<SearchMemoryResult[]>;
    getMemoryRecordsByIds(
      ids: number[],
      organizationId?: string,
      allowLegacyAnonymous?: boolean,
    ): Promise<SearchMemoryResult[]>;
  };
  vector: number[];
  query?: string;
  organizationId?: string;
  // Escape hatch for the documented legacy single-tenant behavior. When
  // organizationId is undefined and this flag is not set, retrieveMemory
  // throws — silent cross-org reads are too easy a footgun once the
  // operator adds a second tenant later. Production wiring sets this
  // from `LEGACY_ANONYMOUS_SEARCH=true` only when the operator explicitly
  // opts in.
  allowLegacyAnonymous?: boolean;
  projectKey: string;
  userScopeId?: string;
  limit: number;
};

export async function retrieveMemory(
  input: RetrieveMemoryInput,
): Promise<SearchMemoryResult[]> {
  assertOrganizationId(input.organizationId, input.allowLegacyAnonymous, "retrieveMemory");

  const organizationId = input.organizationId ?? "";
  const scopes = retrievalScopes(input);
  const lexicalLimit = Math.max(input.limit * 4, input.limit);

  const [projectVectorHits, userVectorHits, lexicalRecords] = await Promise.all([
    queryScope(input, organizationId, scopes[0]!, input.projectKey),
    input.userScopeId
      ? queryScope(input, organizationId, scopes[1]!, null)
      : Promise.resolve([]),
    queryLexicalCandidates(input, scopes, lexicalLimit),
  ]);

  const hits = [...projectVectorHits, ...userVectorHits];
  const ids = uniqueMemoryRecordIds(hits);

  // Pass organizationId so the PG hydration filters by org even if Qdrant
  // returned a cross-org point id. Defense-in-depth: vector index filters
  // already include org, but a misconfigured filter would otherwise hydrate
  // the leak. Forward allowLegacyAnonymous so the repository guard (which
  // mirrors the guard above) does not re-throw when an operator has opted
  // into the legacy single-tenant mode via LEGACY_ANONYMOUS_SEARCH=true.
  const hydratedRecords =
    ids.length === 0
      ? []
      : await input.repository.getMemoryRecordsByIds(
          ids,
          input.organizationId,
          input.allowLegacyAnonymous,
        );

  const recordsById = new Map<number, SearchMemoryResult>();
  for (const record of [...hydratedRecords, ...lexicalRecords]) {
    recordsById.set(record.id, record);
  }

  if (recordsById.size === 0) {
    return [];
  }

  const vectorScores = maxVectorScoresByRecordId(hits);
  const vectorRanks = rankMap(
    [...vectorScores.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([id]) => id),
  );
  const lexicalScores = scoreLexicalRecords(input.query, lexicalRecords);
  const lexicalRanks = rankMap(lexicalScores.keys());
  const newestUpdatedAt = newestUpdatedAtFor([...recordsById.values()]);

  return rankCandidates(
    [...recordsById.values()].map((record) =>
      scoreSearchResult(record, {
        newestUpdatedAt,
        source: candidateSource(
          vectorScores.has(record.id),
          lexicalScores.has(record.id),
        ),
        vectorScore: fusedSourceScore(
          vectorScores.get(record.id),
          vectorRanks.get(record.id),
        ),
        lexicalScore: fusedSourceScore(
          lexicalScores.get(record.id),
          lexicalRanks.get(record.id),
        ),
      }),
    ),
  )
    .map((candidate) => candidate.record)
    .slice(0, input.limit);
}

function retrievalScopes(input: RetrieveMemoryInput): ScopeRef[] {
  return [
    { scopeType: "project", scopeId: input.projectKey },
    ...(input.userScopeId
      ? [{ scopeType: "user" as const, scopeId: input.userScopeId }]
      : []),
  ];
}

async function queryLexicalCandidates(
  input: RetrieveMemoryInput,
  scopes: ScopeRef[],
  limit: number,
): Promise<SearchMemoryResult[]> {
  if (!input.query || !input.repository.searchMemory) {
    return [];
  }

  return input.repository.searchMemory({
    query: input.query,
    scopes,
    organizationId: input.organizationId,
    limit,
  });
}

function queryScope(
  input: RetrieveMemoryInput,
  organizationId: string,
  scope: { scopeType: string; scopeId: string },
  projectKey: string | null,
): Promise<VectorHit[]> {
  const filter: VectorFilter = {
    organizationId,
    scopes: [scope],
    projectKey,
  };
  return input.vectorIndex.query(input.vector, filter, input.limit);
}

function uniqueMemoryRecordIds(hits: VectorHit[]): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();

  for (const hit of hits) {
    const id = hit.payload?.memory_record_id;

    if (typeof id !== "number" || seen.has(id)) {
      continue;
    }

    seen.add(id);
    ids.push(id);
  }

  return ids;
}

function maxVectorScoresByRecordId(hits: VectorHit[]): Map<number, number> {
  const scores = new Map<number, number>();

  for (const hit of hits) {
    const id = hit.payload?.memory_record_id;
    if (typeof id !== "number") {
      continue;
    }

    const existing = scores.get(id);
    if (existing === undefined || hit.score > existing) {
      scores.set(id, hit.score);
    }
  }

  return scores;
}

function scoreLexicalRecords(
  query: string | undefined,
  records: readonly SearchMemoryResult[],
): Map<number, number> {
  const scores = new Map<number, number>();
  if (!query) {
    return scores;
  }

  for (const record of records) {
    const match = scoreLexicalMatch(query, record);
    if (match.score > 0) {
      scores.set(record.id, match.score);
    }
  }

  return new Map(
    [...scores.entries()].sort((left, right) => right[1] - left[1]),
  );
}

function rankMap(ids: Iterable<number>): Map<number, number> {
  const ranks = new Map<number, number>();
  let rank = 1;

  for (const id of ids) {
    ranks.set(id, rank);
    rank += 1;
  }

  return ranks;
}

function fusedSourceScore(
  rawScore: number | undefined,
  rank: number | undefined,
): number | undefined {
  if (rawScore === undefined || rank === undefined) {
    return undefined;
  }

  return clampUnit(rawScore) * reciprocalRankBoost(rank);
}

function reciprocalRankBoost(rank: number): number {
  const k = 60;
  return (k + 1) / (k + rank);
}

function candidateSource(hasVector: boolean, hasLexical: boolean) {
  if (hasVector && hasLexical) {
    return "hybrid";
  }

  return hasLexical ? "lexical" : "vector";
}

function clampUnit(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.min(1, Math.max(0, score));
}
