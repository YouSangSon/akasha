import { describe, expect, it } from "vitest";
import { chunkForEmbedding } from "../../src/chunk/chunk-for-embedding.js";
import { chunkText, type ChunkTextInput, type TextChunk } from "../../src/chunk/chunk-text.js";
import type { EmbeddingChunkingTokenizer } from "../../src/embedding/embedding-provider.js";

const characters: EmbeddingChunkingTokenizer = {
  maxInputTokens: 8,
  countTokens: (text, special) =>
    Array.from(text).filter((character) => !/\s/u.test(character)).length + (special ? 2 : 0),
};

function provider(tokenizer: EmbeddingChunkingTokenizer) {
  return { getChunkingTokenizer: async () => tokenizer };
}

function expectCovered(
  text: string,
  chunks: TextChunk[],
  tokenizer: EmbeddingChunkingTokenizer,
  limit: number,
  overlap: number,
) {
  expect(chunks[0]?.startOffset).toBe(0);
  expect(chunks.at(-1)?.endOffset).toBe(text.length);
  for (const [index, chunk] of chunks.entries()) {
    expect(chunk.chunkIndex).toBe(index);
    expect(chunk.content).toBe(text.slice(chunk.startOffset, chunk.endOffset));
    expect(chunk.content.trim()).not.toBe("");
    expect(tokenizer.countTokens(chunk.content, true)).toBeLessThanOrEqual(limit);
    for (const offset of [chunk.startOffset, chunk.endOffset]) {
      expect(
        /[\uD800-\uDBFF]/u.test(text[offset - 1] ?? "") &&
          /[\uDC00-\uDFFF]/u.test(text[offset] ?? ""),
      ).toBe(false);
    }
    const previous = chunks[index - 1];
    if (previous) {
      expect(chunk.startOffset).toBeGreaterThan(previous.startOffset);
      expect(chunk.startOffset).toBeLessThanOrEqual(previous.endOffset);
      expect(chunk.endOffset).toBeGreaterThan(previous.endOffset);
      expect(tokenizer.countTokens(text.slice(chunk.startOffset, previous.endOffset), false))
        .toBeLessThanOrEqual(overlap);
    }
  }
}

