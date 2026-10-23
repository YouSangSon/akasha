import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveServiceConfig } from "../../src/config.js";
import { buildContextPack } from "../../src/context-pack/build-context-pack.js";
import { createPgPool, type PgPool } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrate.js";
import { createEmbeddingProvider } from "../../src/embedding/embedding-factory.js";
import { mrrAtK, recallAtK } from "../../src/eval/metrics.js";
import type { EvalQuery } from "../../src/eval/types.js";
import { createIngestJobRepository } from "../../src/jobs/ingest-job-repository.js";
import { createQdrantClient } from "../../src/qdrant/client.js";
import { retrieveMemory } from "../../src/search/retrieve-memory.js";
import {
  createMemoryChunkRepository,
  writeCanonicalMemory,
} from "../../src/store/canonical-indexing.js";
import { createMemoryRepository } from "../../src/store/memory-repository.js";
import type {
  AddMemoryInput,
  CanonicalMemoryRepository,
  SearchMemoryResult,
} from "../../src/types.js";
import { createQdrantVectorIndex } from "../../src/vector/qdrant-index.js";
import { resolveEvalThreshold } from "./env.js";
import { SEED_ENTRIES } from "./fixtures/seed.js";

const RUN_EVAL = process.env.RUN_EVAL === "1";
const RECALL_THRESHOLD = resolveEvalThreshold(
  process.env,
  "EVAL_RECALL_THRESHOLD",
  0.9,
);
const MRR_THRESHOLD = resolveEvalThreshold(
  process.env,
  "EVAL_MRR_THRESHOLD",
  0.55,
);
const TOP_K = 5;
const WARM_REPEATS = 3;
const USER_RECALL_THRESHOLD = 1;
const P50_THRESHOLD_MS = 100;
const P95_THRESHOLD_MS = 250;
const ENFORCE_LATENCY = process.env.EVAL_ENFORCE_LATENCY === "1";
const EVAL_RESOURCE_PREFIX = "akasha_eval_";
const EVAL_ORGANIZATION_ID = `akasha-eval-${process.pid}-${Date.now()}`;
const DECOY_ORGANIZATION_ID = `${EVAL_ORGANIZATION_ID}-decoy`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUERIES_PATH = join(__dirname, "fixtures", "queries.json");
const QUERIES: EvalQuery[] = RUN_EVAL
  ? (JSON.parse(readFileSync(QUERIES_PATH, "utf8")) as EvalQuery[])
  : [];

type EvalServices = {
  pool: PgPool;
  repository: CanonicalMemoryRepository;
  embeddings: ReturnType<typeof createEmbeddingProvider>;
  vectorIndex: ReturnType<typeof createQdrantVectorIndex>;
  qdrantClient: ReturnType<typeof createQdrantClient>;
  collectionName: string;
  embeddingModel: string;
};

type QueryMeasurement = {
  queryId: string;
  isUserScope: boolean;
  latencyMs: number;
  recall: number;
  reciprocalRank: number;
  leakageCount: number;
  results: SearchMemoryResult[];
};

