import { describe, expect, it } from "vitest";
import {
  chunkText,
  type ChunkTextInput,
} from "../../src/chunk/chunk-text.js";

const callChunkText = (input: unknown) => () =>
  chunkText(input as ChunkTextInput);

describe("chunkText", () => {
  it("creates deterministic overlapping chunks with stable offsets", () => {
    const text = "alpha ".repeat(1_600).trimEnd();

    const chunks = chunkText({
      text,
      targetTokens: 800,
      overlapTokens: 120,
    });

    expect(chunks.length).toBe(3);
    expect(chunks[0]).toEqual({
      chunkIndex: 0,
      content: "alpha ".repeat(800).trimEnd(),
      startOffset: 0,
      endOffset: "alpha ".repeat(800).trimEnd().length,
    });
    expect(chunks[1]?.chunkIndex).toBe(1);
    expect(chunks[1]?.content).toBe("alpha ".repeat(800).trimEnd());
    expect(chunks[1]?.startOffset).toBeGreaterThan(0);
    expect(chunks[1]?.startOffset).toBeLessThan(chunks[0]!.endOffset);
    expect(chunks[1]?.endOffset).toBeGreaterThan(chunks[0]!.endOffset);
    expect(chunks[2]).toEqual({
      chunkIndex: 2,
      content: "alpha ".repeat(240).trimEnd(),
      startOffset: "alpha ".repeat(1_360).length,
      endOffset: text.length,
    });
  });

  it("returns no chunks for blank text", () => {
    expect(
      chunkText({
        text: "   \n\t  ",
        targetTokens: 800,
        overlapTokens: 120,
      }),
    ).toEqual([]);
  });

  it.each([undefined, null, "hello", 12, true, []])(
    "rejects non-object input before reading properties",
    (input) => {
      expect(callChunkText(input)).toThrow("chunkText input must be an object");
    },
  );

  it("rejects non-string text before tokenization", () => {
    expect(
      callChunkText({
        text: { matchAll: () => [] },
        targetTokens: 800,
        overlapTokens: 120,
      }),
    ).toThrow("text must be a string");
  });

  it("rejects invalid target token settings before blank text can short-circuit", () => {
    expect(
      callChunkText({
        text: "   \n\t  ",
        targetTokens: 0,
        overlapTokens: 0,
      }),
    ).toThrow("targetTokens must be greater than 0");

    expect(
      callChunkText({
        text: "   \n\t  ",
        targetTokens: 1.5,
        overlapTokens: 0,
      }),
    ).toThrow("targetTokens must be a positive safe integer");
  });

  it("rejects invalid overlap token settings before chunking", () => {
    expect(
      callChunkText({
        text: "alpha beta",
        targetTokens: 2,
        overlapTokens: -1,
      }),
    ).toThrow("overlapTokens must be a non-negative safe integer");

    expect(
      callChunkText({
        text: "alpha beta",
        targetTokens: 2,
        overlapTokens: 2,
      }),
    ).toThrow("overlapTokens must be smaller than targetTokens");
  });
});
