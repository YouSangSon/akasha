import { describe, expect, it, vi } from "vitest";
import {
  createOpenAiEmbeddingClient,
  type EmbeddingsCreateClient,
} from "../../src/embedding/openai-embeddings.js";

describe("createOpenAiEmbeddingClient", () => {
  it.each([
    {
      input: null,
      message: "OpenAI embedding client input must be an object",
    },
    {
      input: {
        apiKey: " \n\t ",
        model: "text-embedding-3-small",
      },
      message: "apiKey must contain non-whitespace text",
    },
    {
      input: {
        apiKey: "__TEST_PLACEHOLDER__",
        model: 123,
      },
      message: "model must be a string",
    },
    {
      input: {
        apiKey: "__TEST_PLACEHOLDER__",
        model: "text-embedding-3-small",
        createClient: "not-a-function",
      },
      message: "createClient must be a function",
    },
    {
      input: {
        apiKey: "__TEST_PLACEHOLDER__",
        model: "text-embedding-3-small",
        createClient: () => null,
      },
      message: "OpenAI embeddings client must be an object",
    },
    {
      input: {
        apiKey: "__TEST_PLACEHOLDER__",
        model: "text-embedding-3-small",
        createClient: () => ({ embeddings: { create: "not-a-function" } }),
      },
      message: "OpenAI embeddings client.embeddings.create must be a function",
    },
  ])("rejects malformed client input %#", ({ input, message }) => {
    expect(() => createOpenAiEmbeddingClient(input as never)).toThrow(message);
  });

  it("requests embeddings through the injected client and returns the vector", async () => {
    const fakeApiKey = "__TEST_PLACEHOLDER__";
    const create = vi.fn(async () => ({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    }));

    const client = createOpenAiEmbeddingClient({
      apiKey: fakeApiKey,
      model: "text-embedding-3-small",
      createClient: () =>
        ({
          embeddings: {
            create,
          },
        }) satisfies EmbeddingsCreateClient,
    });

    await expect(client.embed("Always respond in Korean.")).resolves.toEqual([
      0.1, 0.2, 0.3,
    ]);
    expect(create).toHaveBeenCalledWith({
      input: "Always respond in Korean.",
      model: "text-embedding-3-small",
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
  ])("embed rejects malformed input before calling the API %#", async ({
    inputText,
    message,
  }) => {
    const create = vi.fn(async () => ({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    }));
    const client = createOpenAiEmbeddingClient({
      apiKey: "__TEST_PLACEHOLDER__",
      model: "text-embedding-3-small",
      createClient: () =>
        ({
          embeddings: { create },
        }) satisfies EmbeddingsCreateClient,
    });

    await expect(client.embed(inputText as never)).rejects.toThrow(message);

    expect(create).not.toHaveBeenCalled();
  });

  it("throws when the API returns no embedding data", async () => {
    const client = createOpenAiEmbeddingClient({
      apiKey: "__TEST_PLACEHOLDER__",
      model: "text-embedding-3-small",
      createClient: () =>
        ({
          embeddings: {
            create: vi.fn(async () => ({ data: [] })),
          },
        }) satisfies EmbeddingsCreateClient,
    });

    await expect(client.embed("hello")).rejects.toThrow(/no embedding/i);
  });

  it("throws when the API returns an empty embedding vector", async () => {
    const client = createOpenAiEmbeddingClient({
      apiKey: "__TEST_PLACEHOLDER__",
      model: "text-embedding-3-small",
      createClient: () =>
        ({
          embeddings: {
            create: vi.fn(async () => ({ data: [{ embedding: [] }] })),
          },
        }) satisfies EmbeddingsCreateClient,
    });

    await expect(client.embed("hello")).rejects.toThrow(/empty embedding/i);
  });

  it("embedBatch issues a single API call with the array input and returns vectors in input order", async () => {
    const create = vi.fn(async () => ({
      data: [
        { embedding: [0.1, 0.2] },
        { embedding: [0.3, 0.4] },
        { embedding: [0.5, 0.6] },
      ],
    }));

    const client = createOpenAiEmbeddingClient({
      apiKey: "__TEST_PLACEHOLDER__",
      model: "text-embedding-3-small",
      createClient: () =>
        ({
          embeddings: { create },
        }) satisfies EmbeddingsCreateClient,
    });

    const vectors = await client.embedBatch([
      "first chunk",
      "second chunk",
      "third chunk",
    ]);

    // Single HTTP call collapses what would have been three sequential
    // embed() round-trips — the cost/latency win F4 was added for.
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({
      input: ["first chunk", "second chunk", "third chunk"],
      model: "text-embedding-3-small",
    });
    expect(vectors).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
      [0.5, 0.6],
    ]);
  });

  it("embedBatch returns an empty array without calling the API for empty input", async () => {
    const create = vi.fn();
    const client = createOpenAiEmbeddingClient({
      apiKey: "__TEST_PLACEHOLDER__",
      model: "text-embedding-3-small",
      createClient: () =>
        ({
          embeddings: { create },
        }) satisfies EmbeddingsCreateClient,
    });

    const vectors = await client.embedBatch([]);

    expect(vectors).toEqual([]);
    expect(create).not.toHaveBeenCalled();
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
  ])("embedBatch rejects malformed input before calling the API %#", async ({
    inputs,
    message,
  }) => {
    const create = vi.fn(async () => ({
      data: [{ embedding: [0.1, 0.2] }],
    }));
    const client = createOpenAiEmbeddingClient({
      apiKey: "__TEST_PLACEHOLDER__",
      model: "text-embedding-3-small",
      createClient: () =>
        ({
          embeddings: { create },
        }) satisfies EmbeddingsCreateClient,
    });

    await expect(client.embedBatch(inputs as never)).rejects.toThrow(message);

    expect(create).not.toHaveBeenCalled();
  });

  it("embedBatch throws when the API returns a different number of embeddings than inputs", async () => {
    const client = createOpenAiEmbeddingClient({
      apiKey: "__TEST_PLACEHOLDER__",
      model: "text-embedding-3-small",
      createClient: () =>
        ({
          embeddings: {
            create: vi.fn(async () => ({
              data: [{ embedding: [0.1, 0.2] }],
            })),
          },
        }) satisfies EmbeddingsCreateClient,
    });

    await expect(client.embedBatch(["a", "b", "c"])).rejects.toThrow(
      /returned 1 embeddings for 3 inputs/i,
    );
  });
});
