// Canonical-services bootstrap + memoized resolver. Extracted from server.ts
// to keep that file focused on the registry/dispatch surface. The
// memoization pattern is load-bearing: if bootstrap fails, the cached promise
// is cleared so the next call can retry, but on success the singleton is
// reused for the lifetime of the process (saves a Postgres pool + migration
// run on every tool call).

import { resolveServiceConfig } from "../config.js";
import { createPgPool } from "../db/connection.js";
import { runMigrations } from "../db/migrate.js";
import { createEmbeddingProvider } from "../embedding/embedding-factory.js";
import { createIngestJobRepository } from "../jobs/ingest-job-repository.js";
import { createQdrantClient } from "../qdrant/client.js";
import { createMemoryRepository } from "../store/memory-repository.js";
import { createMemoryChunkRepository } from "../store/canonical-indexing.js";
import { createMemoryArchiveRepository } from "../store/memory-archive-repository.js";
import type { CanonicalServices, CreateToolRegistryOptions } from "./types.js";

export async function bootstrapCanonicalServices(): Promise<CanonicalServices> {
  const config = resolveServiceConfig();
  const pool = createPgPool({
    connectionString: config.databaseUrl,
  });

  try {
    await runMigrations(pool);
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }

  const qdrantClient = createQdrantClient({
    url: config.qdrant.url,
    apiKey: config.qdrant.apiKey,
  });

  return {
    config: {
      qdrant: {
        collectionName: config.qdrant.collectionName,
      },
      embedding: config.embedding,
    },
    repository: createMemoryRepository(pool),
    chunkRepository: createMemoryChunkRepository(pool),
    ingestJobs: createIngestJobRepository(pool),
    archiveRepository: createMemoryArchiveRepository(pool),
    embeddings: createEmbeddingProvider({
      config: {
        provider: config.embedding.provider,
        model: config.embedding.model,
        dimensions: config.embedding.dimensions,
      },
      openaiApiKey: config.openai.apiKey,
    }),
    qdrantClient: {
      upsert(collectionName, input) {
        return qdrantClient.upsert(collectionName, input);
      },
      async deletePoints(collectionName, pointIds) {
        // Skip the round-trip when the caller has nothing to delete.
        // Qdrant rejects empty point lists with 400 in some versions.
        if (pointIds.length === 0) return;
        await qdrantClient.delete(collectionName, { points: pointIds });
      },
      async query(collectionName, args) {
        const response = await qdrantClient.query(collectionName, args);

        return {
          points: response.points.map((point) => {
            const payload =
              point.payload && typeof point.payload === "object"
                ? point.payload
                : undefined;
            const memoryRecordId =
              typeof payload?.memory_record_id === "number"
                ? payload.memory_record_id
                : undefined;

            return {
              payload:
                memoryRecordId === undefined
                  ? undefined
                  : { memory_record_id: memoryRecordId },
            };
          }),
        };
      },
    },
    close: async () => {
      await pool.end();
    },
  };
}

export type CanonicalServicesResolverOptions = Pick<
  CreateToolRegistryOptions,
  "resolveCanonicalServices"
>;

export type WithCanonicalServices = <T>(
  callback: (services: CanonicalServices) => Promise<T>,
) => Promise<T>;

export function createCanonicalServicesResolver(
  options: CanonicalServicesResolverOptions,
): WithCanonicalServices {
  let promise: Promise<CanonicalServices> | null = null;

  return async function withCanonicalServices<T>(
    callback: (services: CanonicalServices) => Promise<T>,
  ): Promise<T> {
    // Test-injection path: resolve fresh per call so individual tests can swap
    // services and observe close() bookkeeping.
    if (options.resolveCanonicalServices) {
      const services = await options.resolveCanonicalServices();
      try {
        return await callback(services);
      } finally {
        await services.close?.();
      }
    }

    // Production path: lazy singleton. The promise = null assignment on
    // failure is load-bearing — it lets a transient bootstrap error (e.g.,
    // Postgres restart, OpenAI key rotation in flight) recover on the next
    // call instead of pinning the registry to a permanently broken state.
    if (!promise) {
      promise = bootstrapCanonicalServices().catch((error: unknown) => {
        promise = null;
        throw error;
      });
    }

    const services = await promise;
    return await callback(services);
  };
}
