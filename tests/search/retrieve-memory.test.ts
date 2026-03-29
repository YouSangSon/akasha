import { describe, expect, it, vi } from "vitest";
import { retrieveMemory } from "../../src/search/retrieve-memory.js";

describe("retrieveMemory", () => {
  it("hydrates qdrant hits from postgres and keeps project results ahead of user results", async () => {
    const qdrant = {
      query: vi.fn().mockResolvedValue({
        points: [
          { payload: { memory_record_id: 12 } },
          { payload: { memory_record_id: 21 } },
        ],
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

    expect(qdrant.query).toHaveBeenCalledWith("memory_chunks_v1", {
      query: [0.1, 0.2, 0.3],
      limit: 5,
      filter: {
        should: [
          {
            must: [
              { key: "scope_type", match: { value: "project" } },
              { key: "project_key", match: { value: "project-alpha" } },
            ],
          },
          {
            must: [
              { key: "scope_type", match: { value: "user" } },
              { key: "scope_id", match: { value: "alice" } },
            ],
          },
        ],
      },
    });
    expect(repository.getMemoryRecordsByIds).toHaveBeenCalledWith([12, 21]);
    expect(results.map((result) => result.id)).toEqual([12, 21]);
  });
});
