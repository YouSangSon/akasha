import { describe, expect, it, vi } from "vitest";
import { runIngestSweep } from "../../src/compact/ingest-sweeper.js";
import type { TextChunk } from "../../src/chunk/chunk-text.js";
import {
  createMemoryChunkRepository,
  reindexCanonicalMemory,
  writeCanonicalMemory,
  type ChunkEmbeddingConfig,
  type ReindexableMemoryChunk,
} from "../../src/store/canonical-indexing.js";
import type { MemoryWriteCoordinator, MemoryWriteScope } from "../../src/store/memory-write-coordinator.js";
import type { CanonicalMemoryRepository, IngestJob, ScopeRef, SearchMemoryResult } from "../../src/types.js";

const scopeRef = { scopeType: "project" as const, scopeId: "project-a" };
const now = new Date("2026-10-28T00:00:00.000Z");
const embedding: ChunkEmbeddingConfig = {
  provider: "transformers", model: "local-model", dimensions: 2,
  version: "v1", targetTokens: 100, overlapTokens: 0,
};

function memory(overrides: Partial<SearchMemoryResult> = {}): SearchMemoryResult {
  return {
    ...scopeRef, id: 10, organizationId: "org-a", sourceId: 1,
    memoryType: "fact", content: "alpha beta", durability: "durable",
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
    source: {
      ...scopeRef, id: 1, organizationId: "org-a", sourceType: "document",
      title: null, uri: null, createdAt: now.toISOString(),
    },
    ...overrides,
  };
}

function pendingJob(overrides: Partial<IngestJob> = {}): IngestJob {
  return {
    id: 91, memoryRecordId: 10, organizationId: "org-a", status: "pending",
    attempts: 0, lastError: null, qdrantStatus: "pending", qdrantAttempts: 0,
    qdrantNextRetryAt: now.toISOString(), qdrantLastError: null,
    createdAt: now.toISOString(), updatedAt: now.toISOString(), ...overrides,
  };
}

function storedChunk(record: SearchMemoryResult, id = 100): ReindexableMemoryChunk {
  return {
    id, memoryRecordId: record.id, chunkIndex: 0, content: record.content,
    startOffset: 0, endOffset: record.content.length,
    embeddingProvider: embedding.provider, embeddingModel: embedding.model,
    embeddingDimensions: embedding.dimensions, embeddingVersion: embedding.version,
    organizationId: "org-a", scopeType: record.scopeType, scopeId: record.scopeId,
    projectKey: null, durability: record.durability ?? "ephemeral", kind: record.memoryType,
    updatedAt: record.updatedAt,
  };
}

