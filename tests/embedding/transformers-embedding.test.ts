import { describe, expect, it, vi } from "vitest";
import {
  createTransformersEmbeddingClient,
  EmbeddingInputTooLongError,
  type FeatureExtractor,
} from "../../src/embedding/transformers-embedding.js";

describe("createTransformersEmbeddingClient", () => {
  it.each([
    {
      input: null,
      message: "transformers embedding client input must be an object",
    },
    {
      input: { model: " \n\t " },
      message: "model must contain non-whitespace text",
    },
    {
      input: {
        model: "Xenova/all-MiniLM-L6-v2",
        createExtractor: "not-a-function",
      },
      message: "createExtractor must be a function",
    },
  ])("rejects malformed client input %#", ({ input, message }) => {
    expect(() =>
      createTransformersEmbeddingClient(input as never),
    ).toThrow(message);
  });

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

  it.each([
    {
      inputText: 123,
      message: "inputText must be a string",
    },
    {
      inputText: " \n\t ",
      message: "inputText must contain non-whitespace text",
    },
  ])("embed rejects malformed input before loading the extractor %#", async ({
    inputText,
    message,
  }) => {
    const factory = vi.fn(async (): Promise<FeatureExtractor> => {
      return async () => ({ data: new Float32Array([0.5]) });
    });
    const client = createTransformersEmbeddingClient({
      model: "Xenova/all-MiniLM-L6-v2",
      createExtractor: factory,
    });

    await expect(client.embed(inputText as never)).rejects.toThrow(message);

    expect(factory).not.toHaveBeenCalled();
  });

  it("rejects malformed extractor factory results", async () => {
    const client = createTransformersEmbeddingClient({
      model: "Xenova/all-MiniLM-L6-v2",
      createExtractor: async () => null as never,
    });

    await expect(client.embed("hello")).rejects.toThrow(
      "transformers feature extractor must be a function",
    );
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

  it("uses the extractor tokenizer for chunking and rejects oversized direct inputs before inference", async () => {
    const encode = vi.fn((text: string, options: { add_special_tokens: boolean }) =>
      Array.from({ length: Array.from(text).length + (options.add_special_tokens ? 2 : 0) }, () => 1),
    );
    const infer = vi.fn(async () => ({ data: [1] }));
    const extractor: FeatureExtractor = Object.assign(infer, {
      tokenizer: { model_max_length: 5, encode },
    });
    const factory = vi.fn(async () => extractor);
    const client = createTransformersEmbeddingClient({ model: "test", createExtractor: factory });

    const tokenizer = await client.getChunkingTokenizer!();
    expect(tokenizer.maxInputTokens).toBe(5);
    expect(tokenizer.countTokens("abc", false)).toBe(3);
    expect(encode).toHaveBeenCalledWith("abc", { add_special_tokens: false });
    await expect(client.embed("abc")).resolves.toEqual([1]);
    expect(infer).toHaveBeenCalledTimes(1);

    const sensitiveInput = "secret";
    const error = await client.embed(sensitiveInput).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(EmbeddingInputTooLongError);
    expect(error).toMatchObject({ actualTokens: 8, maxInputTokens: 5 });
    expect((error as Error).message).not.toContain(sensitiveInput);
    expect(infer).toHaveBeenCalledTimes(1);
    expect(encode).toHaveBeenLastCalledWith(sensitiveInput, { add_special_tokens: true });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("keeps embed-only extractor fakes working but rejects tokenizer requests", async () => {
    const client = createTransformersEmbeddingClient({
      model: "test",
      createExtractor: async () => async () => ({ data: [1] }),
    });
    await expect(client.embed("hello")).resolves.toEqual([1]);
    await expect(client.getChunkingTokenizer!()).rejects.toThrow(
      "transformers feature extractor tokenizer is required for chunking",
    );
  });

  it.each([0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an invalid extractor tokenizer limit %s", async (model_max_length) => {
      const extractor: FeatureExtractor = Object.assign(async () => ({ data: [1] }), {
        tokenizer: { model_max_length, encode: () => [1] },
      });
      const client = createTransformersEmbeddingClient({ model: "test", createExtractor: async () => extractor });
      await expect(client.embed("hello")).rejects.toThrow(
        "transformers tokenizer model_max_length must be a positive safe integer",
      );
    },
  );

  it("rejects invalid tokenizer output before inference", async () => {
    const infer = vi.fn(async () => ({ data: [1] }));
    const extractor: FeatureExtractor = Object.assign(infer, {
      tokenizer: { model_max_length: 5, encode: () => null as never },
    });
    const client = createTransformersEmbeddingClient({ model: "test", createExtractor: async () => extractor });
    await expect(client.embed("hello")).rejects.toThrow("transformers tokenizer encode must return token IDs");
    expect(infer).not.toHaveBeenCalled();
  });

  it("requires a tokenizer for the default feature-extraction pipeline", async () => {
    vi.doMock("@huggingface/transformers", () => ({
      pipeline: async () => async () => ({ data: [1] }),
    }));
    try {
      const client = createTransformersEmbeddingClient({ model: "test" });
      await expect(client.embed("hello")).rejects.toThrow("transformers feature extractor tokenizer is required");
    } finally {
      vi.doUnmock("@huggingface/transformers");
    }
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

  it.each([
    {
      inputs: null,
      message: "inputs must be an array",
    },
    {
      inputs: ["valid", " \n\t "],
      message: "inputs[1] must contain non-whitespace text",
    },
  ])("embedBatch rejects malformed input before loading the extractor %#", async ({
    inputs,
    message,
  }) => {
    const factory = vi.fn(async (): Promise<FeatureExtractor> => {
      return async () => ({ data: new Float32Array([0.5]) });
    });
    const client = createTransformersEmbeddingClient({
      model: "Xenova/all-MiniLM-L6-v2",
      createExtractor: factory,
    });

    await expect(client.embedBatch(inputs as never)).rejects.toThrow(message);

    expect(factory).not.toHaveBeenCalled();
  });
});
