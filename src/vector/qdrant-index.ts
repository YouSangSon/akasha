// Qdrant adapter implementing the VectorIndex port.
//
// All Qdrant-specific concerns live here:
//   - The VectorFilter → { must: [{key, match}] } dialect translation
//   - The empty-list guard (Qdrant rejects empty point deletes in some versions)
//
// Nothing outside this file should reference QdrantClient or Qdrant filter
// syntax. This is the single place to swap for a pgvector adapter.

import type { QdrantClient, Schemas } from "@qdrant/js-client-rest";
import type {
  VectorDeleteOptions,
  VectorFilter,
  VectorHit,
  VectorIndex,
  VectorPoint,
} from "./vector-index.js";
import {
  assertOptionalVectorOrganizationId,
  assertVectorPointOrganizationIds,
} from "./organization-id.js";

type QdrantFilterClause = {
  key: string;
  match: { value: string };
};

function buildQdrantMust(filter: VectorFilter): QdrantFilterClause[] {
  assertOptionalVectorOrganizationId(filter.organizationId);

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
    // Non-destructive: creates the collection only when absent.
    // MUST NOT drop an existing collection — a live collection with data
    // must pass through unchanged. The pgvector adapter's ensureCollection
    // will follow the same create-if-not-exists contract.
    async ensureCollection(dimensions: number): Promise<void> {
      const { exists } = await client.collectionExists(collectionName);
      if (!exists) {
        await client.createCollection(collectionName, {
          vectors: { size: dimensions, distance: "Cosine" },
        });
      }
    },

    async upsert(points: VectorPoint[]): Promise<void> {
      if (points.length === 0) return;
      assertVectorPointOrganizationIds(points);

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

    async delete(ids: string[], options: VectorDeleteOptions = {}): Promise<void> {
      assertOptionalVectorOrganizationId(options.organizationId);

      // Guard: Qdrant rejects empty point lists with 400 in some versions.
      if (ids.length === 0) return;
      const selector: Schemas["PointsSelector"] = options.organizationId
        ? {
            filter: {
              must: [
                { has_id: ids },
                {
                  key: "organization_id",
                  match: { value: options.organizationId },
                },
              ],
            },
          }
        : { points: ids };

      await client.delete(collectionName, selector);
    },

    async deleteByRecordIds(
      recordIds: number[],
      options: VectorDeleteOptions = {},
    ): Promise<void> {
      assertOptionalVectorOrganizationId(options.organizationId);

      // Guard: an empty/null filter would delete the entire collection.
      if (recordIds.length === 0) return;
      const recordIdFilter = {
        should: recordIds.map((id) => ({
          key: "memory_record_id",
          match: { value: id },
        })),
      };
      const selector: Schemas["PointsSelector"] = options.organizationId
        ? {
            filter: {
              must: [
                recordIdFilter,
                {
                  key: "organization_id",
                  match: { value: options.organizationId },
                },
              ],
            },
          }
        : { filter: recordIdFilter };

      await client.delete(collectionName, selector);
    },
  };
}
