import { describe, expect, it } from "vitest";
import { buildVectorPoint } from "../../src/vector/point-builder.js";

describe("buildVectorPoint", () => {
  it("produces the expected id and metadata payload", () => {
    const point = buildVectorPoint({
      chunkId: 15,
      vector: [0.1, 0.2, 0.3],
      memoryRecordId: 9,
      organizationId: "dev-team",
      scopeType: "user",
      scopeId: "alice",
      projectKey: "project-alpha",
      kind: "decision",
      durability: "durable",
      title: "Decision title",
      summary: "Short summary",
      tags: ["ops", "security"],
      updatedAt: "2026-03-29T00:00:00.000Z",
      embeddingVersion: "v1",
    });

    expect(point.id).toBe("chunk:15");
    expect(point.vector).toEqual([0.1, 0.2, 0.3]);
    expect(point.payload).toEqual({
      chunk_id: 15,
      memory_record_id: 9,
      organization_id: "dev-team",
      scope_type: "user",
      scope_id: "alice",
      project_key: "project-alpha",
      kind: "decision",
      durability: "durable",
      title: "Decision title",
      summary: "Short summary",
      tags: ["ops", "security"],
      updated_at: "2026-03-29T00:00:00.000Z",
      embedding_version: "v1",
    });
  });

  it("accepts null projectKey", () => {
    const point = buildVectorPoint({
      chunkId: 1,
      vector: [0.5],
      memoryRecordId: 2,
      organizationId: "org",
      scopeType: "project",
      scopeId: "proj-1",
      projectKey: null,
      kind: "fact",
      durability: "ephemeral",
      updatedAt: "2026-01-01T00:00:00.000Z",
      embeddingVersion: "v2",
    });

    expect(point.payload.project_key).toBeNull();
    expect(point.payload.title).toBeNull();
    expect(point.payload.summary).toBeNull();
    expect(point.payload.tags).toEqual([]);
  });
});
