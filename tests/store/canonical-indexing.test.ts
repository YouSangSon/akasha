import { describe, expect, it, vi } from "vitest";
import {
  reindexCanonicalMemory,
  writeCanonicalMemory,
} from "../../src/store/canonical-indexing.js";
import { SecretDetectedError } from "../../src/store/secret-scrub.js";
import type { TextChunk } from "../../src/chunk/chunk-text.js";
import type { SearchMemoryResult } from "../../src/types.js";

describe("canonical indexing", () => {
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
      embed: vi
        .fn()
        .mockResolvedValueOnce([0.1, 0.2])
        .mockResolvedValueOnce([0.3, 0.4])
        .mockResolvedValueOnce([0.5, 0.6]),
    };
    const qdrantClient = {
      upsert: vi.fn().mockResolvedValue(undefined),
    };

    const created = await writeCanonicalMemory({
      repository: repository as never,
      chunkRepository: chunkRepository as never,
      ingestJobs: ingestJobs as never,
      embeddings,
      qdrantClient,
      collectionName: "memory_chunks_v1",
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
    expect(ingestJobs.create).toHaveBeenCalledWith({ memoryRecordId: 501 });
    expect(chunkRepository.insertChunks).toHaveBeenCalledOnce();
    expect(embeddings.embed).toHaveBeenCalledTimes(3);
    expect(qdrantClient.upsert).toHaveBeenCalledWith(
      "memory_chunks_v1",
      expect.objectContaining({
        points: expect.arrayContaining([
          expect.objectContaining({ id: "chunk:701" }),
          expect.objectContaining({ id: "chunk:702" }),
          expect.objectContaining({ id: "chunk:703" }),
        ]),
      }),
    );
    expect(chunkRepository.updatePointIds).toHaveBeenCalledWith([
      { chunkId: 701, qdrantPointId: "chunk:701" },
      { chunkId: 702, qdrantPointId: "chunk:702" },
      { chunkId: 703, qdrantPointId: "chunk:703" },
    ]);
    expect(ingestJobs.markCompleted).toHaveBeenCalledWith(801);
  });

  it("marks the ingest job as failed when embedding throws and does not call markCompleted", async () => {
    const record = createRecord({ id: 502, content: "fail path content" });
    const repository = {
      addMemory: vi.fn().mockResolvedValue(record),
    };
    const ingestJobs = {
      create: vi.fn().mockResolvedValue({ id: 802 }),
      markCompleted: vi.fn(),
      markFailed: vi.fn().mockResolvedValue({ id: 802, status: "failed" }),
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
      embed: vi.fn().mockRejectedValue(embedError),
    };
    const qdrantClient = {
      upsert: vi.fn(),
    };

    await expect(
      writeCanonicalMemory({
        repository: repository as never,
        chunkRepository: chunkRepository as never,
        ingestJobs: ingestJobs as never,
        embeddings,
        qdrantClient,
        collectionName: "memory_chunks_v1",
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

    expect(ingestJobs.markFailed).toHaveBeenCalledWith(802, embedError);
    expect(ingestJobs.markCompleted).not.toHaveBeenCalled();
    expect(qdrantClient.upsert).not.toHaveBeenCalled();
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
    const embeddings = { embed: vi.fn() };
    const qdrantClient = { upsert: vi.fn() };

    await expect(
      writeCanonicalMemory({
        repository: repository as never,
        chunkRepository: chunkRepository as never,
        ingestJobs: ingestJobs as never,
        embeddings,
        qdrantClient,
        collectionName: "memory_chunks_v1",
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
            "Decision: rotate AWS access key AKIAIOSFODNN7EXAMPLE next week.",
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
    expect(qdrantClient.upsert).not.toHaveBeenCalled();
  });

  it("reindexes stored chunks back into qdrant for all requested scopes", async () => {
    const chunkRepository = {
      listChunks: vi.fn().mockResolvedValue([
        {
          id: 701,
          memoryRecordId: 501,
          chunkIndex: 0,
          content: "Project chunk",
          startOffset: 0,
          endOffset: 13,
          embeddingVersion: "v1",
          scopeType: "project",
          scopeId: "project-alpha",
          projectKey: "project-alpha",
          durability: "durable",
          kind: "decision",
          updatedAt: "2026-03-29T00:00:00.000Z",
        },
        {
          id: 702,
          memoryRecordId: 502,
          chunkIndex: 0,
          content: "User chunk",
          startOffset: 0,
          endOffset: 10,
          embeddingVersion: "v1",
          scopeType: "user",
          scopeId: "alice",
          projectKey: null,
          durability: "ephemeral",
          kind: "fact",
          updatedAt: "2026-03-29T00:00:00.000Z",
        },
      ]),
      updatePointIds: vi.fn().mockResolvedValue(undefined),
    };
    const embeddings = {
      embed: vi
        .fn()
        .mockResolvedValueOnce([0.1, 0.2])
        .mockResolvedValueOnce([0.3, 0.4]),
    };
    const qdrantClient = {
      upsert: vi.fn().mockResolvedValue(undefined),
    };

    const result = await reindexCanonicalMemory({
      chunkRepository: chunkRepository as never,
      embeddings,
      qdrantClient,
      collectionName: "memory_chunks_v1",
      scopes: [
        { scopeType: "project", scopeId: "project-alpha" },
        { scopeType: "user", scopeId: "alice" },
      ],
    });

    expect(result).toEqual({ chunkCount: 2 });
    expect(chunkRepository.listChunks).toHaveBeenCalledWith([
      { scopeType: "project", scopeId: "project-alpha" },
      { scopeType: "user", scopeId: "alice" },
    ]);
    expect(embeddings.embed).toHaveBeenCalledTimes(2);
    expect(qdrantClient.upsert).toHaveBeenCalledWith(
      "memory_chunks_v1",
      expect.objectContaining({
        points: expect.arrayContaining([
          expect.objectContaining({ id: "chunk:701" }),
          expect.objectContaining({ id: "chunk:702" }),
        ]),
      }),
    );
    expect(chunkRepository.updatePointIds).toHaveBeenCalledWith([
      { chunkId: 701, qdrantPointId: "chunk:701" },
      { chunkId: 702, qdrantPointId: "chunk:702" },
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
