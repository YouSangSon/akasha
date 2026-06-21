import { rankResults } from "./rank-results.js";
import type { SearchMemoryResult } from "../types.js";
import { assertOrganizationId } from "../store/assert-organization-id.js";

type QdrantFilterMatch = {
  key: string;
  match: { value: string };
};

type QdrantScopeFilter = {
  must: QdrantFilterMatch[];
};

type QdrantQueryResult = {
  points: Array<{
    payload?: {
      memory_record_id?: number;
    };
  }>;
};

export type RetrieveMemoryInput = {
  qdrantClient: {
    query(
      collectionName: string,
      args: {
        query: number[];
        limit: number;
        filter: QdrantScopeFilter;
      },
    ): Promise<QdrantQueryResult>;
  };
  repository: {
    getMemoryRecordsByIds(
      ids: number[],
      organizationId?: string,
      allowLegacyAnonymous?: boolean,
    ): Promise<SearchMemoryResult[]>;
  };
  collectionName: string;
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

  const orgClause: QdrantFilterMatch[] =
    input.organizationId !== undefined
      ? [{ key: "organization_id", match: { value: input.organizationId } }]
      : [];

  const responses = await Promise.all([
    queryScope(input, [
      ...orgClause,
      { key: "scope_type", match: { value: "project" } },
      { key: "project_key", match: { value: input.projectKey } },
    ]),
    ...(input.userScopeId
      ? [
          queryScope(input, [
            ...orgClause,
            { key: "scope_type", match: { value: "user" } },
            { key: "scope_id", match: { value: input.userScopeId } },
          ]),
        ]
      : []),
  ]);

  const ids = uniqueMemoryRecordIds(responses.flatMap((response) => response.points));

  if (ids.length === 0) {
    return [];
  }

  // Pass organizationId so the PG hydration filters by org even if Qdrant
  // returned a cross-org point id. Defense-in-depth: Qdrant filters already
  // include org, but a misconfigured filter would otherwise hydrate the leak.
  // Forward allowLegacyAnonymous so the repository guard (which mirrors the
  // guard above) does not re-throw when an operator has opted into the legacy
  // single-tenant mode via LEGACY_ANONYMOUS_SEARCH=true.
  const hydratedRecords = await input.repository.getMemoryRecordsByIds(
    ids,
    input.organizationId,
    input.allowLegacyAnonymous,
  );

  return rankResults(hydratedRecords).slice(0, input.limit);
}

function queryScope(
  input: RetrieveMemoryInput,
  must: QdrantFilterMatch[],
): Promise<QdrantQueryResult> {
  return input.qdrantClient.query(input.collectionName, {
    query: input.vector,
    limit: input.limit,
    filter: { must },
  });
}

function uniqueMemoryRecordIds(
  points: QdrantQueryResult["points"],
): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();

  for (const point of points) {
    const id = point.payload?.memory_record_id;

    if (typeof id !== "number" || seen.has(id)) {
      continue;
    }

    seen.add(id);
    ids.push(id);
  }

  return ids;
}
