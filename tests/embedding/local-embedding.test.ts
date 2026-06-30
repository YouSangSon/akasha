import { describe, expect, it } from "vitest";
import { createLocalEmbeddingClient } from "../../src/embedding/local-embedding.js";

describe("createLocalEmbeddingClient", () => {
  it.each([
    {
      input: null,
      message: "local embedding client input must be an object",
    },
    {
      input: { dimensions: 0 },
      message: "local embedding dimensions must be a positive integer, got 0",
    },
    {
      input: { dimensions: 1.5 },
      message: "local embedding dimensions must be a positive integer, got 1.5",
    },
    {
      input: { dimensions: "384" },
      message: "local embedding dimensions must be a positive integer, got 384",
    },
  ])("rejects malformed client input %#", ({ input, message }) => {
    expect(() => createLocalEmbeddingClient(input as never)).toThrow(message);
  });

  it("returns deterministic normalized vectors with the configured dimensions", async () => {
    const client = createLocalEmbeddingClient({ dimensions: 4 });

    const first = await client.embed("stable input");
    const second = await client.embed("stable input");
    const norm = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));

    expect(first).toHaveLength(4);
    expect(second).toEqual(first);
    expect(norm).toBeCloseTo(1);
  });

  it.each([
    {
      inputText: 123,
      message: "inputText must be a string",
    },
    {
      inputText: " \n\t ",
      message: "inputText must contain non-whitespace text",
    },
  ])("embed rejects malformed input %#", async ({ inputText, message }) => {
    const client = createLocalEmbeddingClient({ dimensions: 4 });

    await expect(client.embed(inputText as never)).rejects.toThrow(message);
  });

  it("embedBatch returns vectors in input order", async () => {
    const client = createLocalEmbeddingClient({ dimensions: 3 });

    const vectors = await client.embedBatch(["first", "second"]);

    expect(vectors).toEqual([
      await client.embed("first"),
      await client.embed("second"),
    ]);
  });

  it("embedBatch returns an empty array for empty input", async () => {
    const client = createLocalEmbeddingClient({ dimensions: 3 });

    await expect(client.embedBatch([])).resolves.toEqual([]);
  });

  it.each([
    {
      inputs: null,
      message: "inputs must be an array",
    },
    {
      inputs: ["valid", " \n\t "],
      message: "inputs[1] must contain non-whitespace text",
    },
  ])("embedBatch rejects malformed input %#", async ({ inputs, message }) => {
    const client = createLocalEmbeddingClient({ dimensions: 4 });

    await expect(client.embedBatch(inputs as never)).rejects.toThrow(message);
  });
});
