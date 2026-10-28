import { createMemoryWriteCoordinator } from "../../src/store/memory-write-coordinator.js";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveServiceConfig } from "../../src/config.js";
import { buildContextPack } from "../../src/context-pack/build-context-pack.js";
import { createPgPool, type PgPool } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrate.js";
import { createEmbeddingProvider } from "../../src/embedding/embedding-factory.js";
import { embedQuery, embedSimilarityBatch, MULTILINGUAL_E5_MODEL } from "../../src/embedding/embedding-provider.js";
import { cosineSimilarity } from "../../src/compact/semantic-duplicates.js";
import { hardNegativeOrderingAtK, mrrAtK, recallAtK } from "../../src/eval/metrics.js";
import { isAllowedEvalScope } from "../../src/eval/retrieval-corpus.js";
import { buildContextPackResult } from "../../src/mcp/context-pack-result.js";
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
import { loadRetrievalCorpus } from "./fixtures/retrieval-corpus.js";

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
const REQUIRE_MULTILINGUAL = process.env.EVAL_REQUIRE_MULTILINGUAL === "1";
const EVAL_RESOURCE_PREFIX = "akasha_eval_";
const EVAL_ORGANIZATION_ID = `akasha-eval-${process.pid}-${Date.now()}`;
const DECOY_ORGANIZATION_ID = `${EVAL_ORGANIZATION_ID}-decoy`;

