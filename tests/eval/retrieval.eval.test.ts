import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveServiceConfig } from "../../src/config.js";
import { createPgPool, type PgPool } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrate.js";
import { createOpenAiEmbeddingClient } from "../../src/embedding/openai-embeddings.js";
import { mrrAtK, recallAtK } from "../../src/eval/metrics.js";
import type { EvalQuery, MetricSummary } from "../../src/eval/types.js";
import { createIngestJobRepository } from "../../src/jobs/ingest-job-repository.js";
import { createQdrantClient } from "../../src/qdrant/client.js";
import { createQdrantVectorIndex } from "../../src/vector/qdrant-index.js";
import { retrieveMemory } from "../../src/search/retrieve-memory.js";
import {
  createMemoryChunkRepository,
  writeCanonicalMemory,
} from "../../src/store/canonical-indexing.js";
import { createMemoryRepository } from "../../src/store/memory-repository.js";
import type {
  CanonicalMemoryRepository,
  SearchMemoryResult,
} from "../../src/types.js";
import { SEED_ENTRIES } from "./fixtures/seed.js";

const RUN_EVAL = process.env.RUN_EVAL === "1";
const RECALL_THRESHOLD = Number(process.env.EVAL_RECALL_THRESHOLD ?? "0.70");
const MRR_THRESHOLD = Number(process.env.EVAL_MRR_THRESHOLD ?? "0.50");
const TOP_K = 10;

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUERIES_PATH = join(__dirname, "fixtures", "queries.json");
const QUERIES: EvalQuery[] = RUN_EVAL
  ? (JSON.parse(readFileSync(QUERIES_PATH, "utf8")) as EvalQuery[])
  : [];

type EvalServices = {
  pool: PgPool;
  repository: CanonicalMemoryRepository;
  embeddings: ReturnType<typeof createOpenAiEmbeddingClient>;
  vectorIndex: ReturnType<typeof createQdrantVectorIndex>;
};

describe.skipIf(!RUN_EVAL)("retrieval eval harness", () => {
  let services: EvalServices;
  const seedKeyToRecordId = new Map<string, number>();

  beforeAll(async () => {
    const config = resolveServiceConfig();
    const pool = createPgPool({ connectionString: config.databaseUrl });
    await runMigrations(pool);

    const repository = createMemoryRepository(pool);
    const chunkRepository = createMemoryChunkRepository(pool);
    const ingestJobs = createIngestJobRepository(pool);
    const embeddings = createOpenAiEmbeddingClient({
      apiKey: config.openai.apiKey,
      model: config.embedding.model,
    });
    const qdrantClient = createQdrantClient({
      url: config.qdrant.url,
      apiKey: config.qdrant.apiKey,
    });
    const vectorIndex = createQdrantVectorIndex(qdrantClient, config.qdrant.collectionName);

    for (const entry of SEED_ENTRIES) {
      const written = await writeCanonicalMemory({
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
        memory: entry.memory,
      });
      seedKeyToRecordId.set(entry.seedKey, written.id);
    }

    services = {
      pool,
      repository,
      embeddings,
      vectorIndex,
    };
  }, 120_000);

  afterAll(async () => {
    await services?.pool.end().catch(() => undefined);
  });

  it(`achieves recall@${TOP_K} >= ${RECALL_THRESHOLD} and MRR@${TOP_K} >= ${MRR_THRESHOLD}`, async () => {
    const recallScores: number[] = [];
    const mrrScores: number[] = [];

    for (const query of QUERIES) {
      const projectKey = query.scope.projectKey;
      if (!projectKey) {
        throw new Error(
          `query ${query.id} missing projectKey; retrieveMemory requires it`,
        );
      }

      const vector = await services.embeddings.embed(query.query);
      const results = await retrieveMemory({
        vectorIndex: services.vectorIndex,
        repository: services.repository,
        vector,
        query: query.query,
        projectKey,
        userScopeId: query.scope.userScopeId,
        limit: TOP_K,
        allowLegacyAnonymous: true,
      });

      const retrievedIds = results.map(
        (record: SearchMemoryResult) => record.id,
      );
      const relevantIds = query.relevantRecordSeedKeys.map((key) => {
        const id = seedKeyToRecordId.get(key);
        if (id === undefined) {
          throw new Error(`unknown seed key: ${key}`);
        }
        return id;
      });

      recallScores.push(recallAtK(retrievedIds, relevantIds, TOP_K));
      mrrScores.push(mrrAtK(retrievedIds, relevantIds, TOP_K));
    }

    const summary: MetricSummary = {
      totalQueries: QUERIES.length,
      recallAt10: average(recallScores),
      mrrAt10: average(mrrScores),
    };

    // Print summary on stderr so the run is auditable; assertions follow.
    process.stderr.write(`eval-summary ${JSON.stringify(summary)}\n`);

    expect(summary.recallAt10).toBeGreaterThanOrEqual(RECALL_THRESHOLD);
    expect(summary.mrrAt10).toBeGreaterThanOrEqual(MRR_THRESHOLD);
  }, 180_000);
});

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((acc, n) => acc + n, 0) / values.length;
}
