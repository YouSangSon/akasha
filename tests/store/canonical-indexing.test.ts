import { describe, expect, it, vi } from "vitest";
import {
  createMemoryChunkRepository,
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
    // Single batch call replaces three sequential embed() calls.
    expect(embeddings.embedBatch).toHaveBeenCalledOnce();
    expect(embeddings.embedBatch).toHaveBeenCalledWith([
      "one two",
      "two three",
      "three four",
    ]);
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

    // Cascade-delete (memory_chunks, ingest_jobs, relationships) is handled
    // at the schema layer; the repository call is the single rollback action.
    expect(repository.deleteMemoryRecord).toHaveBeenCalledWith(502);
    expect(ingestJobs.markCompleted).not.toHaveBeenCalled();
    expect(qdrantClient.upsert).not.toHaveBeenCalled();
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
    const qdrantClient = {
      upsert: vi.fn().mockRejectedValue(upsertError),
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

    expect(repository.deleteMemoryRecord).toHaveBeenCalledWith(503);
    expect(ingestJobs.markCompleted).not.toHaveBeenCalled();
    // Qdrant upsert was attempted (and failed); updatePointIds must NOT run.
    expect(chunkRepository.updatePointIds).not.toHaveBeenCalled();
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

    expect(repository.deleteMemoryRecord).toHaveBeenCalledWith(504);
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
          // Synthetic AWS access key (canonical AWS docs example) in title.
          title: "rotate key AKIAIOSFODNN7EXAMPLE",
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
    expect(qdrantClient.upsert).not.toHaveBeenCalled();
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
          content: "Plan: rotate the demo key noted in the summary.",
          // Synthetic GitHub PAT (placeholder shape) in summary.
          summary:
            "Token to rotate: ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.",
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
    const qdrantClient = { upsert: vi.fn() };

    let caught: unknown;
    try {
      await writeCanonicalMemory({
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
          title: "rotate key AKIAIOSFODNN7EXAMPLE",
          content: "no secret in content.",
          summary:
            "Old token: ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa replaced.",
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
          organizationId: "org-a",
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
          organizationId: "org-a",
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
      embed: vi.fn(),
      // F4: reindexCanonicalMemory now uses embedBatch — single call returning
      // both vectors in input order.
      embedBatch: vi.fn().mockResolvedValue([
        [0.1, 0.2],
        [0.3, 0.4],
      ]),
    };
    const qdrantClient = {
      upsert: vi.fn().mockResolvedValue(undefined),
    };

    const result = await reindexCanonicalMemory({
      chunkRepository: chunkRepository as never,
      embeddings,
      qdrantClient,
      collectionName: "memory_chunks_v1",
      organizationId: "org-a",
      scopes: [
        { scopeType: "project", scopeId: "project-alpha" },
        { scopeType: "user", scopeId: "alice" },
      ],
    });

    expect(result).toEqual({ chunkCount: 2 });
    expect(chunkRepository.listChunks).toHaveBeenCalledWith("org-a", [
      { scopeType: "project", scopeId: "project-alpha" },
      { scopeType: "user", scopeId: "alice" },
    ]);
    expect(embeddings.embedBatch).toHaveBeenCalledOnce();
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
