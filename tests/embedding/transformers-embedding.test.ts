import { describe, expect, it, vi } from "vitest";
import {
  createTransformersEmbeddingClient,
  type FeatureExtractor,
} from "../../src/embedding/transformers-embedding.js";

describe("createTransformersEmbeddingClient", () => {
  it("invokes the injected extractor with mean pooling + normalization and returns the vector", async () => {
    // Float32Array narrows precision (0.1 → 0.10000000149011612), so build
    // expected values via the same conversion the production code uses.
    const payload = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const expected = Array.from(payload);

    const extractor: FeatureExtractor = vi.fn(async () => ({ data: payload }));

    const client = createTransformersEmbeddingClient({
      model: "Xenova/all-MiniLM-L6-v2",
      createExtractor: async () => extractor,
    });

    await expect(client.embed("Hello, world.")).resolves.toEqual(expected);
    expect(extractor).toHaveBeenCalledWith("Hello, world.", {
      pooling: "mean",
      normalize: true,
    });
  });

  it("memoizes the extractor across embed calls so the model is loaded once", async () => {
    const factory = vi.fn(async (): Promise<FeatureExtractor> => {
      return async () => ({ data: new Float32Array([0.5]) });
    });

    const client = createTransformersEmbeddingClient({
      model: "Xenova/all-MiniLM-L6-v2",
      createExtractor: factory,
    });

    await client.embed("first");
    await client.embed("second");
    await client.embed("third");

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("throws when the extractor returns an empty embedding", async () => {
    const client = createTransformersEmbeddingClient({
      model: "Xenova/all-MiniLM-L6-v2",
      createExtractor: async () => async () => ({
        data: new Float32Array([]),
      }),
    });

    await expect(client.embed("hello")).rejects.toThrow(/empty embedding/i);
  });

  it("converts a number[] payload identically to a Float32Array payload", async () => {
    const client = createTransformersEmbeddingClient({
      model: "Xenova/all-MiniLM-L6-v2",
      createExtractor: async () => async () => ({
        data: [1, 2, 3],
      }),
    });

    await expect(client.embed("hello")).resolves.toEqual([1, 2, 3]);
  });
});
