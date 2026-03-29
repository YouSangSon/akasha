import { describe, expect, it, vi } from "vitest";
import { retrieveMemory } from "../../src/search/retrieve-memory.js";

describe("retrieveMemory", () => {
  it("hydrates qdrant hits from postgres and keeps project results ahead of user results", async () => {
    const qdrant = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          points: [{ payload: { memory_record_id: 12 } }],
        })
        .mockResolvedValueOnce({
          points: [{ payload: { memory_record_id: 21 } }],
        }),
    };

    const repository = {
      getMemoryRecordsByIds: vi.fn().mockResolvedValue([
        {
          id: 21,
          sourceId: 201,
          scopeType: "user",
          scopeId: "alice",
          memoryType: "fact",
          content: "Use ripgrep first.",
          createdAt: "2026-03-29T00:00:00.000Z",
          updatedAt: "2026-03-29T00:00:00.000Z",
          source: {
            id: 301,
            scopeType: "user",
            scopeId: "alice",
            sourceType: "document",
            externalId: "tooling",
            title: "Tooling",
            uri: "file:///tmp/tooling.md",
            createdAt: "2026-03-29T00:00:00.000Z",
          },
        },
        {
          id: 12,
          sourceId: 202,
          scopeType: "project",
          scopeId: "project-alpha",
          memoryType: "decision",
          content: "Decision: keep project memory ahead of user memory.",
          createdAt: "2026-03-29T00:00:00.000Z",
          updatedAt: "2026-03-29T00:00:00.000Z",
          source: {
            id: 302,
            scopeType: "project",
            scopeId: "project-alpha",
            sourceType: "decision",
            externalId: "adr-2",
            title: "ADR 2",
            uri: "file:///tmp/adr-2.md",
            createdAt: "2026-03-29T00:00:00.000Z",
          },
        },
      ]),
    };

    const results = await retrieveMemory({
      qdrantClient: qdrant as never,
      repository: repository as never,
      collectionName: "memory_chunks_v1",
      vector: [0.1, 0.2, 0.3],
      projectKey: "project-alpha",
      userScopeId: "alice",
      limit: 5,
    });

    expect(qdrant.query).toHaveBeenNthCalledWith(1, "memory_chunks_v1", {
      query: [0.1, 0.2, 0.3],
      limit: 5,
      filter: {
        must: [
          { key: "scope_type", match: { value: "project" } },
          { key: "project_key", match: { value: "project-alpha" } },
        ],
      },
    });
    expect(qdrant.query).toHaveBeenNthCalledWith(2, "memory_chunks_v1", {
      query: [0.1, 0.2, 0.3],
      limit: 5,
      filter: {
        must: [
          { key: "scope_type", match: { value: "user" } },
          { key: "scope_id", match: { value: "alice" } },
        ],
      },
    });
    expect(repository.getMemoryRecordsByIds).toHaveBeenCalledWith([12, 21]);
    expect(results.map((result) => result.id)).toEqual([12, 21]);
  });

  it("keeps project hits ahead when limit is smaller than the combined candidate set", async () => {
    const qdrant = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          points: [{ payload: { memory_record_id: 12 } }],
        })
        .mockResolvedValueOnce({
          points: [{ payload: { memory_record_id: 21 } }],
        }),
    };

    const repository = {
      getMemoryRecordsByIds: vi.fn().mockResolvedValue([
        {
          id: 21,
          sourceId: 201,
          scopeType: "user",
          scopeId: "alice",
          memoryType: "decision",
          content: "Decision: Always prefer the freshest user workflow hint.",
          createdAt: "2026-03-29T00:00:00.000Z",
          updatedAt: "2026-03-29T12:00:00.000Z",
          source: {
            id: 301,
            scopeType: "user",
            scopeId: "alice",
            sourceType: "decision",
            externalId: "tooling",
            title: "Tooling",
            uri: "file:///tmp/tooling.md",
            createdAt: "2026-03-29T00:00:00.000Z",
          },
        },
        {
          id: 12,
          sourceId: 202,
          scopeType: "project",
          scopeId: "project-alpha",
          memoryType: "summary",
          content: "Project summary: retrieval must prioritize project context.",
          createdAt: "2026-03-29T00:00:00.000Z",
          updatedAt: "2026-03-28T00:00:00.000Z",
          source: {
            id: 302,
            scopeType: "project",
            scopeId: "project-alpha",
            sourceType: "document",
            externalId: "adr-2",
            title: "ADR 2",
            uri: "file:///tmp/adr-2.md",
            createdAt: "2026-03-29T00:00:00.000Z",
          },
        },
      ]),
    };

    const results = await retrieveMemory({
      qdrantClient: qdrant as never,
      repository: repository as never,
      collectionName: "memory_chunks_v1",
      vector: [0.1, 0.2, 0.3],
      projectKey: "project-alpha",
      userScopeId: "alice",
      limit: 1,
    });

    expect(repository.getMemoryRecordsByIds).toHaveBeenCalledWith([12, 21]);
    expect(results.map((result) => result.id)).toEqual([12]);
  });
});
