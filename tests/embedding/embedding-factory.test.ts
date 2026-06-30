import { describe, expect, it } from "vitest";
import {
  createEmbeddingProvider,
  isKnownEmbeddingProvider,
} from "../../src/embedding/embedding-factory.js";

describe("createEmbeddingProvider", () => {
  it.each([
    {
      input: null,
      message: "embedding provider input must be an object",
    },
    {
      input: { config: null },
      message: "embedding provider config must be an object",
    },
    {
      input: {
        config: {
          provider: "remote",
          model: "local-deterministic-v1",
          dimensions: 384,
        },
      },
      message: 'provider must be "openai", "local", or "transformers"',
    },
    {
      input: {
        config: {
          provider: "local",
          model: " \n\t ",
          dimensions: 384,
        },
      },
      message: "model must contain non-whitespace text",
    },
    {
      input: {
        config: {
          provider: "local",
          model: "local-deterministic-v1",
          dimensions: 0,
        },
      },
      message: "dimensions must be a positive safe integer",
    },
    {
      input: {
        config: {
          provider: "local",
          model: "local-deterministic-v1",
          dimensions: 384,
        },
        openaiApiKey: 123,
      },
      message: "openaiApiKey must be a string",
    },
  ])("rejects malformed input %#", ({ input, message }) => {
    expect(() => createEmbeddingProvider(input as never)).toThrow(message);
  });

  it.each([
    {
      input: {
        config: {
          provider: "openai",
          model: "text-embedding-3-small",
          dimensions: 1536,
        },
      },
    },
    {
      input: {
        config: {
          provider: "openai",
          model: "text-embedding-3-small",
          dimensions: 1536,
        },
        openaiApiKey: " \n\t ",
      },
    },
  ])("requires a nonblank API key for OpenAI provider %#", ({ input }) => {
    expect(() => createEmbeddingProvider(input as never)).toThrow(
      "EMBEDDING_PROVIDER=openai requires OPENAI_API_KEY",
    );
  });

  it("routes local provider config to the local embedding client", async () => {
    const provider = createEmbeddingProvider({
      config: {
        provider: "local",
        model: "local-deterministic-v1",
        dimensions: 3,
      },
      openaiApiKey: "",
    });

    await expect(provider.embed("local input")).resolves.toHaveLength(3);
  });
});

describe("isKnownEmbeddingProvider", () => {
  it.each(["openai", "local", "transformers"])("accepts %s", (provider) => {
    expect(isKnownEmbeddingProvider(provider)).toBe(true);
  });

  it("rejects unknown provider names", () => {
    expect(isKnownEmbeddingProvider("remote")).toBe(false);
  });
});
