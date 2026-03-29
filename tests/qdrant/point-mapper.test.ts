import { describe, expect, it } from "vitest";
import { toQdrantPoint } from "../../src/qdrant/point-mapper.js";

describe("toQdrantPoint", () => {
  it("maps a memory chunk to a scoped qdrant point", () => {
    const point = toQdrantPoint({
      chunk: {
        id: 15,
        memoryRecordId: 77,
        chunkIndex: 0,
        content: "Always respond in Korean unless the repo says otherwise.",
        embeddingVersion: "v1",
      },
      record: {
        id: 9,
        scopeType: "user",
        scopeId: "alice",
        projectKey: "project-alpha",
        durability: "durable",
        kind: "decision",
        tags: ["style"],
        updatedAt: "2026-03-29T00:00:00.000Z",
      },
      embedding: [0.1, 0.2, 0.3],
    });

    expect(point).toEqual({
      id: "chunk:15",
      vector: [0.1, 0.2, 0.3],
      payload: {
        chunk_id: 15,
        memory_record_id: 9,
        scope_type: "user",
        scope_id: "alice",
        project_key: "project-alpha",
        kind: "decision",
        durability: "durable",
        tags: ["style"],
        updated_at: "2026-03-29T00:00:00.000Z",
        embedding_version: "v1",
      },
    });
  });
});