describe("retrieval eval safety", () => {
  it("accepts only localhost eval-prefixed resources", () => {
    const config = resolveServiceConfig({
      env: {
        DATABASE_URL:
          "postgres://memory:memory@127.0.0.1:5432/akasha_eval_test",
        QDRANT_URL: "http://127.0.0.1:6333",
        QDRANT_API_KEY: "local-qdrant-key",
        QDRANT_COLLECTION_NAME: "akasha_eval_test",
        EMBEDDING_PROVIDER: "transformers",
        VECTOR_BACKEND: "qdrant",
      },
    });

    expect(() => assertSafeDefaultEvalConfig(config)).not.toThrow();
  });

  it("rejects URL overrides before opening the disposable databases", () => {
    const env = { QDRANT_API_KEY: "local-qdrant-key", DATABASE_URL: "postgres://memory:memory@127.0.0.1/akasha_eval_test", QDRANT_URL: "http://127.0.0.1:6333", QDRANT_COLLECTION_NAME: "akasha_eval_test", EMBEDDING_PROVIDER: "transformers", VECTOR_BACKEND: "qdrant" };
    expect(() => assertSafeDefaultEvalConfig(resolveServiceConfig({ env: { ...env, DATABASE_URL: env.DATABASE_URL + "?host=remote.invalid&database=production" } }))).toThrow("query or fragment overrides");
    expect(() => assertSafeDefaultEvalConfig(resolveServiceConfig({ env: { ...env, QDRANT_URL: env.QDRANT_URL + "/proxy" } }))).toThrow("plain local HTTP origin");
  });

  it("rejects normal development resources before destructive setup", () => {
    const config = resolveServiceConfig({
      env: {
        DATABASE_URL: "postgres://memory:memory@127.0.0.1:5432/memory_os",
        QDRANT_URL: "http://127.0.0.1:6333",
        QDRANT_API_KEY: "local-qdrant-key",
        QDRANT_COLLECTION_NAME: "memory_chunks_v1",
        EMBEDDING_PROVIDER: "transformers",
        VECTOR_BACKEND: "qdrant",
      },
    });

    expect(() => assertSafeDefaultEvalConfig(config)).toThrow(
      "DATABASE_URL database must start with akasha_eval_",
    );
  });
});

