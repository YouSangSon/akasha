export type TextChunk = {
  chunkIndex: number;
  content: string;
  startOffset: number;
  endOffset: number;
};

export type ChunkTextInput = {
  text: string;
  targetTokens: number;
  overlapTokens: number;
};

function assertChunkTextInput(input: unknown): asserts input is ChunkTextInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("chunkText input must be an object");
  }

  const candidate = input as Record<string, unknown>;

  if (typeof candidate.text !== "string") {
    throw new Error("text must be a string");
  }

  if (
    typeof candidate.targetTokens !== "number" ||
    !Number.isSafeInteger(candidate.targetTokens)
  ) {
    throw new Error("targetTokens must be a positive safe integer");
  }

  if (candidate.targetTokens < 1) {
    throw new Error("targetTokens must be greater than 0");
  }

  if (
    typeof candidate.overlapTokens !== "number" ||
    !Number.isSafeInteger(candidate.overlapTokens) ||
    candidate.overlapTokens < 0
  ) {
    throw new Error("overlapTokens must be a non-negative safe integer");
  }

  if (candidate.overlapTokens >= candidate.targetTokens) {
    throw new Error("overlapTokens must be smaller than targetTokens");
  }
}

export function chunkText(input: ChunkTextInput): TextChunk[] {
  assertChunkTextInput(input);

  const { overlapTokens, targetTokens, text } = input;
  const tokenMatches = [...text.matchAll(/\S+/g)];

  if (tokenMatches.length === 0) {
    return [];
  }

  const step = targetTokens - overlapTokens;
  const chunks: TextChunk[] = [];

  for (
    let startTokenIndex = 0, chunkIndex = 0;
    startTokenIndex < tokenMatches.length;
    startTokenIndex += step, chunkIndex += 1
  ) {
    const endTokenIndex = Math.min(
      tokenMatches.length,
      startTokenIndex + targetTokens,
    );
    const startMatch = tokenMatches[startTokenIndex];
    const endMatch = tokenMatches[endTokenIndex - 1];

    if (startMatch?.index === undefined || endMatch?.index === undefined) {
      throw new Error("Unable to resolve chunk token offsets");
    }

    const startOffset = startMatch.index;
    const endOffset = endMatch.index + endMatch[0].length;

    chunks.push({
      chunkIndex,
      content: text.slice(startOffset, endOffset),
      startOffset,
      endOffset,
    });

    if (endTokenIndex === tokenMatches.length) {
      break;
    }
  }

  return chunks;
}