function recoveryFixture(initialRecords = [memory()]) {
  const records = new Map(initialRecords.map((record) => [record.id, record]));
  const chunks = new Map(initialRecords.map((record) => [record.id, [storedChunk(record, 100 + record.id)]]));
  const jobs = new Map([[91, pendingJob()]]);
  let locked = false;
  let nextChunkId = 1000;
  let nextJobId = 200;
  const hooks = { beforeLock: () => {} };
  const assertLocked = () => expect(locked).toBe(true);
  const repository = {
    listMemoryRecordIdsForIndexing: vi.fn(async (
      organizationId: string, scopes: ScopeRef[],
      options: { afterId?: number; throughId?: number; limit?: number } = {},
    ) => {
      const eligible = [...records.values()].filter((record) =>
        record.organizationId === organizationId && scopes.some((ref) =>
          ref.scopeType === record.scopeType && ref.scopeId === record.scopeId));
      const throughId = options.throughId ?? Math.max(0, ...eligible.map((record) => record.id));
      const ids = eligible.map((record) => record.id)
        .filter((id) => id > (options.afterId ?? 0) && id <= throughId)
        .sort((a, b) => a - b).slice(0, options.limit);
      return { ids, throughId };
    }),
    getMemoryRecordById: vi.fn(async (id: number, _organizationId: string) => {
      assertLocked();
      return records.get(id) ?? null;
    }),
  };
  const ingestJobs = {
    claimPendingForRetry: vi.fn(async () => [pendingJob()]),
    getById: vi.fn(async (id: number, _organizationId: string) => {
      assertLocked();
      return jobs.get(id) ?? null;
    }),
    create: vi.fn(async (input: { memoryRecordId: number; organizationId: string }) => {
      assertLocked();
      const job = pendingJob({ id: nextJobId++, ...input });
      jobs.set(job.id, job);
      return job;
    }),
    markQdrantPending: vi.fn(async () => { assertLocked(); return pendingJob(); }),
    markQdrantFailed: vi.fn(async () => { assertLocked(); return pendingJob(); }),
    markQdrantCompleted: vi.fn(async () => { assertLocked(); return pendingJob(); }),
    markCompleted: vi.fn(async () => { assertLocked(); return pendingJob(); }),
  };
  const chunkRepository = {
    getChunksByRecordId: vi.fn(async (id: number) => {
      assertLocked();
      return chunks.get(id) ?? [];
    }),
    listChunks: vi.fn(),
    replaceChunksForRecordWithPendingIngest: vi.fn(async (input: {
      record: SearchMemoryResult; chunks: TextChunk[]; embedding: ChunkEmbeddingConfig; jobId?: number;
    }) => {
      assertLocked();
      const stored = input.chunks.map((chunk) => ({
        ...storedChunk(input.record, nextChunkId++), ...chunk,
        embeddingProvider: input.embedding.provider, embeddingModel: input.embedding.model,
        embeddingDimensions: input.embedding.dimensions, embeddingVersion: input.embedding.version,
      }));
      chunks.set(input.record.id, stored);
      const job = input.jobId === undefined
        ? pendingJob({ id: nextJobId++, memoryRecordId: input.record.id })
        : jobs.get(input.jobId)!;
      jobs.set(job.id, job);
      return { chunks: stored, job };
    }),
    updatePointIds: vi.fn(async () => { assertLocked(); }),
  };
  const embeddings = {
    embed: vi.fn(),
    embedBatch: vi.fn(async (texts: string[]) => { assertLocked(); return texts.map(() => [0.1, 0.2]); }),
  };
  const vectorIndex = {
    upsert: vi.fn(async () => { assertLocked(); }),
    delete: vi.fn(async () => { assertLocked(); }),
    deleteByRecordIds: vi.fn(async () => { assertLocked(); }),
  };
  const lock = vi.fn(async (
    _organizationId: string, _ids: readonly number[], work: (scope: MemoryWriteScope) => Promise<unknown>,
  ) => {
    hooks.beforeLock();
    locked = true;
    try { return await work(scope); } finally { locked = false; }
  });
  const writes = { record: lock } as unknown as MemoryWriteCoordinator;
  const scope = { repository, chunkRepository, ingestJobs, embeddings, vectorIndex, embedding, writes } as unknown as MemoryWriteScope;
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() };
  return {
    records, chunks, jobs, hooks, lock, writes, scope, repository, chunkRepository, ingestJobs, embeddings, vectorIndex,
    reindex: (batchSize = 1) => reindexCanonicalMemory({
      ...scope, organizationId: " org-a ", scopes: [scopeRef], batchSize,
    }),
    sweep: () => runIngestSweep({ ...scope, logger: logger as never, now: () => now }),
  };
}

function initialWriteFixture() {
  const fixture = recoveryFixture();
  const deleteRecord = vi.fn(async (id: number) => { fixture.records.delete(id); });
  fixture.scope.repository.deleteMemoryRecord = deleteRecord;
  fixture.scope.chunkRepository.insertChunks = vi.fn(async (input: Parameters<MemoryWriteScope["chunkRepository"]["insertChunks"]>[0]) => input.chunks.map((chunk) => ({
    ...storedChunk(input.record), ...chunk,
  })));
  fixture.writes.create = async (_input, work) => fixture.writes.record("org-a", [10],
    (scope) => work(scope, fixture.records.get(10)!, fixture.jobs.get(91)!));
  return {
    ...fixture, deleteRecord,
    write: () => writeCanonicalMemory({
      ...fixture.scope,
      memory: {
        ...scopeRef, organizationId: "org-a", memoryType: "fact", content: "alpha beta",
        source: { ...scopeRef, sourceType: "document" },
      },
    }),
  };
}

