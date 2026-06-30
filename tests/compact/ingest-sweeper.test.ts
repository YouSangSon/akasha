import { describe, expect, it, vi } from "vitest";
import {
  runIngestSweep,
  type RunIngestSweepInput,
} from "../../src/compact/ingest-sweeper.js";
import { nextRetryDelayMs } from "../../src/jobs/retry-backoff.js";
import type { IngestJob, IngestJobRepository } from "../../src/types.js";
import type {
  MemoryChunkRepository,
  ReindexableMemoryChunk,
} from "../../src/store/canonical-indexing.js";

const SILENT_LOGGER = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
} as unknown as RunIngestSweepInput["logger"];
const NOW = new Date("2026-06-25T00:00:00.000Z");
const callRunIngestSweep = (input: unknown) =>
  runIngestSweep(input as RunIngestSweepInput);

// Minimal IngestJob fixture.
function makeJob(overrides: Partial<IngestJob> = {}): IngestJob {
  return {
    id: 1,
    memoryRecordId: 10,
    organizationId: "default",
    status: "completed",
    attempts: 0,
    lastError: null,
    qdrantStatus: "pending",
    qdrantAttempts: 0,
    qdrantNextRetryAt: null,
    qdrantLastError: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeChunk(overrides: Partial<ReindexableMemoryChunk> = {}): ReindexableMemoryChunk {
  return {
    id: 100,
    memoryRecordId: 10,
    chunkIndex: 0,
    content: "some memory content",
    startOffset: 0,
    endOffset: 19,
    embeddingVersion: "v1",
    organizationId: "org-a",
    scopeType: "project",
    scopeId: "proj-1",
    projectKey: "proj-1",
    durability: "durable",
    kind: "fact",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeIngestJobRepo(
  claimed: IngestJob[],
  overrides: Partial<IngestJobRepository> = {},
): { repo: IngestJobRepository; markQdrantCompleted: ReturnType<typeof vi.fn>; markQdrantPending: ReturnType<typeof vi.fn>; markQdrantFailed: ReturnType<typeof vi.fn> } {
  const claimPendingForRetry = vi.fn().mockResolvedValue(claimed);
  const markQdrantCompleted = vi.fn().mockResolvedValue(undefined);
  const markQdrantPending = vi.fn().mockResolvedValue(undefined);
  const markQdrantFailed = vi.fn().mockResolvedValue(undefined);

  const repo: IngestJobRepository = {
    create: vi.fn(),
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
    markQdrantCompleted,
    markQdrantPending,
    markQdrantFailed,
    listPendingForRetry: vi.fn(),
    claimPendingForRetry,
    ...overrides,
  };
  return { repo, markQdrantCompleted, markQdrantPending, markQdrantFailed };
}

function makeChunkRepo(
  chunks: ReindexableMemoryChunk[],
  overrides: Partial<MemoryChunkRepository> = {},
): MemoryChunkRepository {
  return {
    insertChunks: vi.fn(),
    updatePointIds: vi.fn().mockResolvedValue(undefined),
    deleteChunksForRecord: vi.fn().mockResolvedValue(undefined),
    listChunks: vi.fn(),
    getChunksByRecordId: vi.fn().mockResolvedValue(chunks),
    createContextPackRun: vi.fn(),
    ...overrides,
  };
}

function makeVectorIndex(
  overrides: Partial<{
    upsert: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    deleteByRecordIds: ReturnType<typeof vi.fn>;
    ensureCollection: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    upsert: overrides.upsert ?? vi.fn().mockResolvedValue(undefined),
    query: overrides.query ?? vi.fn(),
    delete: overrides.delete ?? vi.fn(),
    deleteByRecordIds:
      overrides.deleteByRecordIds ?? vi.fn().mockResolvedValue(undefined),
    ensureCollection: overrides.ensureCollection ?? vi.fn(),
  };
}

function makeEmbeddings(
  overrides: Partial<{
    embed: ReturnType<typeof vi.fn>;
    embedBatch: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    embed: overrides.embed ?? vi.fn(),
    embedBatch: overrides.embedBatch ?? vi.fn().mockResolvedValue([]),
  };
}

describe("nextRetryDelayMs", () => {
  it("returns 1s base for attempt 0", () => {
    expect(nextRetryDelayMs(0)).toBe(1_000);
  });

  it("doubles per attempt", () => {
    expect(nextRetryDelayMs(1)).toBe(2_000);
    expect(nextRetryDelayMs(2)).toBe(4_000);
    expect(nextRetryDelayMs(3)).toBe(8_000);
  });

  it("caps at 5 minutes", () => {
    expect(nextRetryDelayMs(20)).toBe(5 * 60 * 1_000);
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["decimal", 1.5],
    ["negative", -1],
    ["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
  ])("rejects invalid attempt counts: %s", (_label, attempts) => {
    expect(() => nextRetryDelayMs(attempts)).toThrow(
      "retry attempts must be a non-negative safe integer",
    );
  });
});

describe("runIngestSweep", () => {
  it.each([undefined, null, "input", 12, true, []])(
    "rejects non-object direct input",
    async (input) => {
      await expect(callRunIngestSweep(input)).rejects.toThrow(
        "runIngestSweep input must be an object",
      );
    },
  );

  it.each<[
    (input: RunIngestSweepInput) => unknown,
    string,
  ]>([
    [(input) => ({ ...input, ingestJobs: null }), "ingestJobs must be an object"],
    [
      (input) => ({
        ...input,
        ingestJobs: { ...input.ingestJobs, claimPendingForRetry: null },
      }),
      "ingestJobs.claimPendingForRetry must be a function",
    ],
    [
      (input) => ({ ...input, chunkRepository: null }),
      "chunkRepository must be an object",
    ],
    [
      (input) => ({
        ...input,
        chunkRepository: {
          ...input.chunkRepository,
          getChunksByRecordId: null,
        },
      }),
      "chunkRepository.getChunksByRecordId must be a function",
    ],
    [(input) => ({ ...input, embeddings: null }), "embeddings must be an object"],
    [
      (input) => ({
        ...input,
        embeddings: { ...input.embeddings, embedBatch: null },
      }),
      "embeddings.embedBatch must be a function",
    ],
    [(input) => ({ ...input, vectorIndex: null }), "vectorIndex must be an object"],
    [
      (input) => ({
        ...input,
        vectorIndex: { ...input.vectorIndex, upsert: null },
      }),
      "vectorIndex.upsert must be a function",
    ],
    [(input) => ({ ...input, logger: null }), "logger must be an object"],
    [
      (input) => ({ ...input, logger: { ...input.logger, warn: null } }),
      "logger.warn must be a function",
    ],
    [
      (input) => ({ ...input, batchSize: 0 }),
      "batchSize must be a positive safe integer",
    ],
    [
      (input) => ({ ...input, maxAttempts: Number.NaN }),
      "maxAttempts must be a positive safe integer",
    ],
    [(input) => ({ ...input, now: "now" }), "now must be a function"],
  ])("rejects invalid direct input field", async (mutateInput, message) => {
    const { repo, markQdrantCompleted, markQdrantPending, markQdrantFailed } =
      makeIngestJobRepo([]);
    const chunkRepo = makeChunkRepo([]);
    const embeddings = makeEmbeddings();
    const vectorIndex = makeVectorIndex();

    await expect(
      callRunIngestSweep(
        mutateInput({
          ingestJobs: repo,
          chunkRepository: chunkRepo,
          embeddings,
          vectorIndex,
          logger: SILENT_LOGGER,
        }),
      ),
    ).rejects.toThrow(message);

    expect(repo.claimPendingForRetry).not.toHaveBeenCalled();
    expect(chunkRepo.getChunksByRecordId).not.toHaveBeenCalled();
    expect(embeddings.embedBatch).not.toHaveBeenCalled();
    expect(vectorIndex.deleteByRecordIds).not.toHaveBeenCalled();
    expect(vectorIndex.upsert).not.toHaveBeenCalled();
    expect(markQdrantCompleted).not.toHaveBeenCalled();
    expect(markQdrantPending).not.toHaveBeenCalled();
    expect(markQdrantFailed).not.toHaveBeenCalled();
  });

  it("rejects invalid injected time values before claiming rows", async () => {
    const { repo } = makeIngestJobRepo([]);
    const chunkRepo = makeChunkRepo([]);
    const embeddings = makeEmbeddings();
    const vectorIndex = makeVectorIndex();

    await expect(
      runIngestSweep({
        ingestJobs: repo,
        chunkRepository: chunkRepo,
        embeddings,
        vectorIndex,
        logger: SILENT_LOGGER,
        now: () => new Date("not-a-date"),
      }),
    ).rejects.toThrow("now result must be a valid Date");

    expect(repo.claimPendingForRetry).not.toHaveBeenCalled();
    expect(chunkRepo.getChunksByRecordId).not.toHaveBeenCalled();
    expect(embeddings.embedBatch).not.toHaveBeenCalled();
    expect(vectorIndex.deleteByRecordIds).not.toHaveBeenCalled();
    expect(vectorIndex.upsert).not.toHaveBeenCalled();
  });

  it.each([
    [null, "claimPendingForRetry result must be an array", true],
    [null, "claimPendingForRetry result[0] must be an object"],
    [
      { id: 0 },
      "claimPendingForRetry result[0].id must be a positive safe integer",
    ],
    [
      { memoryRecordId: 0 },
      "claimPendingForRetry result[0].memoryRecordId must be a positive safe integer",
    ],
    [
      { organizationId: " \n\t " },
      "claimPendingForRetry result[0].organizationId must contain non-whitespace text",
    ],
    [
      { qdrantAttempts: -1 },
      "claimPendingForRetry result[0].qdrantAttempts must be a non-negative safe integer",
    ],
  ])(
    "rejects malformed claimed ingest jobs",
    async (overrides, message, useRawClaimResult = false) => {
      const job =
        overrides === null
          ? overrides
          : {
              ...makeJob(),
              ...(overrides as Record<string, unknown>),
            };
      const claimed = useRawClaimResult ? job : [job];
      const { repo, markQdrantCompleted, markQdrantPending, markQdrantFailed } =
        makeIngestJobRepo(claimed as IngestJob[]);
      const chunkRepo = makeChunkRepo([]);
      const embeddings = makeEmbeddings();
      const vectorIndex = makeVectorIndex();

      await expect(
        runIngestSweep({
          ingestJobs: repo,
          chunkRepository: chunkRepo,
          embeddings,
          vectorIndex,
          logger: SILENT_LOGGER,
        }),
      ).rejects.toThrow(message);

      expect(repo.claimPendingForRetry).toHaveBeenCalledOnce();
      expect(chunkRepo.getChunksByRecordId).not.toHaveBeenCalled();
      expect(embeddings.embedBatch).not.toHaveBeenCalled();
      expect(vectorIndex.deleteByRecordIds).not.toHaveBeenCalled();
      expect(vectorIndex.upsert).not.toHaveBeenCalled();
      expect(markQdrantCompleted).not.toHaveBeenCalled();
      expect(markQdrantPending).not.toHaveBeenCalled();
      expect(markQdrantFailed).not.toHaveBeenCalled();
    },
  );

  it.each([
    [null, "getChunksByRecordId result must be an array", true],
    [null, "getChunksByRecordId result[0] must be an object"],
    [
      { id: 0 },
      "getChunksByRecordId result[0].id must be a positive safe integer",
    ],
    [
      { content: "" },
      "getChunksByRecordId result[0].content must contain non-whitespace text",
    ],
    [
      { tags: [12] },
      "getChunksByRecordId result[0].tags[0] must be a string",
    ],
  ])(
    "retries malformed chunks without vector side effects",
    async (overrides, message, useRawChunkResult = false) => {
      const job = makeJob({ id: 6, memoryRecordId: 10, qdrantAttempts: 0 });
      const chunk =
        overrides === null
          ? overrides
          : {
              ...makeChunk(),
              ...(overrides as Record<string, unknown>),
            };
      const chunks = useRawChunkResult ? chunk : [chunk];
      const { repo, markQdrantPending } = makeIngestJobRepo([job]);
      const chunkRepo = makeChunkRepo(chunks as ReindexableMemoryChunk[]);
      const embeddings = makeEmbeddings({
        embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
      });
      const vectorIndex = makeVectorIndex();

      const result = await runIngestSweep({
        ingestJobs: repo,
        chunkRepository: chunkRepo,
        embeddings,
        vectorIndex,
        logger: SILENT_LOGGER,
        now: () => NOW,
      });

      expect(result).toEqual({ scanned: 1, completed: 0, retried: 1, failed: 0 });
      expect(embeddings.embedBatch).not.toHaveBeenCalled();
      expect(vectorIndex.deleteByRecordIds).not.toHaveBeenCalled();
      expect(vectorIndex.upsert).not.toHaveBeenCalled();
      expect(chunkRepo.updatePointIds).not.toHaveBeenCalled();
      expect(markQdrantPending).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: job.id,
          attempts: 1,
          error: expect.any(Error),
        }),
      );
      expect(
        (markQdrantPending.mock.calls[0]![0].error as Error).message,
      ).toBe(message);
    },
  );

  it.each([
    [null, "embedBatch result must be an array"],
    [[[]], "embedBatch result[0] must be a non-empty array"],
    [[[Number.NaN]], "embedBatch result[0][0] must be a finite number"],
  ])(
    "retries malformed embedding results before vector side effects",
    async (vectors, message) => {
      const job = makeJob({ id: 7, memoryRecordId: 10, qdrantAttempts: 0 });
      const chunk = makeChunk();
      const { repo, markQdrantPending } = makeIngestJobRepo([job]);
      const chunkRepo = makeChunkRepo([chunk]);
      const embeddings = makeEmbeddings({
        embedBatch: vi.fn().mockResolvedValue(vectors),
      });
      const vectorIndex = makeVectorIndex();

      const result = await runIngestSweep({
        ingestJobs: repo,
        chunkRepository: chunkRepo,
        embeddings,
        vectorIndex,
        logger: SILENT_LOGGER,
        now: () => NOW,
      });

      expect(result).toEqual({ scanned: 1, completed: 0, retried: 1, failed: 0 });
      expect(embeddings.embedBatch).toHaveBeenCalledWith([chunk.content]);
      expect(vectorIndex.deleteByRecordIds).not.toHaveBeenCalled();
      expect(vectorIndex.upsert).not.toHaveBeenCalled();
      expect(chunkRepo.updatePointIds).not.toHaveBeenCalled();
      expect(
        (markQdrantPending.mock.calls[0]![0].error as Error).message,
      ).toBe(message);
    },
  );

  it("returns zero counts when no pending rows are claimed", async () => {
    const { repo } = makeIngestJobRepo([]);
    const chunkRepo = makeChunkRepo([]);
    const vectorIndex = { upsert: vi.fn(), query: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), ensureCollection: vi.fn() };

    const result = await runIngestSweep({
      ingestJobs: repo,
      chunkRepository: chunkRepo,
      embeddings: { embed: vi.fn(), embedBatch: vi.fn() },
      vectorIndex,
      logger: SILENT_LOGGER,
    });

    expect(result).toEqual({ scanned: 0, completed: 0, retried: 0, failed: 0 });
    expect(vectorIndex.upsert).not.toHaveBeenCalled();
  });

  it("embeds chunks, upserts to vector index, updates point ids, and marks completed on success", async () => {
    const job = makeJob({ id: 1, memoryRecordId: 10, qdrantAttempts: 0 });
    const chunk = makeChunk({ id: 100, memoryRecordId: 10 });

    const { repo, markQdrantCompleted } = makeIngestJobRepo([job]);
    const updatePointIds = vi.fn().mockResolvedValue(undefined);
    const chunkRepo = makeChunkRepo([chunk], { updatePointIds });
    const vectorIndex = { upsert: vi.fn().mockResolvedValue(undefined), query: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), ensureCollection: vi.fn() };
    const embedding = [0.1, 0.2, 0.3];
    const embeddings = { embed: vi.fn(), embedBatch: vi.fn().mockResolvedValue([embedding]) };

    const result = await runIngestSweep({
      ingestJobs: repo,
      chunkRepository: chunkRepo,
      embeddings,
      vectorIndex,
      logger: SILENT_LOGGER,
    });

    expect(result).toEqual({ scanned: 1, completed: 1, retried: 0, failed: 0 });
    expect(embeddings.embedBatch).toHaveBeenCalledWith([chunk.content]);
    expect(vectorIndex.deleteByRecordIds).toHaveBeenCalledWith(
      [job.memoryRecordId],
      { organizationId: job.organizationId },
    );
    expect(vectorIndex.upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ id: `chunk:${chunk.id}` })],
    );
    expect(updatePointIds).toHaveBeenCalledWith([
      { chunkId: chunk.id, qdrantPointId: `chunk:${chunk.id}` },
    ]);
    expect(markQdrantCompleted).toHaveBeenCalledWith(job.id);
  });

  it("marks completed and logs when a record has no chunks (deleted between claim and sweep)", async () => {
    const job = makeJob({ id: 2, memoryRecordId: 99 });
    const { repo, markQdrantCompleted } = makeIngestJobRepo([job]);
    const chunkRepo = makeChunkRepo([]); // no chunks
    const vectorIndex = { upsert: vi.fn(), query: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), ensureCollection: vi.fn() };

    const result = await runIngestSweep({
      ingestJobs: repo,
      chunkRepository: chunkRepo,
      embeddings: { embed: vi.fn(), embedBatch: vi.fn() },
      vectorIndex,
      logger: SILENT_LOGGER,
    });

    expect(result).toEqual({ scanned: 1, completed: 1, retried: 0, failed: 0 });
    expect(markQdrantCompleted).toHaveBeenCalledWith(job.id);
    expect(vectorIndex.upsert).not.toHaveBeenCalled();
  });

  it("schedules retry with exponential backoff on transient failure (attempt < maxAttempts)", async () => {
    const fixedNow = new Date("2024-06-01T12:00:00.000Z");
    const job = makeJob({ id: 3, memoryRecordId: 10, qdrantAttempts: 1 });
    const chunk = makeChunk();

    const { repo, markQdrantPending } = makeIngestJobRepo([job]);
    const chunkRepo = makeChunkRepo([chunk]);
    const vectorIndex = {
      upsert: vi.fn().mockRejectedValue(new Error("vector index 503")),
      query: vi.fn(),
      delete: vi.fn(),
      deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
      ensureCollection: vi.fn(),
    };
    const embeddings = { embed: vi.fn(), embedBatch: vi.fn().mockResolvedValue([[0.1]]) };

    const result = await runIngestSweep({
      ingestJobs: repo,
      chunkRepository: chunkRepo,
      embeddings,
      vectorIndex,
      logger: SILENT_LOGGER,
      maxAttempts: 5,
      now: () => fixedNow,
    });

    expect(result).toEqual({ scanned: 1, completed: 0, retried: 1, failed: 0 });

    // nextAttempt = 2, delayMs = 1000 * 2^2 = 4000
    const expectedRetryAt = new Date(fixedNow.getTime() + 4_000);
    expect(markQdrantPending).toHaveBeenCalledWith({
      jobId: job.id,
      attempts: 2,
      nextRetryAt: expectedRetryAt,
      error: expect.any(Error),
    });
  });

  it("marks failed after reaching maxAttempts", async () => {
    const job = makeJob({ id: 4, memoryRecordId: 10, qdrantAttempts: 4 });
    const chunk = makeChunk();

    const { repo, markQdrantFailed } = makeIngestJobRepo([job]);
    const chunkRepo = makeChunkRepo([chunk]);
    const vectorIndex = {
      upsert: vi.fn().mockRejectedValue(new Error("vector index 503")),
      query: vi.fn(),
      delete: vi.fn(),
      deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
      ensureCollection: vi.fn(),
    };
    const embeddings = { embed: vi.fn(), embedBatch: vi.fn().mockResolvedValue([[0.1]]) };

    const result = await runIngestSweep({
      ingestJobs: repo,
      chunkRepository: chunkRepo,
      embeddings,
      vectorIndex,
      logger: SILENT_LOGGER,
      maxAttempts: 5,
    });

    expect(result).toEqual({ scanned: 1, completed: 0, retried: 0, failed: 1 });
    expect(markQdrantFailed).toHaveBeenCalledWith({
      jobId: job.id,
      attempts: 5,
      error: expect.any(Error),
    });
  });

  it("respects custom batchSize by passing it to claimPendingForRetry", async () => {
    const { repo } = makeIngestJobRepo([]);
    const claimSpy = repo.claimPendingForRetry as ReturnType<typeof vi.fn>;
    const chunkRepo = makeChunkRepo([]);

    await runIngestSweep({
      ingestJobs: repo,
      chunkRepository: chunkRepo,
      embeddings: { embed: vi.fn(), embedBatch: vi.fn() },
      vectorIndex: { upsert: vi.fn(), query: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), ensureCollection: vi.fn() },
      logger: SILENT_LOGGER,
      batchSize: 25,
    });

    expect(claimSpy).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25 }),
    );
  });

  it("is idempotent: re-upserting the same chunks with the same point ids is safe", async () => {
    const job = makeJob({ id: 5, memoryRecordId: 10, qdrantAttempts: 0 });
    const chunk = makeChunk({ id: 100 });

    const { repo, markQdrantCompleted } = makeIngestJobRepo([job]);
    const updatePointIds = vi.fn().mockResolvedValue(undefined);
    const chunkRepo = makeChunkRepo([chunk], { updatePointIds });
    const vectorIndex = { upsert: vi.fn().mockResolvedValue(undefined), query: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), ensureCollection: vi.fn() };
    const embeddings = { embed: vi.fn(), embedBatch: vi.fn().mockResolvedValue([[0.5, 0.5]]) };

    // First sweep
    await runIngestSweep({
      ingestJobs: repo,
      chunkRepository: chunkRepo,
      embeddings,
      vectorIndex,
      logger: SILENT_LOGGER,
    });

    // Second sweep (simulating a duplicate run)
    const { repo: repo2, markQdrantCompleted: mark2 } = makeIngestJobRepo([job]);
    await runIngestSweep({
      ingestJobs: repo2,
      chunkRepository: chunkRepo,
      embeddings,
      vectorIndex,
      logger: SILENT_LOGGER,
    });

    // Both calls should complete and produce the same point id
    expect(markQdrantCompleted).toHaveBeenCalledWith(job.id);
    expect(mark2).toHaveBeenCalledWith(job.id);
    expect(vectorIndex.upsert).toHaveBeenCalledTimes(2);
    // Point id is deterministic from chunk id — new signature: upsert(points[])
    const [firstCall, secondCall] = vectorIndex.upsert.mock.calls;
    expect(firstCall[0][0].id).toBe(secondCall[0][0].id);
  });
});