describe.skipIf(!RUN_EVAL)("default retrieval eval harness", () => {
  let services: EvalServices | undefined;
  const seedKeyToRecordId = new Map<string, number>();

  beforeAll(async () => {
    const config = resolveServiceConfig();
    assertSafeDefaultEvalConfig(config);

    const pool = createPgPool({
      connectionString: config.databaseUrl,
      ...config.postgres.pool,
    });
    const qdrantClient = createQdrantClient({
      url: config.qdrant.url,
      apiKey: config.qdrant.apiKey,
    });
    const vectorIndex = createQdrantVectorIndex(
      qdrantClient,
      config.qdrant.collectionName,
    );
    const repository = createMemoryRepository(pool);
    const chunkRepository = createMemoryChunkRepository(pool);
    const ingestJobs = createIngestJobRepository(pool);
    const embeddings = createEmbeddingProvider({
      config: {
        provider: config.embedding.provider,
        model: config.embedding.model,
        dimensions: config.embedding.dimensions,
      },
      openaiApiKey: config.openai.apiKey,
    });

    services = {
      pool,
      repository,
      embeddings,
      vectorIndex,
      qdrantClient,
      collectionName: config.qdrant.collectionName,
      embeddingModel: config.embedding.model,
    };

    await runMigrations(pool);
    const existing = await qdrantClient.collectionExists(
      config.qdrant.collectionName,
    );
    if (existing.exists) {
      await qdrantClient.deleteCollection(config.qdrant.collectionName);
    }
    await vectorIndex.ensureCollection(config.embedding.dimensions);

    const writeEvalMemory = (memory: AddMemoryInput) =>
      writeCanonicalMemory({
        repository,
        chunkRepository,
        ingestJobs,
        embeddings,
        vectorIndex,
        embedding: {
          provider: config.embedding.provider,
          model: config.embedding.model,
          dimensions: config.embedding.dimensions,
          version: config.embedding.version,
          targetTokens: config.embedding.chunkTargetTokens,
          overlapTokens: config.embedding.chunkOverlapTokens,
        },
        memory,
      });

    for (const entry of SEED_ENTRIES) {
      const written = await writeEvalMemory({
        ...entry.memory,
        organizationId: EVAL_ORGANIZATION_ID,
      });
      seedKeyToRecordId.set(entry.seedKey, written.id);
    }

    const decoySeed = SEED_ENTRIES[0];
    if (!decoySeed) {
      throw new Error("retrieval eval requires at least one seed entry");
    }
    await writeEvalMemory({
      ...decoySeed.memory,
      organizationId: DECOY_ORGANIZATION_ID,
    });
  }, 180_000);

  afterAll(async () => {
    if (!services) {
      return;
    }

    try {
      const collection = await services.qdrantClient.collectionExists(
        services.collectionName,
      );
      await Promise.all([
        collection.exists
          ? services.qdrantClient.deleteCollection(services.collectionName)
          : Promise.resolve(),
        services.pool.query(
          "DELETE FROM sources WHERE organization_id = ANY($1::text[])",
          [[EVAL_ORGANIZATION_ID, DECOY_ORGANIZATION_ID]],
        ),
      ]);
    } finally {
      await services.pool.end();
    }
  });

  it(`gates recall@${TOP_K}, MRR@${TOP_K}, user recall, leakage, and warm latency`, async () => {
    if (!services) {
      throw new Error("retrieval eval services were not initialized");
    }

    await measureQuery(QUERIES[0]!, services, seedKeyToRecordId);

    const measurements: QueryMeasurement[] = [];
    for (let repeat = 0; repeat < WARM_REPEATS; repeat += 1) {
      for (const query of QUERIES) {
        measurements.push(
          await measureQuery(query, services, seedKeyToRecordId),
        );
      }
    }

    const userMeasurements = measurements.filter(
      (measurement) => measurement.isUserScope,
    );
    const latencies = measurements
      .map((measurement) => measurement.latencyMs)
      .sort((left, right) => left - right);
    const summary = {
      provider: "transformers",
      model: services.embeddingModel,
      backend: "qdrant",
      topK: TOP_K,
      samples: measurements.length,
      recallAt5: average(measurements.map((value) => value.recall)),
      mrrAt5: average(
        measurements.map((value) => value.reciprocalRank),
      ),
      userScopeRecallAt5: average(
        userMeasurements.map((value) => value.recall),
      ),
      crossOrgLeakage: measurements.reduce(
        (total, value) => total + value.leakageCount,
        0,
      ),
      latencyMs: {
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
        max: latencies.at(-1) ?? 0,
      },
      misses: measurements
        .slice(0, QUERIES.length)
        .filter((value) => value.recall < 1)
        .map((value) => ({
          queryId: value.queryId,
          returned: value.results.map((record) => ({
            seedKey: seedKeyForRecordId(seedKeyToRecordId, record.id),
            scopeType: record.scopeType,
            memoryType: record.memoryType,
            sourceType: record.source.sourceType,
          })),
        })),
    };

    process.stderr.write(`eval-summary ${JSON.stringify(summary)}\n`);

    expect(measurements).toHaveLength(QUERIES.length * WARM_REPEATS);
    expect(summary.recallAt5).toBeGreaterThanOrEqual(RECALL_THRESHOLD);
    expect(summary.mrrAt5).toBeGreaterThanOrEqual(MRR_THRESHOLD);
    expect(summary.userScopeRecallAt5).toBeGreaterThanOrEqual(
      USER_RECALL_THRESHOLD,
    );
    expect(summary.crossOrgLeakage).toBe(0);
    if (ENFORCE_LATENCY) {
      expect(summary.latencyMs.p50).toBeLessThanOrEqual(P50_THRESHOLD_MS);
      expect(summary.latencyMs.p95).toBeLessThanOrEqual(P95_THRESHOLD_MS);
    }
  }, 300_000);

  it("builds a context pack from org-scoped default-stack retrieval", async () => {
    if (!services) {
      throw new Error("retrieval eval services were not initialized");
    }

    const measurement = await measureQuery(
      QUERIES[0]!,
      services,
      seedKeyToRecordId,
    );
    const pack = buildContextPack({ records: measurement.results });

    expect(measurement.leakageCount).toBe(0);
    expect(pack.markdown).toContain(
      "Postgres is the canonical store for memory records",
    );
  }, 60_000);
});