describe("initial write recovery intent", () => {
  it("clears the vector retry intent after the final main-job completion", async () => {
    const fixture = initialWriteFixture();

    await expect(fixture.write()).resolves.toEqual(memory());

    expect(fixture.ingestJobs.markCompleted.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.ingestJobs.markQdrantCompleted.mock.invocationCallOrder[0]!,
    );
  });

  it("keeps a pending vector intent when main completion and canonical compensation fail", async () => {
    const fixture = initialWriteFixture();
    const failure = new Error("main completion failed");
    fixture.ingestJobs.markCompleted.mockRejectedValueOnce(failure);
    fixture.deleteRecord.mockRejectedValueOnce(new Error("canonical delete failed"));

    await expect(fixture.write()).rejects.toBe(failure);

    expect(fixture.ingestJobs.markQdrantCompleted).not.toHaveBeenCalled();
    expect(fixture.records.has(10)).toBe(true);
    expect(fixture.jobs.get(91)?.qdrantStatus).toBe("pending");
  });

  it("retains the canonical record and pending job if partial-upsert cleanup fails", async () => {
    const fixture = initialWriteFixture();
    const failure = new Error("upsert interrupted after a partial write");
    fixture.vectorIndex.upsert.mockRejectedValueOnce(failure);
    fixture.vectorIndex.deleteByRecordIds.mockRejectedValueOnce(new Error("cleanup unavailable"));

    await expect(fixture.write()).rejects.toBe(failure);

    expect(fixture.deleteRecord).not.toHaveBeenCalled();
    expect(fixture.records.has(10)).toBe(true);
    expect(fixture.jobs.get(91)?.qdrantStatus).toBe("pending");
    expect(fixture.ingestJobs.markQdrantCompleted).not.toHaveBeenCalled();
  });
});

