import { rankResults } from "./rank-results.js";
import type { SearchMemoryResult } from "../types.js";

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
    getMemoryRecordsByIds(ids: number[]): Promise<SearchMemoryResult[]>;
  };
  collectionName: string;
  vector: number[];
  projectKey: string;
  userScopeId: string;
  limit: number;
};

export async function retrieveMemory(
  input: RetrieveMemoryInput,
): Promise<SearchMemoryResult[]> {
  const [projectResponse, userResponse] = await Promise.all([
    queryScope(input, [
      { key: "scope_type", match: { value: "project" } },
      { key: "project_key", match: { value: input.projectKey } },
    ]),
    queryScope(input, [
      { key: "scope_type", match: { value: "user" } },
      { key: "scope_id", match: { value: input.userScopeId } },
    ]),
  ]);

  const ids = uniqueMemoryRecordIds([
    ...projectResponse.points,
    ...userResponse.points,
  ]);

  if (ids.length === 0) {
    return [];
  }

  const hydratedRecords = await input.repository.getMemoryRecordsByIds(ids);

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