describe("chunkForEmbedding", () => {
  it("retains chunkText behavior for providers without a tokenizer", async () => {
    const input = { text: "  alpha beta gamma  ", targetTokens: 2, overlapTokens: 1 };
    await expect(chunkForEmbedding(input, {})).resolves.toEqual(chunkText(input));
    await expect(chunkForEmbedding({ ...input, text: "   " }, provider(characters))).resolves.toEqual([]);
    await expect(chunkForEmbedding({ ...input, targetTokens: 0 }, provider(characters)))
      .rejects.toThrow("targetTokens must be greater than 0");
  });

  it("uses original UTF-16 slices and covers early, middle and tail text with bounded overlap", async () => {
    const text = "  abc def 😀ghi jkl 😃mno pqr stu  ";
    const input = { text, targetTokens: 30, overlapTokens: 2 };
    const chunks = await chunkForEmbedding(input, provider(characters));
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.some((chunk) => chunk.content.includes("😀"))).toBe(true);
    expect(chunks.some((chunk) => chunk.content.includes("😃"))).toBe(true);
    expectCovered(text, chunks, characters, characters.maxInputTokens, input.overlapTokens);
  });

  it("prefers word boundaries when they fit", async () => {
    const text = "one two three four";
    const chunks = await chunkForEmbedding(
      { text, targetTokens: 8, overlapTokens: 0 },
      provider(characters),
    );
    expect(chunks[0]?.content).toBe("one two ");
    expectCovered(text, chunks, characters, 8, 0);
  });

  it("splits CJK and unbroken input by actual token counts", async () => {
    const wordpieces: EmbeddingChunkingTokenizer = {
      maxInputTokens: 9,
      countTokens: (text, special) =>
        (text.match(/\S+/gu)?.reduce((count, word) => count + Math.ceil(Array.from(word).length / 2), 0) ?? 0) +
        (special ? 2 : 0),
    };
    for (const text of ["한글문서에는공백이없습니다끝", "abcdefghijklmnopqrstuvwxyz"]) {
      const input = { text, targetTokens: 8, overlapTokens: 2 };
      const chunks = await chunkForEmbedding(input, provider(wordpieces));
      expect(chunks.length).toBeGreaterThan(1);
      expectCovered(text, chunks, wordpieces, input.targetTokens, input.overlapTokens);
    }
  });

  it("does not truncate an 800-word record when the tokenizer has a 512-token limit", async () => {
    const words = Array.from({ length: 800 }, (_, index) => index === 600 ? "banana" : "hello");
    const input = { text: words.join(" "), targetTokens: 800, overlapTokens: 120 };
    const tokenizer: EmbeddingChunkingTokenizer = {
      maxInputTokens: 512,
      countTokens: (text, special) => (text.match(/\S+/gu)?.length ?? 0) + (special ? 2 : 0),
    };
    expect(tokenizer.countTokens(chunkText(input)[0]!.content, true)).toBe(802);
    const chunks = await chunkForEmbedding(input, provider(tokenizer));
    expect(chunks.some((chunk) => chunk.content.includes("banana"))).toBe(true);
    expectCovered(input.text, chunks, tokenizer, 512, 120);
  });

  it("handles an exact token limit and a partial final chunk", async () => {
    const tokenizer = { ...characters, maxInputTokens: 7 };
    const input = { text: "abcde", targetTokens: 7, overlapTokens: 0 };
    const exact = await chunkForEmbedding(input, provider(tokenizer));
    expect(exact.map((chunk) => chunk.content)).toEqual(["abcde"]);
    const partial = await chunkForEmbedding({ ...input, text: "abcdef" }, provider(tokenizer));
    expect(partial.map((chunk) => chunk.content)).toEqual(["abcde", "f"]);
    expectCovered("abcdef", partial, tokenizer, 7, 0);
  });

  it("bounds overlap by actual payload and retries without overlap when needed for progress", async () => {
    const tokenizer: EmbeddingChunkingTokenizer = {
      maxInputTokens: 4,
      countTokens: (text, special) =>
        Array.from(text).length + (special ? 2 : 0) + (text === "bc" && special ? 1 : 0),
    };
    const text = "abcde";
    const chunks = await chunkForEmbedding({ text, targetTokens: 10, overlapTokens: 8 }, provider(tokenizer));
    expect(chunks[0]?.content).toBe("ab");
    expect(chunks[1]?.startOffset).toBe(chunks[0]?.endOffset);
    expectCovered(text, chunks, tokenizer, 4, 1);
    for (const [index, chunk] of chunks.entries()) {
      const previous = chunks[index - 1];
      if (previous) {
        const overlap = tokenizer.countTokens(text.slice(chunk.startOffset, previous.endOffset), false);
        expect(overlap).toBeLessThan(tokenizer.countTokens(previous.content, false));
      }
    }
  });

  it("keeps trailing whitespace covered without emitting a blank chunk", async () => {
    const tokenizer: EmbeddingChunkingTokenizer = {
      maxInputTokens: 6,
      countTokens: (text, special) => Array.from(text).length + (special ? 2 : 0),
    };
    const text = "abcd  ";
    const chunks = await chunkForEmbedding({ text, targetTokens: 6, overlapTokens: 0 }, provider(tokenizer));
    expect(chunks.map((chunk) => chunk.content)).toEqual(["abc", "d  "]);
    expectCovered(text, chunks, tokenizer, 6, 0);
  });

  it("finds a fitting slice even when token counts decrease as a prefix grows", async () => {
    const tokenizer: EmbeddingChunkingTokenizer = {
      maxInputTokens: 3,
      countTokens: (text, special) => {
        if (text.length === 0) return special ? 2 : 0;
        const count = text === "a" || text === "ab" || text === "abcd" ? 3 : 1;
        return count + (special ? 2 : 0);
      },
    };
    const text = "abcd";
    const chunks = await chunkForEmbedding({ text, targetTokens: 3, overlapTokens: 0 }, provider(tokenizer));
    expect(chunks.map((chunk) => chunk.content)).toEqual(["abc", "d"]);
    expectCovered(text, chunks, tokenizer, 3, 0);
  });

  it.each([0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an invalid tokenizer limit %s", async (maxInputTokens) => {
      const tokenizer = { ...characters, maxInputTokens };
      await expect(chunkForEmbedding({ text: "hello", targetTokens: 8, overlapTokens: 0 }, provider(tokenizer)))
        .rejects.toThrow("tokenizer maxInputTokens must be a positive safe integer");
    },
  );

  it.each([-1, 1.5, Infinity, NaN])("rejects invalid tokenizer count %s", async (count) => {
    const tokenizer = { ...characters, countTokens: () => count };
    await expect(chunkForEmbedding({ text: "hello", targetTokens: 8, overlapTokens: 0 }, provider(tokenizer)))
      .rejects.toThrow("tokenizer token count must be a non-negative safe integer");
  });

  it("rejects invalid payload counts used to calculate overlap", async () => {
    const tokenizer = { ...characters, countTokens: (text: string, special: boolean) => special ? text.length + 2 : -1 };
    await expect(chunkForEmbedding({ text: "abcdefghij", targetTokens: 8, overlapTokens: 2 }, provider(tokenizer)))
      .rejects.toThrow("tokenizer token count must be a non-negative safe integer");
  });

  it("fails when no nonblank slice fits the limit", async () => {
    const input: ChunkTextInput = { text: "abc", targetTokens: 2, overlapTokens: 0 };
    await expect(chunkForEmbedding(input, provider(characters)))
      .rejects.toThrow("Unable to fit remaining text within the embedding token limit");
  });
});
