// Canonical-services bootstrap + memoized resolver. Extracted from server.ts
// to keep that file focused on the registry/dispatch surface. The
// memoization pattern is load-bearing: if bootstrap fails, the cached promise
// is cleared so the next call can retry, but on success the singleton is
// reused for the lifetime of the process (saves a Postgres pool + migration
// run on every tool call).

import { resolveServiceConfig } from "../config.js";
import {
  createAuditLogRepository,
  type AuditLogRepository,
} from "../audit/audit-log-repository.js";
import { createPgPool } from "../db/connection.js";
import { runMigrations } from "../db/migrate.js";
import { createEmbeddingProvider } from "../embedding/embedding-factory.js";
import { createIngestJobRepository } from "../jobs/ingest-job-repository.js";
import { createQdrantClient } from "../qdrant/client.js";
import { createQdrantVectorIndex } from "../vector/qdrant-index.js";
import { createPgVectorIndex } from "../vector/pgvector-index.js";
import { createMemoryRepository } from "../store/memory-repository.js";
import { createMemoryChunkRepository } from "../store/canonical-indexing.js";
import { createMemoryArchiveRepository } from "../store/memory-archive-repository.js";
import type {
  CanonicalServices,
  CreateToolRegistryOptions,
  WithCanonicalServices,
} from "./types.js";

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

  let vectorIndex: CanonicalServices["vectorIndex"];

  if (config.vectorBackend === "pgvector") {
    const pgVectorIndex = createPgVectorIndex(pool);
    await pgVectorIndex.ensureCollection(config.embedding.dimensions);
    vectorIndex = pgVectorIndex;
  } else {
    const qdrantClient = createQdrantClient({
      url: config.qdrant.url,
      apiKey: config.qdrant.apiKey,
    });
    const qdrantVectorIndex = createQdrantVectorIndex(
      qdrantClient,
      config.qdrant.collectionName,
    );
    await qdrantVectorIndex.ensureCollection(config.embedding.dimensions);
    vectorIndex = qdrantVectorIndex;
  }

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
    auditLog: createAuditLogRepository(pool),
    archiveRepository: createMemoryArchiveRepository(pool),
    embeddings: createEmbeddingProvider({
      config: {
        provider: config.embedding.provider,
        model: config.embedding.model,
        dimensions: config.embedding.dimensions,
      },
      openaiApiKey: config.openai.apiKey,
    }),
    vectorIndex,
    close: async () => {
      await pool.end();
    },
  };
}

export type CanonicalServicesResolverOptions = Pick<
  CreateToolRegistryOptions,
  "resolveCanonicalServices"
>;

export type { WithCanonicalServices } from "./types.js";

export function createServiceBackedAuditLog(
  withCanonicalServices: WithCanonicalServices,
): AuditLogRepository {
  return {
    record(entry) {
      return withCanonicalServices((services) => services.auditLog.record(entry));
    },
    listByOrganization(organizationId, options) {
      return withCanonicalServices((services) =>
        services.auditLog.listByOrganization(organizationId, options),
      );
    },
  };
}

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