describe("coordinated canonical reindex", () => {
  it.each([false, true])("arms archived cleanup before deleting vectors (cleanup fails: %s)", async (cleanupFails) => {
    const fixture = recoveryFixture([memory({ durability: "archived" })]);
    const failure = new Error("archived cleanup unavailable");
    if (cleanupFails) fixture.vectorIndex.deleteByRecordIds.mockRejectedValueOnce(failure);

    if (cleanupFails) await expect(fixture.reindex()).rejects.toBe(failure);
    else await expect(fixture.reindex()).resolves.toEqual({ chunkCount: 0 });

    expect(fixture.ingestJobs.create).toHaveBeenCalledExactlyOnceWith({ memoryRecordId: 10, organizationId: "org-a" });
    const job = fixture.ingestJobs.create.mock.results[0]!;
    const created = await job.value;
    expect(fixture.ingestJobs.markQdrantPending).toHaveBeenCalledExactlyOnceWith({
      jobId: created.id, attempts: 0, nextRetryAt: expect.any(Date),
    });
    expect(fixture.ingestJobs.markQdrantPending.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.vectorIndex.deleteByRecordIds.mock.invocationCallOrder[0]!,
    );
    expect(fixture.embeddings.embedBatch).not.toHaveBeenCalled();
    if (cleanupFails) {
      expect(fixture.ingestJobs.markCompleted).not.toHaveBeenCalled();
      expect(fixture.ingestJobs.markQdrantCompleted).not.toHaveBeenCalled();
      expect(fixture.jobs.get(created.id)?.qdrantStatus).toBe("pending");
    } else {
      expect(fixture.ingestJobs.markCompleted).toHaveBeenCalledExactlyOnceWith(created.id);
      expect(fixture.ingestJobs.markQdrantCompleted).toHaveBeenCalledExactlyOnceWith(created.id);
      expect(fixture.ingestJobs.markCompleted.mock.invocationCallOrder[0]).toBeLessThan(
        fixture.ingestJobs.markQdrantCompleted.mock.invocationCallOrder[0]!,
      );
    }
  });

  it("keeps unchanged chunk IDs and creates a retry intent before vector cleanup", async () => {
    const fixture = recoveryFixture();
    const original = fixture.chunks.get(10)![0]!;

    await expect(fixture.reindex()).resolves.toEqual({ chunkCount: 1 });

    expect(fixture.chunkRepository.replaceChunksForRecordWithPendingIngest).not.toHaveBeenCalled();
    expect(fixture.ingestJobs.create).toHaveBeenCalledExactlyOnceWith({ memoryRecordId: 10, organizationId: "org-a" });
    expect(fixture.ingestJobs.markQdrantPending.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.vectorIndex.deleteByRecordIds.mock.invocationCallOrder[0]!,
    );
    expect(fixture.chunkRepository.updatePointIds).toHaveBeenCalledWith([
      { chunkId: original.id, qdrantPointId: expect.any(String) },
    ]);
    expect(fixture.chunkRepository.listChunks).not.toHaveBeenCalled();
    expect(fixture.lock).toHaveBeenCalledWith("org-a", [10], expect.any(Function));
  });

  it("repairs legacy layout and metadata using record pages pinned to the initial cutoff", async () => {
    const fixture = recoveryFixture([memory(), memory({ id: 20 })]);
    fixture.chunks.get(10)![0]!.embeddingModel = "previous-model";
    fixture.chunks.get(20)![0]!.content = "legacy layout";
    fixture.hooks.beforeLock = () => fixture.records.set(30, memory({ id: 30 }));

    await expect(fixture.reindex()).resolves.toEqual({ chunkCount: 2 });

    expect(fixture.repository.listMemoryRecordIdsForIndexing.mock.calls).toEqual([
      ["org-a", [scopeRef], { afterId: undefined, throughId: undefined, limit: 1 }],
      ["org-a", [scopeRef], { afterId: 10, throughId: 20, limit: 1 }],
    ]);
    expect(fixture.lock.mock.calls.map((call) => call[1])).toEqual([[10], [20]]);
    expect(fixture.chunkRepository.replaceChunksForRecordWithPendingIngest).toHaveBeenCalledTimes(2);
    expect(fixture.chunks.get(10)![0]!.id).toBeGreaterThan(1000 - 1);
    expect(fixture.chunks.get(10)![0]!.embeddingModel).toBe(embedding.model);
    expect(fixture.chunks.get(20)![0]!.content).toBe("alpha beta");
    expect(fixture.chunkRepository.listChunks).not.toHaveBeenCalled();
  });

  it.each(["missing", "organization", "scope", "archived"])(
    "rereads %s canonical state after acquiring the record lock", async (state) => {
      const fixture = recoveryFixture();
      fixture.hooks.beforeLock = () => {
        if (state === "missing") fixture.records.delete(10);
        else fixture.records.set(10, memory({
          ...(state === "organization" ? { organizationId: "org-b" } : {}),
          ...(state === "scope" ? { scopeId: "another-project" } : {}),
          ...(state === "archived" ? { durability: "archived" as const } : {}),
        }));
      };

      await expect(fixture.reindex()).resolves.toEqual({ chunkCount: 0 });

      expect(fixture.embeddings.embedBatch).not.toHaveBeenCalled();
      expect(fixture.vectorIndex.upsert).not.toHaveBeenCalled();
      if (state === "archived") {
        expect(fixture.vectorIndex.deleteByRecordIds).toHaveBeenCalledExactlyOnceWith([10], { organizationId: "org-a" });
      } else expect(fixture.vectorIndex.deleteByRecordIds).not.toHaveBeenCalled();
    },
  );

  it("requires canonical pagination when a coordinator is supplied", async () => {
    const fixture = recoveryFixture();
    await expect(reindexCanonicalMemory({
      ...fixture.scope, repository: {} as CanonicalMemoryRepository,
      organizationId: "org-a", scopes: [scopeRef],
    })).rejects.toThrow("record-ID pagination");
    expect(fixture.lock).not.toHaveBeenCalled();
  });
});

