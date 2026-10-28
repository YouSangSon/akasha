import { describe, expect, it, vi } from "vitest";
import { chunkForEmbedding } from "../../src/chunk/chunk-for-embedding.js";
import { createTransformersEmbeddingClient, type FeatureExtractor } from "../../src/embedding/transformers-embedding.js";
import { embedQuery, embedSimilarityBatch, MULTILINGUAL_E5_MODEL } from "../../src/embedding/embedding-provider.js";

function fixture(model = MULTILINGUAL_E5_MODEL) {
  const extractor: FeatureExtractor = vi.fn(async () => ({ data: [1, 0] }));
  extractor.tokenizer = {
    model_max_length: 24,
    encode: (text, { add_special_tokens }) => Array.from({ length: [...text].length + (add_special_tokens ? 2 : 0) }, (_, i) => i),
  };
  return { extractor, client: createTransformersEmbeddingClient({ model, createExtractor: async () => extractor }) };
}

describe("E5 task formatting", () => {
  it("formats documents, queries and symmetric comparisons with their trained prefixes", async () => {
    const { extractor, client } = fixture();
    await client.embed("본문");
    await client.embedBatch(["文書", "文档"]);
    await embedQuery(client, "질문");
    await embedSimilarityBatch(client, ["비교", "比較"]);
    expect(vi.mocked(extractor).mock.calls.map(([text]) => text)).toEqual([
      "passage: 본문", "passage: 文書", "passage: 文档", "query: 질문", "query: 비교", "query: 比較",
    ]);
  });

  it("counts the actual prefixed model input at both limits and keeps raw overlap counts", async () => {
    const { extractor, client } = fixture();
    const tokenizer = await client.getChunkingTokenizer!();
    expect(tokenizer.countTokens("한", true)).toBe(12);
    expect(tokenizer.countTokens("한", false)).toBe(1);
    await client.embed("a".repeat(13));
    await expect(client.embed("a".repeat(14))).rejects.toThrow("25 tokens; maximum is 24");
    await embedQuery(client, "a".repeat(15));
    await expect(embedQuery(client, "a".repeat(16))).rejects.toThrow("25 tokens; maximum is 24");
    expect(extractor).toHaveBeenCalledTimes(2);
  });

  it("fits formatted chunks while preserving the original CJK/emoji body and offsets", async () => {
    const { client } = fixture();
    const text = "한국어 日本語 中文 🌏 ".repeat(4);
    const chunks = await chunkForEmbedding({ text, targetTokens: 24, overlapTokens: 2 }, client);
    const tokenizer = await client.getChunkingTokenizer!();
    let covered = 0;
    for (const chunk of chunks) {
      expect(chunk.content).toBe(text.slice(chunk.startOffset, chunk.endOffset));
      expect(chunk.startOffset).toBeLessThanOrEqual(covered);
      expect(chunk.endOffset).toBeGreaterThan(covered);
      expect(tokenizer.countTokens(chunk.content, true)).toBeLessThanOrEqual(24);
      await client.embed(chunk.content);
      covered = chunk.endOffset;
    }
    expect(covered).toBe(text.length);
  });

  it("keeps the default transformer input unchanged and existing provider batching intact", async () => {
    const { extractor, client } = fixture("Xenova/all-MiniLM-L6-v2");
    await embedQuery(client, "hello");
    await embedSimilarityBatch(client, ["first", "second"]);
    expect(vi.mocked(extractor).mock.calls.map(([text]) => text)).toEqual(["hello", "first", "second"]);
    const provider = { embed: vi.fn().mockResolvedValue([1]), embedBatch: vi.fn().mockResolvedValue([[1], [2]]) };
    await embedQuery(provider, "query");
    await embedSimilarityBatch(provider, ["first", "second"]);
    expect(provider.embed).toHaveBeenCalledWith("query");
    expect(provider.embedBatch).toHaveBeenCalledExactlyOnceWith(["first", "second"]);
  });
});
