import { describe, expect, it } from "vitest";
import {
  buildVectorPoint,
  type VectorPointInput,
} from "../../src/vector/point-builder.js";

const buildInput = (
  overrides: Partial<VectorPointInput> = {},
): VectorPointInput => ({
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
  ...overrides,
});

const callBuildVectorPoint = (input: unknown) => () =>
  buildVectorPoint(input as VectorPointInput);

describe("buildVectorPoint", () => {
  it("produces the expected id and metadata payload", () => {
    const point = buildVectorPoint(buildInput());

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
    const point = buildVectorPoint(buildInput({
      chunkId: 1,
      vector: [0.5],
      memoryRecordId: 2,
      organizationId: "org",
      scopeType: "project",
      scopeId: "proj-1",
      projectKey: null,
      kind: "fact",
      durability: "ephemeral",
      title: undefined,
      summary: undefined,
      tags: undefined,
      updatedAt: "2026-01-01T00:00:00.000Z",
      embeddingVersion: "v2",
    }));

    expect(point.payload.project_key).toBeNull();
    expect(point.payload.title).toBeNull();
    expect(point.payload.summary).toBeNull();
    expect(point.payload.tags).toEqual([]);
  });

  it("rejects whitespace-only organizationId before building payload", () => {
    expect(() =>
      buildVectorPoint(buildInput({
        chunkId: 1,
        vector: [0.5],
        memoryRecordId: 2,
        organizationId: " \n\t ",
        scopeType: "project",
        scopeId: "proj-1",
        projectKey: null,
        kind: "fact",
        durability: "ephemeral",
        updatedAt: "2026-01-01T00:00:00.000Z",
        embeddingVersion: "v2",
      })),
    ).toThrow(/organizationId/);
  });

  it.each([undefined, null, "point", 12, true, []])(
    "rejects non-object direct input",
    (input) => {
      expect(callBuildVectorPoint(input)).toThrow(
        "buildVectorPoint input must be an object",
      );
    },
  );

  it.each([
    ["chunkId", { chunkId: 0 }, "chunkId must be a positive safe integer"],
    [
      "memoryRecordId",
      { memoryRecordId: 1.5 },
      "memoryRecordId must be a positive safe integer",
    ],
  ])("rejects invalid positive id field: %s", (_label, override, message) => {
    expect(callBuildVectorPoint({ ...buildInput(), ...override })).toThrow(
      message,
    );
  });

  it.each([
    ["not-array", "vector", "vector must be a non-empty array"],
    ["empty", [], "vector must be a non-empty array"],
    ["nan", [0.1, Number.NaN], "vector[1] must be a finite number"],
    ["infinity", [Infinity], "vector[0] must be a finite number"],
  ])("rejects invalid vector input: %s", (_label, vector, message) => {
    expect(callBuildVectorPoint({ ...buildInput(), vector })).toThrow(message);
  });

  it.each([
    ["scopeType", { scopeType: 12 }, "scopeType must be a string"],
    ["scopeId", { scopeId: null }, "scopeId must be a string"],
    ["kind", { kind: undefined }, "kind must be a string"],
    ["durability", { durability: false }, "durability must be a string"],
    ["updatedAt", { updatedAt: null }, "updatedAt must be a string"],
    [
      "embeddingVersion",
      { embeddingVersion: undefined },
      "embeddingVersion must be a string",
    ],
  ])("rejects invalid required string field: %s", (_label, override, message) => {
    expect(callBuildVectorPoint({ ...buildInput(), ...override })).toThrow(
      message,
    );
  });

  it.each([
    [
      "projectKey",
      { projectKey: undefined },
      "projectKey must be a string or null",
    ],
    ["title", { title: 42 }, "title must be a string or null"],
    ["summary", { summary: false }, "summary must be a string or null"],
  ])("rejects invalid nullable string field: %s", (_label, override, message) => {
    expect(callBuildVectorPoint({ ...buildInput(), ...override })).toThrow(
      message,
    );
  });

  it("rejects invalid tags before copying payload metadata", () => {
    expect(callBuildVectorPoint({ ...buildInput(), tags: "ops" })).toThrow(
      "tags must be an array",
    );

    expect(
      callBuildVectorPoint({ ...buildInput(), tags: ["ops", 12] }),
    ).toThrow("tags[1] must be a string");
  });
});
