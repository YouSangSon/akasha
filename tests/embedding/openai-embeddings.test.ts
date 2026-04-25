import { describe, expect, it, vi } from "vitest";
import {
  createOpenAiEmbeddingClient,
  type EmbeddingsCreateClient,
} from "../../src/embedding/openai-embeddings.js";

describe("createOpenAiEmbeddingClient", () => {
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
});