async function measureQuery(
  query: EvalQuery,
  services: EvalServices,
  seedKeyToRecordId: ReadonlyMap<string, number>,
): Promise<QueryMeasurement> {
  const projectKey = query.scope.projectKey;
  if (!projectKey) {
    throw new Error(`query ${query.id} missing projectKey`);
  }

  const started = performance.now();
  const vector = await services.embeddings.embed(query.query);
  const results = await retrieveMemory({
    vectorIndex: services.vectorIndex,
    repository: services.repository,
    vector,
    query: query.query,
    organizationId: EVAL_ORGANIZATION_ID,
    projectKey,
    userScopeId: query.scope.userScopeId,
    limit: TOP_K,
  });
  const latencyMs = performance.now() - started;
  const relevantIds = query.relevantRecordSeedKeys.map((key) => {
    const id = seedKeyToRecordId.get(key);
    if (id === undefined) {
      throw new Error(`unknown seed key: ${key}`);
    }
    return id;
  });
  const retrievedIds = results.map((record) => record.id);

  return {
    queryId: query.id,
    isUserScope: query.scope.userScopeId !== undefined,
    latencyMs,
    recall: recallAtK(retrievedIds, relevantIds, TOP_K),
    reciprocalRank: mrrAtK(retrievedIds, relevantIds, TOP_K),
    leakageCount: results.filter(
      (record) => record.organizationId !== EVAL_ORGANIZATION_ID,
    ).length,
    results,
  };
}

function seedKeyForRecordId(
  seedKeyToRecordId: ReadonlyMap<string, number>,
  recordId: number,
): string {
  for (const [seedKey, mappedRecordId] of seedKeyToRecordId) {
    if (mappedRecordId === recordId) {
      return seedKey;
    }
  }

  return `unknown:${recordId}`;
}

function assertSafeDefaultEvalConfig(
  config: ReturnType<typeof resolveServiceConfig>,
): void {
  if (config.embedding.provider !== "transformers") {
    throw new Error(
      "retrieval eval requires EMBEDDING_PROVIDER=transformers",
    );
  }
  if (config.vectorBackend !== "qdrant") {
    throw new Error("retrieval eval requires VECTOR_BACKEND=qdrant");
  }
  assertLocalUrl(config.databaseUrl, "DATABASE_URL");
  assertLocalUrl(config.qdrant.url, "QDRANT_URL");

  const databaseName = decodeURIComponent(
    new URL(config.databaseUrl).pathname.slice(1),
  );
  if (!databaseName.startsWith(EVAL_RESOURCE_PREFIX)) {
    throw new Error(
      `retrieval eval DATABASE_URL database must start with ${EVAL_RESOURCE_PREFIX}`,
    );
  }
  if (!config.qdrant.collectionName.startsWith(EVAL_RESOURCE_PREFIX)) {
    throw new Error(
      `retrieval eval QDRANT_COLLECTION_NAME must start with ${EVAL_RESOURCE_PREFIX}`,
    );
  }
}

function assertLocalUrl(value: string, name: string): void {
  const url = new URL(value);
  const hostname = url.hostname;
  if (url.search || url.hash) throw new Error(`retrieval eval ${name} must not contain query or fragment overrides`);
  if (name === "DATABASE_URL" && !["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("retrieval eval DATABASE_URL must use Postgres");
  if (name === "QDRANT_URL" && (url.protocol !== "http:" || url.pathname !== "/" || url.username || url.password)) throw new Error("retrieval eval QDRANT_URL must be a plain local HTTP origin");
  if (
    hostname !== "127.0.0.1" &&
    hostname !== "localhost" &&
    hostname !== "[::1]"
  ) {
    throw new Error(`retrieval eval ${name} must point to localhost`);
  }
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }
  return values[Math.ceil(values.length * fraction) - 1]!;
}
