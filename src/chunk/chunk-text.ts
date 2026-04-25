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

export function chunkText(input: ChunkTextInput): TextChunk[] {
  const tokenMatches = [...input.text.matchAll(/\S+/g)];

  if (tokenMatches.length === 0) {
    return [];
  }

  const step = input.targetTokens - input.overlapTokens;

  if (input.targetTokens < 1) {
    throw new Error("targetTokens must be greater than 0");
  }

  if (step < 1) {
    throw new Error("overlapTokens must be smaller than targetTokens");
  }

  const chunks: TextChunk[] = [];

  for (
    let startTokenIndex = 0, chunkIndex = 0;
    startTokenIndex < tokenMatches.length;
    startTokenIndex += step, chunkIndex += 1
  ) {
    const endTokenIndex = Math.min(
      tokenMatches.length,
      startTokenIndex + input.targetTokens,
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
      content: input.text.slice(startOffset, endOffset),
      startOffset,
      endOffset,
    });

    if (endTokenIndex === tokenMatches.length) {
      break;
    }
  }

  return chunks;
}
