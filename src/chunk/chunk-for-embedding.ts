import { chunkText, type ChunkTextInput, type TextChunk } from "./chunk-text.js";
import type {
  EmbeddingChunkingTokenizer,
  EmbeddingProvider,
} from "../embedding/embedding-provider.js";

export async function chunkForEmbedding(
  input: ChunkTextInput,
  embeddings: Pick<EmbeddingProvider, "getChunkingTokenizer">,
): Promise<TextChunk[]> {
  const fallback = chunkText(input);
  if (!embeddings.getChunkingTokenizer || fallback.length === 0) {
    return fallback;
  }

  const tokenizer = await embeddings.getChunkingTokenizer();
  assertTokenizer(tokenizer);
  const limit = Math.min(input.targetTokens, tokenizer.maxInputTokens);
  const offsets = [0];
  for (const character of input.text) {
    offsets.push(offsets[offsets.length - 1]! + character.length);
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let covered = 0;
  const endOfText = offsets.length - 1;
  while (covered < endOfText) {
    let end = findChunkEnd(input.text, offsets, start, covered, tokenizer, limit);
    if (end === null && start < covered) {
      start = covered;
      end = findChunkEnd(input.text, offsets, start, covered, tokenizer, limit);
    }
    if (end === null) {
      throw new Error("Unable to fit remaining text within the embedding token limit");
    }
    if (end < endOfText) {
      end = preferWhitespace(input.text, offsets, start, covered, end, tokenizer, limit);
      end = preserveTrailingWhitespace(input.text, offsets, start, covered, end, tokenizer, limit);
    }

    const startOffset = offsets[start]!;
    const endOffset = offsets[end]!;
    const content = input.text.slice(startOffset, endOffset);
    if (countTokens(tokenizer, content, true) > limit) {
      throw new Error("Chunk exceeds the embedding token limit");
    }
    chunks.push({ chunkIndex: chunks.length, content, startOffset, endOffset });
    covered = end;
    if (covered === endOfText) break;
    const payloadTokens = countTokens(tokenizer, content, false);
    const overlap = Math.min(input.overlapTokens, Math.max(0, payloadTokens - 1));
    start = findOverlapStart(input.text, offsets, start, end, tokenizer, overlap);
  }
  return chunks;
}

function findChunkEnd(
  text: string,
  offsets: number[],
  start: number,
  covered: number,
  tokenizer: EmbeddingChunkingTokenizer,
  limit: number,
): number | null {
  const last = offsets.length - 1;
  let firstContent = start;
  while (firstContent < last && isWhitespace(text.slice(offsets[firstContent], offsets[firstContent + 1]))) {
    firstContent += 1;
  }
  const minimum = Math.max(covered + 1, firstContent + 1);
  if (minimum > last) return null;

  let probe = Math.min(last, Math.max(minimum, start + Math.min(limit, last - start) * 4));
  let best: number | null = null;
  let upper = last;
  while (true) {
    const fits = countTokens(tokenizer, text.slice(offsets[start], offsets[probe]), true) <= limit;
    if (!fits) {
      upper = probe - 1;
      break;
    }
    best = probe;
    if (probe === last) return probe;
    probe = Math.min(last, start + (probe - start) * 2);
  }

  let lower = best === null ? minimum : best + 1;
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (countTokens(tokenizer, text.slice(offsets[start], offsets[middle]), true) <= limit) {
      best = middle;
      lower = middle + 1;
    } else {
      upper = middle - 1;
    }
  }
  if (best !== null) return best;

  // Token counts can decrease as text grows, so a failed binary search is not proof that no slice fits.
  for (let end = minimum; end <= last; end += 1) {
    if (countTokens(tokenizer, text.slice(offsets[start], offsets[end]), true) <= limit) return end;
  }
  return null;
}

function preferWhitespace(
  text: string,
  offsets: number[],
  start: number,
  covered: number,
  end: number,
  tokenizer: EmbeddingChunkingTokenizer,
  limit: number,
): number {
  // shortcut: only search the latter half to avoid tiny chunks, widen if boundary quality needs it.
  const minimum = Math.max(covered + 1, start + Math.floor((end - start) / 2));
  for (let boundary = end; boundary >= minimum; boundary -= 1) {
    if (
      isWhitespace(text.slice(offsets[boundary - 1], offsets[boundary])) &&
      !isWhitespace(text.slice(offsets[boundary], offsets[boundary + 1])) &&
      /\S/u.test(text.slice(offsets[start], offsets[boundary])) &&
      countTokens(tokenizer, text.slice(offsets[start], offsets[boundary]), true) <= limit
    ) return boundary;
  }
  return end;
}

function preserveTrailingWhitespace(
  text: string,
  offsets: number[],
  start: number,
  covered: number,
  end: number,
  tokenizer: EmbeddingChunkingTokenizer,
  limit: number,
): number {
  if (/\S/u.test(text.slice(offsets[end]))) return end;
  let lastContent = end - 1;
  while (lastContent > start && isWhitespace(text.slice(offsets[lastContent], offsets[lastContent + 1]))) {
    lastContent -= 1;
  }
  if (
    lastContent > covered &&
    /\S/u.test(text.slice(offsets[start], offsets[lastContent])) &&
    countTokens(tokenizer, text.slice(offsets[start], offsets[lastContent]), true) <= limit &&
    countTokens(tokenizer, text.slice(offsets[lastContent]), true) <= limit
  ) return lastContent;
  return end;
}

function findOverlapStart(
  text: string,
  offsets: number[],
  start: number,
  end: number,
  tokenizer: EmbeddingChunkingTokenizer,
  overlap: number,
): number {
  if (overlap === 0) return end;
  let lower = start + 1;
  let upper = end - 1;
  let best = end;
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (countTokens(tokenizer, text.slice(offsets[middle], offsets[end]), false) <= overlap) {
      best = middle;
      upper = middle - 1;
    } else {
      lower = middle + 1;
    }
  }
  return best;
}

function isWhitespace(character: string): boolean {
  return /^\s$/u.test(character);
}

function countTokens(
  tokenizer: EmbeddingChunkingTokenizer,
  text: string,
  addSpecialTokens: boolean,
): number {
  const count = tokenizer.countTokens(text, addSpecialTokens);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("tokenizer token count must be a non-negative safe integer");
  }
  return count;
}

function assertTokenizer(value: unknown): asserts value is EmbeddingChunkingTokenizer {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("embedding tokenizer must be an object");
  }
  const tokenizer = value as Record<string, unknown>;
  if (!Number.isSafeInteger(tokenizer.maxInputTokens) || (tokenizer.maxInputTokens as number) < 1) {
    throw new Error("tokenizer maxInputTokens must be a positive safe integer");
  }
  if (typeof tokenizer.countTokens !== "function") {
    throw new Error("tokenizer countTokens must be a function");
  }
}
