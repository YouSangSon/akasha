import { describe, expect, it, vi } from "vitest";
import { createQdrantClient } from "../../src/qdrant/client.js";

vi.mock("@qdrant/js-client-rest", () => ({
  QdrantClient: class FakeQdrantClient {
    readonly options: unknown;

    constructor(options: unknown) {
      this.options = options;
    }
  },
}));

describe("createQdrantClient", () => {
  it.each([
    {
      input: null,
      message: "qdrant client input must be an object",
    },
    {
      input: { url: 123, apiKey: "local-qdrant-key" },
      message: "url must be a string",
    },
    {
      input: { url: " \n\t ", apiKey: "local-qdrant-key" },
      message: "url must contain non-whitespace text",
    },
    {
      input: { url: "http://127.0.0.1:6333", apiKey: 123 },
      message: "apiKey must be a string",
    },
    {
      input: { url: "http://127.0.0.1:6333", apiKey: " \n\t " },
      message: "apiKey must contain non-whitespace text",
    },
  ])("rejects malformed input %#", ({ input, message }) => {
    expect(() => createQdrantClient(input as never)).toThrow(message);
  });

  it("constructs a Qdrant client for valid local config", () => {
    expect(
      createQdrantClient({
        url: "http://127.0.0.1:6333",
        apiKey: "local-qdrant-key",
      }),
    ).toMatchObject({
      options: {
        url: "http://127.0.0.1:6333",
        apiKey: "local-qdrant-key",
      },
    });
  });
});
