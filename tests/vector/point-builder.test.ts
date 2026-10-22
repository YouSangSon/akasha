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

    expect(point.id).toBe("00000000-0000-8000-8000-00000000000f");
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

  it("derives a stable Qdrant-compatible UUIDv8 id from each chunk id", () => {
    const first = buildVectorPoint(buildInput({ chunkId: 1 }));
    const repeated = buildVectorPoint(buildInput({ chunkId: 1 }));
    const largest = buildVectorPoint(
      buildInput({ chunkId: Number.MAX_SAFE_INTEGER }),
    );

    expect(first.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(first.id).toBe("00000000-0000-8000-8000-000000000001");
    expect(repeated.id).toBe(first.id);
    expect(largest.id).toBe("00000000-0000-801f-8000-ffffffffffff");
    expect(largest.id).not.toBe(first.id);
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

  it("trims direct scope payload metadata", () => {
    const point = buildVectorPoint(buildInput({
      organizationId: " dev-team ",
      scopeType: " user ",
      scopeId: " alice ",
      projectKey: " project-alpha ",
      kind: " decision ",
      durability: " durable ",
      title: " Decision title ",
      summary: " Short summary ",
      tags: [" ops ", "security "],
      updatedAt: " 2026-03-29T00:00:00.000Z ",
      embeddingVersion: " v1 ",
    }));

    expect(point.payload.organization_id).toBe("dev-team");
    expect(point.payload.scope_type).toBe("user");
    expect(point.payload.scope_id).toBe("alice");
    expect(point.payload.project_key).toBe("project-alpha");
    expect(point.payload.kind).toBe("decision");
    expect(point.payload.durability).toBe("durable");
    expect(point.payload.title).toBe("Decision title");
    expect(point.payload.summary).toBe("Short summary");
    expect(point.payload.tags).toEqual(["ops", "security"]);
    expect(point.payload.updated_at).toBe("2026-03-29T00:00:00.000Z");
    expect(point.payload.embedding_version).toBe("v1");
  });

  it("normalizes blank nullable payload metadata to null", () => {
    const point = buildVectorPoint(buildInput({
      title: " \n\t ",
      summary: " \n\t ",
    }));

    expect(point.payload.title).toBeNull();
    expect(point.payload.summary).toBeNull();
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
      "scopeType",
      { scopeType: " \n\t " },
      "scopeType must be a non-empty string",
    ],
    [
      "scopeId",
      { scopeId: " \n\t " },
      "scopeId must be a non-empty string",
    ],
    [
      "projectKey",
      { projectKey: " \n\t " },
      "projectKey must be a non-empty string",
    ],
  ])("rejects blank scope metadata field: %s", (_label, override, message) => {
    expect(callBuildVectorPoint({ ...buildInput(), ...override })).toThrow(
      message,
    );
  });

  it("rejects invalid direct scopeType before building payload", () => {
    expect(
      callBuildVectorPoint({ ...buildInput(), scopeType: "team" }),
    ).toThrow("scopeType must be one of: user, project");
  });

  it.each([
    ["kind", { kind: " \n\t " }, "kind must be a non-empty string"],
    [
      "durability",
      { durability: " \n\t " },
      "durability must be a non-empty string",
    ],
    [
      "updatedAt",
      { updatedAt: " \n\t " },
      "updatedAt must be a non-empty string",
    ],
    [
      "embeddingVersion",
      { embeddingVersion: " \n\t " },
      "embeddingVersion must be a non-empty string",
    ],
  ])("rejects blank required metadata field: %s", (_label, override, message) => {
    expect(callBuildVectorPoint({ ...buildInput(), ...override })).toThrow(
      message,
    );
  });

  it.each([
    ["kind", { kind: "note" }, "kind must be one of: decision, summary, fact"],
    [
      "durability",
      { durability: "permanent" },
      "durability must be one of: ephemeral, durable, archived",
    ],
  ])("rejects invalid metadata enum field: %s", (_label, override, message) => {
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

    expect(
      callBuildVectorPoint({ ...buildInput(), tags: ["ops", " \n\t "] }),
    ).toThrow("tags[1] must contain non-whitespace text");
  });
});