describe("coordinated ingest recovery", () => {
  it.each(["completed", "deleted", "organization", "record", "id"])(
    "skips a %s stale claim without resurrecting or marking the job", async (state) => {
      const fixture = recoveryFixture();
      fixture.hooks.beforeLock = () => {
        if (state === "deleted") fixture.jobs.delete(91);
        else fixture.jobs.set(91, pendingJob({
          ...(state === "completed" ? { qdrantStatus: "completed" as const } : {}),
          ...(state === "organization" ? { organizationId: "org-b" } : {}),
          ...(state === "record" ? { memoryRecordId: 20 } : {}),
          ...(state === "id" ? { id: 92 } : {}),
        }));
      };

      await expect(fixture.sweep()).resolves.toEqual({ scanned: 1, completed: 0, retried: 0, failed: 0 });

      expect(fixture.ingestJobs.getById).toHaveBeenCalledExactlyOnceWith(91, "org-a");
      expect(fixture.repository.getMemoryRecordById).not.toHaveBeenCalled();
      expect(fixture.vectorIndex.deleteByRecordIds).not.toHaveBeenCalled();
      expect(fixture.ingestJobs.markQdrantPending).not.toHaveBeenCalled();
      expect(fixture.ingestJobs.markQdrantFailed).not.toHaveBeenCalled();
      expect(fixture.ingestJobs.markQdrantCompleted).not.toHaveBeenCalled();
    },
  );

  it("rebuilds chunkless canonical records with the current job after crash-after-create", async () => {
    const fixture = recoveryFixture();
    fixture.chunks.delete(10);

    await expect(fixture.sweep()).resolves.toEqual({ scanned: 1, completed: 1, retried: 0, failed: 0 });

    expect(fixture.chunkRepository.replaceChunksForRecordWithPendingIngest).toHaveBeenCalledWith(
      expect.objectContaining({ record: memory(), jobId: 91 }),
    );
    expect(fixture.vectorIndex.upsert).toHaveBeenCalledOnce();
    expect(fixture.ingestJobs.create).not.toHaveBeenCalled();
    expect(fixture.ingestJobs.markQdrantCompleted).toHaveBeenCalledExactlyOnceWith(91);
    expect(fixture.ingestJobs.markCompleted).toHaveBeenCalledExactlyOnceWith(91);
  });

  it("cleans archived records by organization and record even when chunks are absent", async () => {
    const fixture = recoveryFixture([memory({ durability: "archived" })]);
    fixture.chunks.delete(10);

    await expect(fixture.sweep()).resolves.toEqual({ scanned: 1, completed: 1, retried: 0, failed: 0 });

    expect(fixture.vectorIndex.deleteByRecordIds).toHaveBeenCalledExactlyOnceWith([10], { organizationId: "org-a" });
    expect(fixture.embeddings.embedBatch).not.toHaveBeenCalled();
    expect(fixture.vectorIndex.upsert).not.toHaveBeenCalled();
    expect(fixture.ingestJobs.markQdrantCompleted).toHaveBeenCalledExactlyOnceWith(91);
  });

  it.each([
    { embeddingProvider: "openai" }, { embeddingModel: "old-model" },
    { embeddingDimensions: 3 }, { embeddingVersion: "old-version" },
    { embeddingModel: undefined },
  ])("rejects incompatible stored metadata before embedding or vector deletion: %j", async (metadata) => {
    const fixture = recoveryFixture();
    Object.assign(fixture.chunks.get(10)![0]!, metadata);

    await expect(fixture.sweep()).resolves.toEqual({ scanned: 1, completed: 0, retried: 1, failed: 0 });

    expect(fixture.embeddings.embedBatch).not.toHaveBeenCalled();
    expect(fixture.vectorIndex.deleteByRecordIds).not.toHaveBeenCalled();
    expect(fixture.ingestJobs.markQdrantPending).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ jobId: 91, attempts: 1, error: expect.objectContaining({ message: expect.stringContaining("reindex_memory") }) }),
    );
  });

  it("repairs a same-configuration legacy overlong chunk and reuses its pending job", async () => {
    const fixture = recoveryFixture([memory({ content: "abcdefghi" })]);
    fixture.scope.embeddings.getChunkingTokenizer = async () => ({
      maxInputTokens: 5, countTokens: (text, special) => text.length + (special ? 2 : 0),
    });

    await expect(fixture.sweep()).resolves.toEqual({ scanned: 1, completed: 1, retried: 0, failed: 0 });

    const embedded = fixture.embeddings.embedBatch.mock.calls[0]![0];
    expect(embedded.join("")).toBe("abcdefghi");
    expect(embedded.every((text) => text.length + 2 <= 5)).toBe(true);
    expect(fixture.chunkRepository.replaceChunksForRecordWithPendingIngest).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 91 }),
    );
    expect(fixture.ingestJobs.create).not.toHaveBeenCalled();
    expect(fixture.ingestJobs.markQdrantPending).not.toHaveBeenCalled();
  });

  it("keeps stable IDs when only the main ingest status is completed and the vector intent is pending", async () => {
    const fixture = recoveryFixture();
    fixture.jobs.set(91, pendingJob({ status: "completed" }));
    const originalId = fixture.chunks.get(10)![0]!.id;

    await expect(fixture.sweep()).resolves.toEqual({ scanned: 1, completed: 1, retried: 0, failed: 0 });

    expect(fixture.chunkRepository.replaceChunksForRecordWithPendingIngest).not.toHaveBeenCalled();
    expect(fixture.chunkRepository.updatePointIds).toHaveBeenCalledWith([
      { chunkId: originalId, qdrantPointId: expect.any(String) },
    ]);
  });

  it("increments the current attempts exactly once and marks under the same record lock", async () => {
    const fixture = recoveryFixture();
    fixture.hooks.beforeLock = () => fixture.jobs.set(91, pendingJob({ qdrantAttempts: 2 }));
    fixture.vectorIndex.upsert.mockRejectedValueOnce(new Error("vector unavailable"));

    await expect(fixture.sweep()).resolves.toEqual({ scanned: 1, completed: 0, retried: 1, failed: 0 });

    expect(fixture.ingestJobs.markQdrantPending).toHaveBeenCalledExactlyOnceWith({
      jobId: 91, attempts: 3, nextRetryAt: new Date(now.getTime() + 8000), error: expect.any(Error),
    });
    expect(fixture.ingestJobs.markQdrantFailed).not.toHaveBeenCalled();
  });

  it("rejects invalid vectors before deleting the current record vectors", async () => {
    const fixture = recoveryFixture();
    fixture.embeddings.embedBatch.mockResolvedValueOnce([[Number.NaN, 0.2]]);

    await expect(fixture.sweep()).resolves.toEqual({ scanned: 1, completed: 0, retried: 1, failed: 0 });

    expect(fixture.vectorIndex.deleteByRecordIds).not.toHaveBeenCalled();
    expect(fixture.ingestJobs.markQdrantPending).toHaveBeenCalledOnce();
  });
});

