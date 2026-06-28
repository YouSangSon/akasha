import { describe, expect, it, vi } from "vitest";
import {
  createMemoryChunkRepository,
  reindexCanonicalMemory,
  writeCanonicalMemory,
} from "../../src/store/canonical-indexing.js";
import { SecretDetectedError } from "../../src/store/secret-scrub.js";
import type { TextChunk } from "../../src/chunk/chunk-text.js";
import type { SearchMemoryResult } from "../../src/types.js";

const exampleAwsAccessKey = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
const exampleGitHubToken = [
  "ghp",
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
].join("_");

describe("canonical indexing", () => {
  it("rejects whitespace-only canonical memory content before persistence side effects", async () => {
    const repository = {
      addMemory: vi.fn(),
    };

    await expect(
      writeCanonicalMemory({
        repository: repository as never,
        chunkRepository: {} as never,
        ingestJobs: {} as never,
        embeddings: {} as never,
        vectorIndex: {} as never,
        embedding: {
          provider: "openai",
          model: "text-embedding-3-small",
          dimensions: 1536,
          version: "v1",
          targetTokens: 2,
          overlapTokens: 1,
        },
        memory: {
          scopeType: "project",
          scopeId: "project-alpha",
          projectKey: "project-alpha",
          memoryType: "decision",
          content: " \n\t ",
          source: {
            scopeType: "project",
            scopeId: "project-alpha",
            sourceType: "conversation",
            sourceRef: "manual://session",
          },
        },
      }),
    ).rejects.toThrow(/non-whitespace text/);

    expect(repository.addMemory).not.toHaveBeenCalled();
  });

  it("writes chunks, embeddings, ingest jobs, and qdrant points for a canonical memory", async () => {
    const record = createRecord({
      id: 501,
      content: "one two three four",
    });
    const repository = {
      addMemory: vi.fn().mockResolvedValue(record),
    };
    const ingestJobs = {
      create: vi.fn().mockResolvedValue({
        id: 801,
      }),
      markCompleted: vi.fn().mockResolvedValue({
        id: 801,
        status: "completed",
      }),
      markQdrantPending: vi.fn().mockResolvedValue(undefined),
      markQdrantCompleted: vi.fn().mockResolvedValue(undefined),
    };
    const chunkRepository = {
      insertChunks: vi.fn().mockImplementation(async (input: {
        chunks: TextChunk[];
        record: SearchMemoryResult;
        embedding: { version: string };
      }) =>
        input.chunks.map((chunk: TextChunk, index: number) => ({
          id: 701 + index,
          memoryRecordId: input.record.id,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          embeddingVersion: input.embedding.version,
        }))
      ),
      updatePointIds: vi.fn().mockResolvedValue(undefined),
    };
    const embeddings = {
      embed: vi.fn(),
      // F4: writeCanonicalMemory now batches per-chunk embeddings into one
      // embedBatch call. Mock returns the 3-vector batch in chunk order.
      embedBatch: vi
        .fn()
        .mockResolvedValue([
          [0.1, 0.2],
          [0.3, 0.4],
          [0.5, 0.6],
        ]),
    };
    const vectorIndex = {
      upsert: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(),
      delete: vi.fn(),
      deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
      ensureCollection: vi.fn(),
    };

    const created = await writeCanonicalMemory({
      repository: repository as never,
      chunkRepository: chunkRepository as never,
      ingestJobs: ingestJobs as never,
      embeddings,
      vectorIndex,
      embedding: {
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 1536,
        version: "v1",
        targetTokens: 2,
        overlapTokens: 1,
      },
      memory: {
        scopeType: "project",
        scopeId: "project-alpha",
        projectKey: "project-alpha",
        memoryType: "decision",
        content: record.content,
        source: {
          scopeType: "project",
          scopeId: "project-alpha",
          sourceType: "conversation",
          sourceRef: "manual://session",
        },
      },
    });

    expect(created).toBe(record);
    expect(repository.addMemory).toHaveBeenCalledOnce();
    expect(ingestJobs.create).toHaveBeenCalledWith({
      memoryRecordId: 501,
      organizationId: "default",
    });
    expect(chunkRepository.insertChunks).toHaveBeenCalledOnce();
    // Single batch call replaces three sequential embed() calls.
    expect(embeddings.embedBatch).toHaveBeenCalledOnce();
    expect(embeddings.embedBatch).toHaveBeenCalledWith([
      "one two",
      "two three",
      "three four",
    ]);
    expect(vectorIndex.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "chunk:701" }),
        expect.objectContaining({ id: "chunk:702" }),
        expect.objectContaining({ id: "chunk:703" }),
      ]),
    );
    expect(chunkRepository.updatePointIds).toHaveBeenCalledWith([
      { chunkId: 701, qdrantPointId: "chunk:701" },
      { chunkId: 702, qdrantPointId: "chunk:702" },
      { chunkId: 703, qdrantPointId: "chunk:703" },
    ]);
    expect(ingestJobs.markCompleted).toHaveBeenCalledWith(801);

    // Part 5 outbox write-ahead: markQdrantPending fires after insertChunks and
    // before vectorIndex.upsert; markQdrantCompleted fires after updatePointIds.
    const pendingOrder = ingestJobs.markQdrantPending.mock.invocationCallOrder[0]!;
    const upsertOrder = vectorIndex.upsert.mock.invocationCallOrder[0]!;
    const updateOrder = chunkRepository.updatePointIds.mock.invocationCallOrder[0]!;
    const completedOrder = ingestJobs.markQdrantCompleted.mock.invocationCallOrder[0]!;
    expect(pendingOrder).toBeLessThan(upsertOrder);
    expect(updateOrder).toBeLessThan(completedOrder);

    expect(ingestJobs.markQdrantPending).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 801,
        attempts: 0,
        nextRetryAt: expect.any(Date),
      }),
    );
    expect(ingestJobs.markQdrantCompleted).toHaveBeenCalledWith(801);
  });

  it("rolls back PG state by deleting the memory record when embedding throws", async () => {
    const record = createRecord({ id: 502, content: "fail path content" });
    const repository = {
      addMemory: vi.fn().mockResolvedValue(record),
      deleteMemoryRecord: vi.fn().mockResolvedValue(undefined),
    };
    const ingestJobs = {
      create: vi.fn().mockResolvedValue({ id: 802 }),
      markCompleted: vi.fn(),
      markFailed: vi.fn(),
      markQdrantPending: vi.fn().mockResolvedValue(undefined),
      markQdrantCompleted: vi.fn(),
    };
    const chunkRepository = {
      insertChunks: vi.fn().mockResolvedValue([
        {
          id: 901,
          memoryRecordId: 502,
          chunkIndex: 0,
          content: "fail path content",
          startOffset: 0,
          endOffset: 17,
          embeddingVersion: "v1",
        },
      ]),
      updatePointIds: vi.fn(),
    };
    const embedError = new Error("OpenAI 429");
    const embeddings = {
      embed: vi.fn(),
      embedBatch: vi.fn().mockRejectedValue(embedError),
    };
    const vectorIndex = { upsert: vi.fn(), query: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), ensureCollection: vi.fn() };

    await expect(
      writeCanonicalMemory({
        repository: repository as never,
        chunkRepository: chunkRepository as never,
        ingestJobs: ingestJobs as never,
        embeddings,
        vectorIndex,
        embedding: {
          provider: "openai",
          model: "text-embedding-3-small",
          dimensions: 1536,
          version: "v1",
          targetTokens: 2,
          overlapTokens: 1,
        },
        memory: {
          scopeType: "project",
          scopeId: "project-alpha",
          projectKey: "project-alpha",
          memoryType: "decision",
          content: record.content,
          source: {
            scopeType: "project",
            scopeId: "project-alpha",
            sourceType: "conversation",
            sourceRef: "manual://session",
          },
        },
      }),
    ).rejects.toBe(embedError);

    // Cascade-delete (memory_chunks, ingest_jobs, relationships) is handled
    // at the schema layer; the repository call is the single rollback action.
    expect(repository.deleteMemoryRecord).toHaveBeenCalledWith(502, "default");
    expect(ingestJobs.markCompleted).not.toHaveBeenCalled();
    expect(vectorIndex.upsert).not.toHaveBeenCalled();
  });

  it("rolls back PG state by deleting the memory record when qdrant upsert throws", async () => {
    const record = createRecord({ id: 503, content: "qdrant fail content" });
    const repository = {
      addMemory: vi.fn().mockResolvedValue(record),
      deleteMemoryRecord: vi.fn().mockResolvedValue(undefined),
    };
    const ingestJobs = {
      create: vi.fn().mockResolvedValue({ id: 803 }),
      markCompleted: vi.fn(),
      markFailed: vi.fn(),
      markQdrantPending: vi.fn().mockResolvedValue(undefined),
      markQdrantCompleted: vi.fn(),
    };
    const chunkRepository = {
      insertChunks: vi.fn().mockResolvedValue([
        {
          id: 902,
          memoryRecordId: 503,
          chunkIndex: 0,
          content: "qdrant fail content",
          startOffset: 0,
          endOffset: 19,
          embeddingVersion: "v1",
        },
      ]),
      updatePointIds: vi.fn(),
    };
    const embeddings = {
      embed: vi.fn().mockResolvedValue([0.1, 0.2]),
      // F4 cascade: writeCanonicalMemory now batches embeddings via embedBatch
      // instead of Promise.all(map(embed)). The qdrant-failure scenario needs
      // a successful batch result so we reach the upsert step that throws.
      embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2]]),
    };
    const upsertError = new Error("Qdrant 503 service unavailable");
    const vectorIndex = {
      upsert: vi.fn().mockRejectedValue(upsertError),
      query: vi.fn(),
      delete: vi.fn(),
      deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
      ensureCollection: vi.fn(),
    };

    await expect(
      writeCanonicalMemory({
        repository: repository as never,
        chunkRepository: chunkRepository as never,
        ingestJobs: ingestJobs as never,
        embeddings,
        vectorIndex,
        embedding: {
          provider: "openai",
          model: "text-embedding-3-small",
          dimensions: 1536,
          version: "v1",
          targetTokens: 800,
          overlapTokens: 120,
        },
        memory: {
          scopeType: "project",
          scopeId: "project-alpha",
          projectKey: "project-alpha",
          memoryType: "decision",
          content: record.content,
          source: {
            scopeType: "project",
            scopeId: "project-alpha",
            sourceType: "conversation",
            sourceRef: "manual://session",
          },
        },
      }),
    ).rejects.toBe(upsertError);

    expect(repository.deleteMemoryRecord).toHaveBeenCalledWith(503, "default");
    expect(ingestJobs.markCompleted).not.toHaveBeenCalled();
    // Qdrant upsert was attempted (and failed); updatePointIds must NOT run.
    expect(chunkRepository.updatePointIds).not.toHaveBeenCalled();
  });

  it("deletes upserted vector points when updating chunk point ids fails", async () => {
    const record = createRecord({ id: 506, content: "post upsert sql failure" });
    const updateError = new Error("PG update failed");
    const repository = {
      addMemory: vi.fn().mockResolvedValue(record),
      deleteMemoryRecord: vi.fn().mockResolvedValue(undefined),
    };
    const ingestJobs = {
      create: vi.fn().mockResolvedValue({ id: 806 }),
      markCompleted: vi.fn(),
      markFailed: vi.fn(),
      markQdrantPending: vi.fn().mockResolvedValue(undefined),
      markQdrantCompleted: vi.fn(),
    };
    const chunkRepository = {
      insertChunks: vi.fn().mockResolvedValue([
        {
          id: 904,
          memoryRecordId: 506,
          chunkIndex: 0,
          content: "post upsert sql failure",
          startOffset: 0,
          endOffset: 23,
          embeddingVersion: "v1",
        },
      ]),
      updatePointIds: vi.fn().mockRejectedValue(updateError),
    };
    const embeddings = {
      embed: vi.fn(),
      embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2]]),
    };
    const vectorIndex = {
      upsert: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
      ensureCollection: vi.fn(),
    };

    await expect(
      writeCanonicalMemory({
        repository: repository as never,
        chunkRepository: chunkRepository as never,
        ingestJobs: ingestJobs as never,
        embeddings,
        vectorIndex,
        embedding: {
          provider: "openai",
          model: "text-embedding-3-small",
          dimensions: 1536,
          version: "v1",
          targetTokens: 800,
          overlapTokens: 120,
        },
        memory: {
          scopeType: "project",
          scopeId: "project-alpha",
          projectKey: "project-alpha",
          memoryType: "decision",
          content: record.content,
          source: {
            scopeType: "project",
            scopeId: "project-alpha",
            sourceType: "conversation",
            sourceRef: "manual://session",
          },
        },
      }),
    ).rejects.toBe(updateError);

    expect(vectorIndex.upsert).toHaveBeenCalledOnce();
    expect(vectorIndex.delete).toHaveBeenCalledWith(["chunk:904"]);
    expect(repository.deleteMemoryRecord).toHaveBeenCalledWith(506, "default");
    expect(ingestJobs.markQdrantCompleted).not.toHaveBeenCalled();
    expect(ingestJobs.markCompleted).not.toHaveBeenCalled();
  });

  it("re-throws the original error when rollback delete itself fails (best-effort cleanup)", async () => {
    const record = createRecord({ id: 504, content: "double-fail content" });
    const cleanupError = new Error("PG connection lost during rollback");
    const repository = {
      addMemory: vi.fn().mockResolvedValue(record),
      // Cleanup also fails — exercise the best-effort .catch() path that
      // must NOT mask the original failure that triggered the rollback.
      deleteMemoryRecord: vi.fn().mockRejectedValue(cleanupError),
    };
    const ingestJobs = {
      create: vi.fn().mockResolvedValue({ id: 804 }),
      markCompleted: vi.fn(),
      markFailed: vi.fn(),
      markQdrantPending: vi.fn().mockResolvedValue(undefined),
      markQdrantCompleted: vi.fn(),
    };
    const chunkRepository = {
      insertChunks: vi.fn().mockResolvedValue([
        {
          id: 903,
          memoryRecordId: 504,
          chunkIndex: 0,
          content: "double-fail content",
          startOffset: 0,
          endOffset: 19,
          embeddingVersion: "v1",
        },
      ]),
      updatePointIds: vi.fn(),
    };
    const embedError = new Error("OpenAI 500");
    const embeddings = {
      embed: vi.fn().mockRejectedValue(embedError),
      // F4 cascade: production code calls embedBatch — that's the path that
      // must reject for this test to exercise the rollback-on-failure case.
      embedBatch: vi.fn().mockRejectedValue(embedError),
    };
    const vectorIndex = { upsert: vi.fn(), query: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), ensureCollection: vi.fn() };

    await expect(
      writeCanonicalMemory({
        repository: repository as never,
        chunkRepository: chunkRepository as never,
        ingestJobs: ingestJobs as never,
        embeddings,
        vectorIndex,
        embedding: {
          provider: "openai",
          model: "text-embedding-3-small",
          dimensions: 1536,
          version: "v1",
          targetTokens: 2,
          overlapTokens: 1,
        },
        memory: {
          scopeType: "project",
          scopeId: "project-alpha",
          projectKey: "project-alpha",
          memoryType: "decision",
          content: record.content,
          source: {
            scopeType: "project",
            scopeId: "project-alpha",
            sourceType: "conversation",
            sourceRef: "manual://session",
          },
        },
      }),
      // Caller must see the *original* embedError, not the cleanupError.
    ).rejects.toBe(embedError);

    expect(repository.deleteMemoryRecord).toHaveBeenCalledWith(504, "default");
  });

  it("skips write-ahead and qdrant upsert when insertChunks returns an empty array", async () => {
    const record = createRecord({ id: 505, content: "nonblank content" });
    const repository = {
      addMemory: vi.fn().mockResolvedValue(record),
    };
    const ingestJobs = {
      create: vi.fn().mockResolvedValue({ id: 805 }),
      markCompleted: vi.fn().mockResolvedValue({ id: 805, status: "completed" }),
      markQdrantPending: vi.fn(),
      markQdrantCompleted: vi.fn(),
    };
    const chunkRepository = {
      insertChunks: vi.fn().mockResolvedValue([]),
      updatePointIds: vi.fn(),
    };
    const embeddings = {
      embed: vi.fn(),
      embedBatch: vi.fn().mockResolvedValue([]),
    };
    const vectorIndex = { upsert: vi.fn(), query: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), ensureCollection: vi.fn() };

    const created = await writeCanonicalMemory({
      repository: repository as never,
      chunkRepository: chunkRepository as never,
      ingestJobs: ingestJobs as never,
      embeddings,
      vectorIndex,
      embedding: {
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 1536,
        version: "v1",
        targetTokens: 800,
        overlapTokens: 120,
      },
      memory: {
        scopeType: "project",
        scopeId: "project-alpha",
        projectKey: "project-alpha",
        memoryType: "decision",
        content: record.content,
        source: {
          scopeType: "project",
          scopeId: "project-alpha",
          sourceType: "conversation",
          sourceRef: "manual://session",
        },
      },
    });

    expect(created).toBe(record);
    // No chunks → no write-ahead, no vector writes.
    expect(ingestJobs.markQdrantPending).not.toHaveBeenCalled();
    expect(vectorIndex.upsert).not.toHaveBeenCalled();
    expect(ingestJobs.markQdrantCompleted).not.toHaveBeenCalled();
    // Overall job is still closed out.
    expect(ingestJobs.markCompleted).toHaveBeenCalledWith(805);
  });

  it("refuses to persist content matching a credential pattern (no record, no chunks, no qdrant write)", async () => {
    const repository = {
      addMemory: vi.fn(),
    };
    const ingestJobs = {
      create: vi.fn(),
      markCompleted: vi.fn(),
      markFailed: vi.fn(),
    };
    const chunkRepository = {
      insertChunks: vi.fn(),
      updatePointIds: vi.fn(),
    };
    const embeddings = { embed: vi.fn(), embedBatch: vi.fn() };
    const vectorIndex = { upsert: vi.fn(), query: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), ensureCollection: vi.fn() };

    await expect(
      writeCanonicalMemory({
        repository: repository as never,
        chunkRepository: chunkRepository as never,
        ingestJobs: ingestJobs as never,
        embeddings,
        vectorIndex,
        embedding: {
          provider: "openai",
          model: "text-embedding-3-small",
          dimensions: 1536,
          version: "v1",
          targetTokens: 800,
          overlapTokens: 120,
        },
        memory: {
          scopeType: "project",
          scopeId: "project-alpha",
          projectKey: "project-alpha",
          memoryType: "decision",
          // Synthetic AWS access key (canonical AWS docs example, not a real key).
          content:
            `Decision: rotate AWS access key ${exampleAwsAccessKey} next week.`,
          source: {
            scopeType: "project",
            scopeId: "project-alpha",
            sourceType: "conversation",
            sourceRef: "manual://session",
          },
        },
      }),
    ).rejects.toBeInstanceOf(SecretDetectedError);

    expect(repository.addMemory).not.toHaveBeenCalled();
    expect(ingestJobs.create).not.toHaveBeenCalled();
    expect(chunkRepository.insertChunks).not.toHaveBeenCalled();
    expect(vectorIndex.upsert).not.toHaveBeenCalled();
  });

  it("refuses to persist a secret in the title field (mirrors the content guard)", async () => {
    const repository = { addMemory: vi.fn() };
    const ingestJobs = {
      create: vi.fn(),
      markCompleted: vi.fn(),
      markFailed: vi.fn(),
    };
    const chunkRepository = {
      insertChunks: vi.fn(),
      updatePointIds: vi.fn(),
    };
    const embeddings = { embed: vi.fn(), embedBatch: vi.fn() };
    const vectorIndex = { upsert: vi.fn(), query: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), ensureCollection: vi.fn() };

    await expect(
      writeCanonicalMemory({
        repository: repository as never,
        chunkRepository: chunkRepository as never,
        ingestJobs: ingestJobs as never,
        embeddings,
        vectorIndex,
        embedding: {
          provider: "openai",
          model: "text-embedding-3-small",
          dimensions: 1536,
          version: "v1",
          targetTokens: 800,
          overlapTokens: 120,
        },
        memory: {
          scopeType: "project",
          scopeId: "project-alpha",
          projectKey: "project-alpha",
          memoryType: "decision",
          // Synthetic AWS access key (canonical AWS docs example) in title.
          title: `rotate key ${exampleAwsAccessKey}`,
          content: "see title for the rotation target.",
          source: {
            scopeType: "project",
            scopeId: "project-alpha",
            sourceType: "conversation",
            sourceRef: "manual://session",
          },
        },
      }),
    ).rejects.toBeInstanceOf(SecretDetectedError);

    expect(repository.addMemory).not.toHaveBeenCalled();
    expect(ingestJobs.create).not.toHaveBeenCalled();
    expect(chunkRepository.insertChunks).not.toHaveBeenCalled();
    expect(vectorIndex.upsert).not.toHaveBeenCalled();
  });

  it("refuses to persist a secret in the summary field (mirrors the content guard)", async () => {
    const repository = { addMemory: vi.fn() };
    const ingestJobs = {
      create: vi.fn(),
      markCompleted: vi.fn(),
      markFailed: vi.fn(),
    };
    const chunkRepository = {
      insertChunks: vi.fn(),
      updatePointIds: vi.fn(),
    };
    const embeddings = { embed: vi.fn(), embedBatch: vi.fn() };
    const vectorIndex = { upsert: vi.fn(), query: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), ensureCollection: vi.fn() };

    await expect(
      writeCanonicalMemory({
        repository: repository as never,
        chunkRepository: chunkRepository as never,
        ingestJobs: ingestJobs as never,
        embeddings,
        vectorIndex,
        embedding: {
          provider: "openai",
          model: "text-embedding-3-small",
          dimensions: 1536,
          version: "v1",
          targetTokens: 800,
          overlapTokens: 120,
        },
        memory: {
          scopeType: "project",
          scopeId: "project-alpha",
          projectKey: "project-alpha",
          memoryType: "decision",
          content: "Plan: rotate the demo key noted in the summary.",
          // Synthetic GitHub PAT (placeholder shape) in summary.
          summary: `Token to rotate: ${exampleGitHubToken}.`,
          source: {
            scopeType: "project",
            scopeId: "project-alpha",
            sourceType: "conversation",
            sourceRef: "manual://session",
          },
        },
      }),
    ).rejects.toBeInstanceOf(SecretDetectedError);

    expect(repository.addMemory).not.toHaveBeenCalled();
    expect(ingestJobs.create).not.toHaveBeenCalled();
    expect(chunkRepository.insertChunks).not.toHaveBeenCalled();
    expect(vectorIndex.upsert).not.toHaveBeenCalled();
  });

  it("reports categories from every field that contains a secret (title + summary together)", async () => {
    const repository = { addMemory: vi.fn() };
    const ingestJobs = {
      create: vi.fn(),
      markCompleted: vi.fn(),
      markFailed: vi.fn(),
    };
    const chunkRepository = {
      insertChunks: vi.fn(),
      updatePointIds: vi.fn(),
    };
    const embeddings = { embed: vi.fn(), embedBatch: vi.fn() };
    const vectorIndex = { upsert: vi.fn(), query: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), ensureCollection: vi.fn() };

    let caught: unknown;
    try {
      await writeCanonicalMemory({
        repository: repository as never,
        chunkRepository: chunkRepository as never,
        ingestJobs: ingestJobs as never,
        embeddings,
        vectorIndex,
        embedding: {
          provider: "openai",
          model: "text-embedding-3-small",
          dimensions: 1536,
          version: "v1",
          targetTokens: 800,
          overlapTokens: 120,
        },
        memory: {
          scopeType: "project",
          scopeId: "project-alpha",
          projectKey: "project-alpha",
          memoryType: "decision",
          title: `rotate key ${exampleAwsAccessKey}`,
          content: "no secret in content.",
          summary: `Old token: ${exampleGitHubToken} replaced.`,
          source: {
            scopeType: "project",
            scopeId: "project-alpha",
            sourceType: "conversation",
            sourceRef: "manual://session",
          },
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(SecretDetectedError);
    const err = caught as SecretDetectedError;
    expect(err.categories).toEqual(
      expect.arrayContaining(["aws-access-key", "github-token"]),
    );
    expect(repository.addMemory).not.toHaveBeenCalled();
  });

  it("reindexes stored chunks in pages without deleting a record after partial upsert", async () => {
    const chunks = [
      {
        id: 701,
        memoryRecordId: 501,
        chunkIndex: 0,
        content: "Project chunk 1",
        startOffset: 0,
        endOffset: 15,
        embeddingVersion: "v1",
        organizationId: "org-a",
        scopeType: "project" as const,
        scopeId: "project-alpha",
        projectKey: "project-alpha",
        durability: "durable",
        kind: "decision",
        updatedAt: "2026-03-29T00:00:00.000Z",
      },
      {
        id: 702,
        memoryRecordId: 501,
        chunkIndex: 1,
        content: "Project chunk 2",
        startOffset: 16,
        endOffset: 31,
        embeddingVersion: "v1",
        organizationId: "org-a",
        scopeType: "project" as const,
        scopeId: "project-alpha",
        projectKey: "project-alpha",
        durability: "durable",
        kind: "decision",
        updatedAt: "2026-03-29T00:00:00.000Z",
      },
      {
        id: 703,
        memoryRecordId: 502,
        chunkIndex: 0,
        content: "User chunk",
        startOffset: 0,
        endOffset: 10,
        embeddingVersion: "v1",
        organizationId: "org-a",
        scopeType: "user" as const,
        scopeId: "alice",
        projectKey: null,
        durability: "ephemeral",
        kind: "fact",
        updatedAt: "2026-03-29T00:00:00.000Z",
      },
    ];
    const chunkRepository = {
      listChunks: vi.fn().mockImplementation(
        async (
          _organizationId: string,
          _scopes: unknown[],
          options?: { afterChunkId?: number; limit?: number },
        ) => {
          const afterChunkId = options?.afterChunkId ?? 0;
          const limit = options?.limit ?? chunks.length;
          return chunks
            .filter((chunk) => chunk.id > afterChunkId)
            .slice(0, limit);
        },
      ),
      updatePointIds: vi.fn().mockResolvedValue(undefined),
    };
    const embeddings = {
      embed: vi.fn(),
      embedBatch: vi
        .fn()
        .mockImplementation(async (inputs: string[]) =>
          inputs.map((_input, index) => [index + 0.1, index + 0.2]),
        ),
    };
    const vectorIndex = {
      upsert: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(),
      delete: vi.fn(),
      deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
      ensureCollection: vi.fn(),
    };

    const result = await reindexCanonicalMemory({
      chunkRepository: chunkRepository as never,
      embeddings,
      vectorIndex,
      organizationId: "org-a",
      scopes: [
        { scopeType: "project", scopeId: "project-alpha" },
        { scopeType: "user", scopeId: "alice" },
      ],
      batchSize: 2,
    });

    expect(result).toEqual({ chunkCount: 3 });
    const scopes = [
      { scopeType: "project", scopeId: "project-alpha" },
      { scopeType: "user", scopeId: "alice" },
    ];
    expect(chunkRepository.listChunks).toHaveBeenNthCalledWith(
      1,
      "org-a",
      scopes,
      { limit: 2 },
    );
    expect(chunkRepository.listChunks).toHaveBeenNthCalledWith(
      2,
      "org-a",
      scopes,
      { limit: 2, afterChunkId: 702 },
    );
    expect(chunkRepository.listChunks).toHaveBeenNthCalledWith(
      3,
      "org-a",
      scopes,
      { limit: 2 },
    );
    expect(chunkRepository.listChunks).toHaveBeenNthCalledWith(
      4,
      "org-a",
      scopes,
      { limit: 2, afterChunkId: 702 },
    );

    const deleteOrders = vectorIndex.deleteByRecordIds.mock.invocationCallOrder;
    const firstUpsertOrder = vectorIndex.upsert.mock.invocationCallOrder[0]!;
    expect(Math.max(...deleteOrders)).toBeLessThan(firstUpsertOrder);
    expect(vectorIndex.deleteByRecordIds).toHaveBeenNthCalledWith(1, [501], {
      organizationId: "org-a",
    });
    expect(vectorIndex.deleteByRecordIds).toHaveBeenNthCalledWith(2, [502], {
      organizationId: "org-a",
    });

    expect(embeddings.embedBatch).toHaveBeenCalledTimes(2);
    expect(embeddings.embedBatch).toHaveBeenNthCalledWith(1, [
      "Project chunk 1",
      "Project chunk 2",
    ]);
    expect(embeddings.embedBatch).toHaveBeenNthCalledWith(2, ["User chunk"]);
    expect(vectorIndex.upsert).toHaveBeenCalledTimes(2);
    expect(vectorIndex.upsert).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({ id: "chunk:701" }),
        expect.objectContaining({ id: "chunk:702" }),
      ]),
    );
    expect(vectorIndex.upsert).toHaveBeenNthCalledWith(
      2,
      [expect.objectContaining({ id: "chunk:703" })],
    );
    expect(chunkRepository.updatePointIds).toHaveBeenNthCalledWith(1, [
      { chunkId: 701, qdrantPointId: "chunk:701" },
      { chunkId: 702, qdrantPointId: "chunk:702" },
    ]);
    expect(chunkRepository.updatePointIds).toHaveBeenNthCalledWith(2, [
      { chunkId: 703, qdrantPointId: "chunk:703" },
    ]);
  });

  it("insertChunks issues exactly ONE pool.query for N>1 chunks and returns rows in input order", async () => {
    // Returning rows in REVERSED order proves the keyed-map reassembly is
    // not accidentally relying on RETURNING preserving VALUES order.
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          // reversed: chunk_index 1 before 0
          {
            id: 2,
            memory_record_id: 10,
            chunk_index: 1,
            content: "second chunk",
            start_offset: 5,
            end_offset: 11,
            embedding_version: "v1",
          },
          {
            id: 1,
            memory_record_id: 10,
            chunk_index: 0,
            content: "first chunk",
            start_offset: 0,
            end_offset: 5,
            embedding_version: "v1",
          },
        ],
      }),
    };
    const repo = createMemoryChunkRepository(mockPool as never);
    const record = createRecord({ id: 10, content: "first chunk second chunk" });

    const chunks = [
      { chunkIndex: 0, content: "first chunk", startOffset: 0, endOffset: 5 },
      { chunkIndex: 1, content: "second chunk", startOffset: 5, endOffset: 11 },
    ];

    const result = await repo.insertChunks({
      record,
      chunks,
      embedding: {
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 1536,
        version: "v1",
        targetTokens: 800,
        overlapTokens: 120,
      },
    });

    // Single query, not two.
    expect(mockPool.query).toHaveBeenCalledOnce();

    // Output must be in input order (chunk_index 0 first) even though RETURNING
    // came back with chunk_index 1 first.
    expect(result).toHaveLength(2);
    expect(result[0]!.chunkIndex).toBe(0);
    expect(result[0]!.id).toBe(1);
    expect(result[1]!.chunkIndex).toBe(1);
    expect(result[1]!.id).toBe(2);
  });

  it("updatePointIds issues exactly ONE pool.query for N mappings", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const repo = createMemoryChunkRepository(mockPool as never);

    await repo.updatePointIds([
      { chunkId: 1, qdrantPointId: "chunk:1" },
      { chunkId: 2, qdrantPointId: "chunk:2" },
      { chunkId: 3, qdrantPointId: "chunk:3" },
    ]);

    // Three mappings → one query, not three.
    expect(mockPool.query).toHaveBeenCalledOnce();

    const [sql, params] = mockPool.query.mock.calls[0] as [string, unknown[]];
    // SQL must reference the VALUES alias columns.
    expect(sql).toMatch(/UPDATE\s+memory_chunks/i);
    expect(sql).toMatch(/FROM\s+\(VALUES/i);
    // All three chunkIds and pointIds must be in params.
    expect(params).toContain(1);
    expect(params).toContain("chunk:1");
    expect(params).toContain(2);
    expect(params).toContain("chunk:2");
    expect(params).toContain(3);
    expect(params).toContain("chunk:3");
  });

  it("deleteChunksForRecord rejects whitespace-only organizationId before querying", async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const repo = createMemoryChunkRepository(mockPool as never);

    await expect(
      repo.deleteChunksForRecord(501, " \n\t "),
    ).rejects.toThrow(/organizationId/);

    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it("replaceChunksForRecordWithPendingIngest replaces chunks and inserts a due retry row in one transaction", async () => {
    const clientQueryCalls: { sql: string; params: unknown[] }[] = [];
    const retryAt = new Date("2026-06-26T00:00:01.000Z");
    const mockClient = {
      query: vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
        clientQueryCalls.push({ sql, params: params ?? [] });
        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes("INSERT INTO memory_chunks")) {
          return Promise.resolve({
            rows: [{
              id: 701,
              memory_record_id: 501,
              chunk_index: 0,
              content: "replacement chunk",
              start_offset: 0,
              end_offset: 17,
              embedding_version: "v1",
            }],
          });
        }
        if (sql.includes("INSERT INTO ingest_jobs")) {
          return Promise.resolve({
            rows: [{ id: 801, qdrant_attempts: 0 }],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
      release: vi.fn(),
    };
    const mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    };
    const repo = createMemoryChunkRepository(mockPool as never);

    const result = await repo.replaceChunksForRecordWithPendingIngest!({
      record: {
        id: 501,
        organizationId: "org-a",
        sourceId: 1,
        scopeType: "project",
        scopeId: "project-alpha",
        projectKey: "project-alpha",
        memoryType: "fact",
        content: "replacement chunk",
        createdAt: "2026-06-26T00:00:00.000Z",
        updatedAt: "2026-06-26T00:00:00.000Z",
        source: {
          id: 1,
          scopeType: "project",
          scopeId: "project-alpha",
          sourceType: "document",
          title: null,
          uri: null,
          createdAt: "2026-06-26T00:00:00.000Z",
        },
      },
      chunks: [{
        chunkIndex: 0,
        content: "replacement chunk",
        startOffset: 0,
        endOffset: 17,
      }],
      embedding: {
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 1536,
        version: "v1",
        targetTokens: 800,
        overlapTokens: 120,
      },
      nextRetryAt: retryAt,
    });

    expect(result).toEqual({
      chunks: [expect.objectContaining({ id: 701, memoryRecordId: 501 })],
      job: { id: 801, qdrantAttempts: 0 },
    });
    expect(clientQueryCalls.map((call) => call.sql)).toEqual([
      "BEGIN",
      expect.stringContaining("DELETE FROM memory_chunks"),
      expect.stringContaining("INSERT INTO memory_chunks"),
      expect.stringContaining("INSERT INTO ingest_jobs"),
      "COMMIT",
    ]);
    const ingestInsert = clientQueryCalls.find((call) =>
      call.sql.includes("INSERT INTO ingest_jobs"),
    );
    expect(ingestInsert?.sql).toContain("qdrant_next_retry_at");
    expect(ingestInsert?.params).toEqual([501, "org-a", retryAt]);
    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it("listChunks filters by organizationId to prevent cross-tenant data leakage (SEC-1)", () => {
    // Proof via mock-based SQL inspection:
    // createMemoryChunkRepository.listChunks must pass organizationId as
    // the FIRST parameter and build SQL with:
    //   WHERE mr.organization_id = $1 AND (<scope-clauses>)
    // Two scopes are used so the OR-binding parenthesization can be verified.
    const queryCalls: { sql: string; params: unknown[] }[] = [];
    const mockPool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        queryCalls.push({ sql, params });
        return Promise.resolve({ rows: [] });
      }),
    };
    const repo = createMemoryChunkRepository(mockPool as never);

    const scopes = [
      { scopeType: "project" as const, scopeId: "shared-project" },
      { scopeType: "user" as const, scopeId: "user-x" },
    ];

    // Call listChunks as org-a — org-b's data must never appear.
    // Even with identical scopeIds, the org filter must restrict results.
    const promise = repo.listChunks("org-a", scopes);

    // The call is async but the mock resolves immediately; we just need to
    // inspect what was sent to pool.query.
    return promise.then(() => {
      expect(queryCalls).toHaveLength(1);
      const { sql, params } = queryCalls[0]!;

      // organizationId must be the first param ($1)
      expect(params[0]).toBe("org-a");

      // SQL must reference the org filter with $1
      expect(sql).toMatch(/mr\.organization_id\s*=\s*\$1/);

      // The scope OR-group must be wrapped in an OUTER set of parentheses so
      // AND binds before OR. The discriminating pattern is "AND ((" — the outer
      // wrap is immediately followed by "(" which opens the first scope clause.
      // A broken "AND scope_type = $2 OR ..." would NOT match this pattern.
      // Note: each per-scope clause is itself parenthesized, so the full SQL is:
      //   WHERE mr.organization_id = $1 AND ((scope_type=? AND scope_id=?) OR (...))
      expect(sql).toMatch(/AND\s*\(\s*\(/);

      // Both scope params must appear ($2 onward)
      expect(params).toContain("shared-project");
      expect(params).toContain("user-x");
    });
  });

  it("listChunks supports cursor pagination by chunk id", async () => {
    const queryCalls: { sql: string; params: unknown[] }[] = [];
    const mockPool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        queryCalls.push({ sql, params });
        return Promise.resolve({ rows: [] });
      }),
    };
    const repo = createMemoryChunkRepository(mockPool as never);

    await repo.listChunks(
      "org-a",
      [
        { scopeType: "project", scopeId: "shared-project" },
        { scopeType: "user", scopeId: "user-x" },
      ],
      { afterChunkId: 900, limit: 250 },
    );

    expect(queryCalls).toHaveLength(1);
    const { sql, params } = queryCalls[0]!;
    expect(sql).toMatch(/mc\.id\s*>\s*\$6/);
    expect(sql).toMatch(/ORDER BY mc\.id ASC\s+LIMIT\s+\$7/);
    expect(params).toEqual([
      "org-a",
      "project",
      "shared-project",
      "user",
      "user-x",
      900,
      250,
    ]);
  });
});

function createRecord(overrides: {
  id: number;
  content: string;
}): SearchMemoryResult {
  return {
    id: overrides.id,
    sourceId: overrides.id + 100,
    scopeType: "project",
    scopeId: "project-alpha",
    projectKey: "project-alpha",
    memoryType: "decision",
    content: overrides.content,
    summary: overrides.content,
    durability: "durable",
    importance: 5,
    createdAt: "2026-03-29T00:00:00.000Z",
    updatedAt: "2026-03-29T00:00:00.000Z",
    source: {
      id: overrides.id + 100,
      scopeType: "project",
      scopeId: "project-alpha",
      sourceType: "conversation",
      externalId: "decision:manual",
      title: "decision manual entry",
      uri: null,
      createdAt: "2026-03-29T00:00:00.000Z",
    },
  };
}