const CORPUS = RUN_EVAL ? loadRetrievalCorpus() : undefined;
const QUERIES = CORPUS?.queries ?? [];
const EVAL_SEEDS = CORPUS?.seeds ?? [];

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
  repeat: number;
  scopeLeakageCount: number;
  hardNegativeScore?: number;
  isUserScope: boolean;
  latencyMs: number;
  recall: number;
  reciprocalRank: number;
  leakageCount: number;
  results: SearchMemoryResult[];
  rawVectorHits?: Array<{ seedKey: string; score: number }>;
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

    for (const entry of EVAL_SEEDS) {
      const written = await writeEvalMemory({
        ...entry.memory,
        organizationId: EVAL_ORGANIZATION_ID,
      });
      seedKeyToRecordId.set(entry.seedKey, written.id);
    }

    // Every target record has a same-content competitor in a different tenant.
    for (const entry of EVAL_SEEDS) {
      await writeEvalMemory({ ...entry.memory, organizationId: DECOY_ORGANIZATION_ID });
    }
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

  it("indexes text beyond the old 512-token truncation boundary with original offsets", async () => {
    if (!services) throw new Error("retrieval eval services were not initialized");
    const config = resolveServiceConfig();
    const embedding = {
      provider: config.embedding.provider, model: config.embedding.model,
      dimensions: config.embedding.dimensions, version: config.embedding.version,
      targetTokens: config.embedding.chunkTargetTokens, overlapTokens: config.embedding.chunkOverlapTokens,
    };
    const chunkRepository = createMemoryChunkRepository(services.pool);
    const ingestJobs = createIngestJobRepository(services.pool);
    const writes = createMemoryWriteCoordinator({ pool: services.pool, embeddings: services.embeddings,
      embedding, vectorIndexForPool: () => services!.vectorIndex });
    const content = "hello ".repeat(600) + "banana ".repeat(100);
    const written = await writeCanonicalMemory({ repository: services.repository, chunkRepository, ingestJobs,
      embeddings: services.embeddings, vectorIndex: services.vectorIndex, embedding, writes,
      memory: { organizationId: EVAL_ORGANIZATION_ID, scopeType: "project", scopeId: "long-input-boundary",
        projectKey: "long-input-boundary", memoryType: "fact", content,
        source: { scopeType: "project", scopeId: "long-input-boundary", sourceType: "document", externalId: "long-input-boundary" } },
    });
    const chunks = await chunkRepository.getChunksByRecordId(written.id);
    expect(chunks.length).toBeGreaterThan(1);
    const tokenizer = await services.embeddings.getChunkingTokenizer!();
    for (const chunk of chunks) {
      expect(chunk.content).toBe(content.slice(chunk.startOffset, chunk.endOffset));
      expect(tokenizer.countTokens(chunk.content, true)).toBeLessThanOrEqual(tokenizer.maxInputTokens);
    }
    expect(chunks.at(-1)!.endOffset).toBe(content.length);
    const tail = chunks.find((chunk) => chunk.content.includes("banana"))!;
    expect(tail).toBeDefined();
    const vector = await services.embeddings.embed(tail.content);
    const hits = await services.vectorIndex.query(vector, { organizationId: EVAL_ORGANIZATION_ID,
      scopes: [{ scopeType: "project", scopeId: "long-input-boundary" }] }, 1);
    const persisted = await services.pool.query<{ qdrant_point_id: string | null }>(
      `SELECT mc.qdrant_point_id FROM memory_chunks mc
       JOIN memory_records mr ON mr.id = mc.memory_record_id
       WHERE mc.id = $1 AND mr.id = $2 AND mr.organization_id = $3`,
      [tail.id, written.id, EVAL_ORGANIZATION_ID],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0]!.qdrant_point_id).toBeTruthy();
    expect(hits[0]?.id).toBe(persisted.rows[0]!.qdrant_point_id);
    expect(hits[0]?.payload.memory_record_id).toBe(written.id);
    expect(hits[0]?.score).toBeGreaterThan(0.99);
  }, 60_000);

  it(`gates recall@${TOP_K}, MRR@${TOP_K}, user recall, leakage, and warm latency`, async () => {
    if (!services) {
      throw new Error("retrieval eval services were not initialized");
    }

    await measureQuery(QUERIES[0]!, services, seedKeyToRecordId);

    const measurements: QueryMeasurement[] = [];
    for (let repeat = 0; repeat < WARM_REPEATS; repeat += 1) {
      for (const query of QUERIES) {
        measurements.push(
          await measureQuery(query, services, seedKeyToRecordId, repeat + 1),
        );
      }
    }

    const legacyIds = new Set(CORPUS!.legacyQueries.map((query) => query.id));
    const expandedIds = new Set(CORPUS!.expandedQueries.map((query) => query.id));
    const overall = summarizeMeasurements(measurements, seedKeyToRecordId);
    const legacy = summarizeMeasurements(measurements.filter((value) => legacyIds.has(value.queryId)), seedKeyToRecordId);
    const expanded = summarizeMeasurements(measurements.filter((value) => expandedIds.has(value.queryId)), seedKeyToRecordId);
    const languagePairs = Object.fromEntries([...new Set(CORPUS!.multilingualQueries.map((query) => `${query.queryLanguage}->${query.memoryLanguage}`))]
      .map((pair) => {
        const ids = new Set(CORPUS!.multilingualQueries.filter((query) => `${query.queryLanguage}->${query.memoryLanguage}` === pair).map((query) => query.id));
        return [pair, summarizeMeasurements(measurements.filter((value) => ids.has(value.queryId)), seedKeyToRecordId)];
      }));
    const summary = { provider: "transformers", model: services.embeddingModel, backend: "qdrant", topK: TOP_K,
      corpusVersion: CORPUS!.version, targetSeeds: EVAL_SEEDS.length, foreignTenantMirrors: EVAL_SEEDS.length,
      ...overall, legacyQueriesWithinExpandedCorpus: legacy, addedQueriesWithinExpandedCorpus: expanded,
      multilingualGateEnforced: REQUIRE_MULTILINGUAL, languagePairs };
    process.stderr.write(`eval-summary ${JSON.stringify(summary)}\n`);
    expect(measurements).toHaveLength(QUERIES.length * WARM_REPEATS);
    expect(summary.uniqueQueries).toBe(70);
    expect(summary.uniqueUserQueries).toBe(12);
    expect(summary.uniqueHardNegativeQueries).toBe(30);
    // A good new cohort must not hide a regression on the historical queries.
    for (const cohort of [legacy, expanded]) assertQuality(cohort);
    expect(overall.crossOrgLeakage).toBe(0);
    expect(overall.crossScopeLeakage).toBe(0);
    expect(Object.keys(languagePairs)).toHaveLength(9);
    for (const cohort of Object.values(languagePairs)) {
      expect(cohort.uniqueQueries).toBe(2);
      // Characterize the English baseline; qualify the opt-in multilingual model separately.
      if (REQUIRE_MULTILINGUAL) {
        expect(cohort.recallAt5).toBe(1);
        expect(cohort.mrrAt5).toBeGreaterThanOrEqual(0.75);
        expect(cohort.hardNegativeOrderingAt5).toBe(1);
      }
    }

    if (ENFORCE_LATENCY) {
      expect(summary.latencyMs.p50).toBeLessThanOrEqual(P50_THRESHOLD_MS);
      expect(summary.latencyMs.p95).toBeLessThanOrEqual(P95_THRESHOLD_MS);
    }
  }, 300_000);

  it("isolates deliberately mismatched user and project questions", async () => {
    if (!services) throw new Error("retrieval eval services were not initialized");
    const probes = [
      { queryId: "q23", scope: { projectKey: "project-alpha", userScopeId: "bob" } },
      { queryId: "q52", scope: { projectKey: "project-alpha" } },
    ];
    for (const probe of probes) {
      const original = QUERIES.find((query) => query.id === probe.queryId)!;
      const measurement = await measureQuery({ ...original, scope: probe.scope }, services, seedKeyToRecordId);
      expect(measurement.results.length).toBeGreaterThan(0);
      expect(measurement.leakageCount).toBe(0);
      expect(measurement.scopeLeakageCount).toBe(0);
      expect(measurement.recall).toBe(0);
      process.stderr.write(`eval-isolation-probe ${JSON.stringify({ queryId: original.id,
        requestedScope: probe.scope, results: measurement.results.length,
        forbiddenAnswerRecall: measurement.recall, crossOrgLeakage: measurement.leakageCount,
        crossScopeLeakage: measurement.scopeLeakageCount })}\n`);
    }
  }, 60_000);

  it("checks E5 contrast scores before reusing automatic similarity thresholds", async () => {
    if (!services || services.embeddingModel !== MULTILINGUAL_E5_MODEL) return;
    const pairs = [...new Map(CORPUS!.multilingualQueries.map((query) => {
      const positive = query.relevantRecordSeedKeys[0]!;
      const negative = query.hardNegativeRecordSeedKeys![0]!;
      return [`${positive}:${negative}`, [positive, negative] as const];
    })).values()];
    const keys = [...new Set(pairs.flat())];
    const vectors = await embedSimilarityBatch(services.embeddings, keys.map((key) => EVAL_SEEDS.find((seed) => seed.seedKey === key)!.memory.content));
    const byKey = new Map(keys.map((key, index) => [key, vectors[index]!]));
    const contrasts = pairs.map(([positive, negative]) => ({ positive, negative,
      score: cosineSimilarity(byKey.get(positive)!, byKey.get(negative)!) }));
    const repeatFalsePositives = contrasts.filter((pair) => pair.score >= 0.85);
    const compactionFalsePositives = contrasts.filter((pair) => pair.score >= 0.95);
    process.stderr.write(`eval-similarity-thresholds ${JSON.stringify({ model: services.embeddingModel,
      repeatThreshold: 0.85, compactionThreshold: 0.95, contrasts, repeatFalsePositives, compactionFalsePositives })}\n`);
    expect(repeatFalsePositives).toEqual([]);
    expect(compactionFalsePositives).toEqual([]);
  }, 60_000);

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
    expect(measurement.scopeLeakageCount).toBe(0);
    const input = { projectKey: "project-alpha", task: QUERIES[0]!.query, records: measurement.results };
    const baseline = buildContextPackResult(input);
    const budgeted = buildContextPackResult({ ...input, maxOutputBytes: 8192 });
    expect(Buffer.byteLength(JSON.stringify(budgeted), "utf8")).toBeLessThanOrEqual(8192);
    expect(budgeted.packMarkdown).toContain("Postgres is the canonical store for memory records");
    process.stderr.write(`eval-pack-bytes ${JSON.stringify({ profile: "default-stack-retrieved-records", maxOutputBytes: 8192,
      baselineStructuredJsonUtf8Bytes: Buffer.byteLength(JSON.stringify(baseline), "utf8"),
      budgetedStructuredJsonUtf8Bytes: Buffer.byteLength(JSON.stringify(budgeted), "utf8"),
      selectedMemoryIds: budgeted.selectedMemoryIds, modelTokensMeasured: false })}\n`);
  }, 60_000);
});