describe("pending ingest replacement validation", () => {
  it.each([false, true])("reuses only the org-scoped pending job and rolls back a stale job (stale: %s)", async (stale) => {
    const client = {
      query: vi.fn(async (sql: string) => ({
        rows: sql.includes("UPDATE ingest_jobs") && !stale ? [{ id: "91", qdrant_attempts: "2" }] : [],
      })),
      release: vi.fn(),
    };
    const pool = { query: vi.fn(), connect: vi.fn().mockResolvedValue(client) };
    const repository = createMemoryChunkRepository(pool as never);
    const replacement = repository.replaceChunksForRecordWithPendingIngest!({
      record: memory(), chunks: [], embedding, nextRetryAt: now, jobId: 91,
    });

    if (stale) {
      await expect(replacement).rejects.toThrow("ingest job");
      expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
    } else {
      await expect(replacement).resolves.toEqual({ chunks: [], job: { id: 91, qdrantAttempts: 2 } });
      expect(client.query).toHaveBeenLastCalledWith("COMMIT");
    }
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = $1 AND memory_record_id = $2 AND organization_id = $3"),
      [91, 10, "org-a", now],
    );
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("AND qdrant_status = 'pending'"), expect.any(Array));
    expect(client.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO ingest_jobs"))).toBe(false);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid reused job IDs before connecting: %s", async (jobId) => {
      const pool = { query: vi.fn(), connect: vi.fn() };
      const repository = createMemoryChunkRepository(pool as never);

      await expect(repository.replaceChunksForRecordWithPendingIngest!({
        record: memory(), chunks: [], embedding, nextRetryAt: now, jobId,
      })).rejects.toThrow("jobId must be a positive safe integer");

      expect(pool.connect).not.toHaveBeenCalled();
      expect(pool.query).not.toHaveBeenCalled();
    },
  );
});
