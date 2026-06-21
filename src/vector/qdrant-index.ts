// Qdrant adapter implementing the VectorIndex port.
//
// All Qdrant-specific concerns live here:
//   - The `chunk:${id}` point-id scheme
//   - The payload shape (mirrors toQdrantPoint in point-mapper.ts)
//   - The VectorFilter → { must: [{key, match}] } dialect translation
//   - The empty-list guard (Qdrant rejects empty point deletes in some versions)
//
// Nothing outside this file should reference QdrantClient or Qdrant filter
// syntax. This is the single place to swap for a pgvector adapter.

import type { QdrantClient } from "@qdrant/js-client-rest";
import type { VectorFilter, VectorHit, VectorIndex, VectorPoint } from "./vector-index.js";

type QdrantFilterClause = {
  key: string;
  match: { value: string };
};

function buildQdrantMust(filter: VectorFilter): QdrantFilterClause[] {
  const must: QdrantFilterClause[] = [];

  if (filter.organizationId) {
    must.push({ key: "organization_id", match: { value: filter.organizationId } });
  }

  for (const scope of filter.scopes) {
    must.push({ key: "scope_type", match: { value: scope.scopeType } });

    if (scope.scopeType === "project" && filter.projectKey != null) {
      must.push({ key: "project_key", match: { value: filter.projectKey } });
    } else {
      must.push({ key: "scope_id", match: { value: scope.scopeId } });
    }
  }

  return must;
}

export function createQdrantVectorIndex(
  client: QdrantClient,
  collectionName: string,
): VectorIndex {
  return {
    async ensureCollection(dimensions: number): Promise<void> {
      await client.recreateCollection(collectionName, {
        vectors: { size: dimensions, distance: "Cosine" },
      });
    },

    async upsert(points: VectorPoint[]): Promise<void> {
      if (points.length === 0) return;
      await client.upsert(collectionName, { points });
    },

    async query(vector: number[], filter: VectorFilter, limit: number): Promise<VectorHit[]> {
      const must = buildQdrantMust(filter);
      const response = await client.query(collectionName, {
        query: vector,
        limit,
        filter: { must },
      });

      return response.points.map((point) => ({
        id: typeof point.id === "string" ? point.id : String(point.id),
        score: point.score,
        payload: point.payload && typeof point.payload === "object"
          ? (point.payload as Record<string, unknown>)
          : {},
      }));
    },

    async delete(ids: string[]): Promise<void> {
      // Guard: Qdrant rejects empty point lists with 400 in some versions.
      if (ids.length === 0) return;
      await client.delete(collectionName, { points: ids });
    },
  };
}