async function measureQuery(
  query: EvalQuery,
  services: EvalServices,
  seedKeyToRecordId: ReadonlyMap<string, number>,
  repeat = 0,
): Promise<QueryMeasurement> {
  const projectKey = query.scope.projectKey;
  if (!projectKey) {
    throw new Error(`query ${query.id} missing projectKey`);
  }

  const started = performance.now();
  const vector = await embedQuery(services.embeddings, query.query);
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
  const negativeIds = query.hardNegativeRecordSeedKeys?.map((key) => {
    const id = seedKeyToRecordId.get(key);
    if (id === undefined) throw new Error(`unknown negative seed key: ${key}`);
    return id;
  });
  const contrast = negativeIds === undefined ? undefined : hardNegativeOrderingAtK(retrievedIds, relevantIds, negativeIds, TOP_K);
  const rawVectorHits = repeat === 1 && query.queryLanguage !== undefined && contrast === 0
    ? (await services.vectorIndex.query(vector, { organizationId: EVAL_ORGANIZATION_ID,
      scopes: [{ scopeType: "project", scopeId: projectKey }] }, 20))
      .map((hit) => ({ seedKey: seedKeyForRecordId(seedKeyToRecordId, Number(hit.payload.memory_record_id)), score: hit.score }))
    : undefined;

  return {
    queryId: query.id,
    repeat,
    scopeLeakageCount: results.filter((record) => !isAllowedEvalScope(record, query.scope)).length,
    hardNegativeScore: contrast,
    rawVectorHits,
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


function summarizeMeasurements(measurements: QueryMeasurement[], seedIds: ReadonlyMap<string, number>) {
  const users = measurements.filter((value) => value.isUserScope);
  const contrasts = measurements.filter((value) => value.hardNegativeScore !== undefined);
  const latencies = measurements.map((value) => value.latencyMs).sort((a, b) => a - b);
  const failures = measurements.filter((value) => value.recall < 1 || value.hardNegativeScore === 0 || value.leakageCount > 0 || value.scopeLeakageCount > 0)
    .map((value) => ({ queryId: value.queryId, repeat: value.repeat, recall: value.recall,
      reciprocalRank: value.reciprocalRank, hardNegativeScore: value.hardNegativeScore,
      crossOrgLeakage: value.leakageCount, crossScopeLeakage: value.scopeLeakageCount,
      rawVectorHits: value.rawVectorHits,
      returned: value.results.map((record) => ({ seedKey: seedKeyForRecordId(seedIds, record.id), scopeType: record.scopeType,
        memoryType: record.memoryType, sourceType: record.source.sourceType })) }));
  return {
    samples: measurements.length,
    uniqueQueries: new Set(measurements.map((value) => value.queryId)).size,
    uniqueUserQueries: new Set(users.map((value) => value.queryId)).size,
    uniqueHardNegativeQueries: new Set(contrasts.map((value) => value.queryId)).size,
    recallAt5: average(measurements.map((value) => value.recall)),
    mrrAt5: average(measurements.map((value) => value.reciprocalRank)),
    userScopeRecallAt5: average(users.map((value) => value.recall)),
    hardNegativeOrderingAt5: contrasts.length === 0 ? null : average(contrasts.map((value) => value.hardNegativeScore!)),
    crossOrgLeakage: measurements.reduce((sum, value) => sum + value.leakageCount, 0),
    crossScopeLeakage: measurements.reduce((sum, value) => sum + value.scopeLeakageCount, 0),
    latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), max: latencies.at(-1) ?? 0 },
    misses: failures.filter((value) => value.repeat === 1 && value.recall < 1),
    failures,
  };
}

function assertQuality(summary: ReturnType<typeof summarizeMeasurements>): void {
  expect(summary.recallAt5).toBeGreaterThanOrEqual(RECALL_THRESHOLD);
  expect(summary.mrrAt5).toBeGreaterThanOrEqual(MRR_THRESHOLD);
  expect(summary.userScopeRecallAt5).toBe(USER_RECALL_THRESHOLD);
  expect(summary.crossOrgLeakage).toBe(0);
  expect(summary.crossScopeLeakage).toBe(0);
  if (summary.hardNegativeOrderingAt5 !== null) expect(summary.hardNegativeOrderingAt5).toBe(1);
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
