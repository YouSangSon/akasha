import {
  newestUpdatedAtFor,
  rankCandidates,
  scoreSearchResult,
} from "./rank-results.js";
import type { SearchMemoryResult } from "../types.js";
import { assertOrganizationId } from "../store/assert-organization-id.js";
import type { VectorFilter, VectorHit, VectorIndex } from "../vector/vector-index.js";

export type RetrieveMemoryInput = {
  vectorIndex: VectorIndex;
  repository: {
    getMemoryRecordsByIds(
      ids: number[],
      organizationId?: string,
      allowLegacyAnonymous?: boolean,
    ): Promise<SearchMemoryResult[]>;
  };
  vector: number[];
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

  const responses = await Promise.all([
    queryScope(input, organizationId, { scopeType: "project", scopeId: input.projectKey }, input.projectKey),
    ...(input.userScopeId
      ? [
          queryScope(input, organizationId, { scopeType: "user", scopeId: input.userScopeId }, null),
        ]
      : []),
  ]);

  const hits = responses.flat();
  const ids = uniqueMemoryRecordIds(hits);

  if (ids.length === 0) {
    return [];
  }

  // Pass organizationId so the PG hydration filters by org even if Qdrant
  // returned a cross-org point id. Defense-in-depth: vector index filters
  // already include org, but a misconfigured filter would otherwise hydrate
  // the leak. Forward allowLegacyAnonymous so the repository guard (which
  // mirrors the guard above) does not re-throw when an operator has opted
  // into the legacy single-tenant mode via LEGACY_ANONYMOUS_SEARCH=true.
  const hydratedRecords = await input.repository.getMemoryRecordsByIds(
    ids,
    input.organizationId,
    input.allowLegacyAnonymous,
  );

  const vectorScores = maxVectorScoresByRecordId(hits);
  const newestUpdatedAt = newestUpdatedAtFor(hydratedRecords);
  return rankCandidates(
    hydratedRecords.map((record) =>
      scoreSearchResult(record, {
        newestUpdatedAt,
        source: "vector",
        vectorScore: vectorScores.get(record.id),
      }),
    ),
  )
    .map((candidate) => candidate.record)
    .slice(0, input.limit);
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
