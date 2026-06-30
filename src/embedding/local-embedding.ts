import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "./embedding-provider.js";

// Deterministic, offline embedding provider. Useful for:
//   - Local dev without OpenAI quota
//   - Air-gapped CI runs
//   - Reproducible test fixtures
//
// NOT semantically meaningful — two paraphrased queries will not be close in
// vector space. Use ONLY for plumbing tests; production retrieval quality
// requires a real model (OpenAI, Naver HyperClova, on-prem sLLM, etc.).
//
// Algorithm: SHA-256(counter + "\0" + inputText) → expand to `dimensions`
// floats by hashing repeatedly with the counter suffix. Then L2-normalize so
// cosine similarity behaves on the unit hypersphere like Qdrant expects.

export type LocalEmbeddingClientInput = {
  dimensions: number;
};

export function createLocalEmbeddingClient(
  input: LocalEmbeddingClientInput,
): EmbeddingProvider {
  assertLocalEmbeddingClientInput(input);

  async function embedOne(inputText: string): Promise<number[]> {
    assertNonBlankText(inputText, "inputText");

    const dims = input.dimensions;
    const floats: number[] = new Array(dims);

    // Each round of SHA-256 yields 32 bytes = 8 uint32s. Loop until we have
    // enough; the counter suffix ensures rounds are distinct.
    let written = 0;
    let counter = 0;
    while (written < dims) {
      const hash = createHash("sha256")
        .update(`${counter}\0${inputText}`)
        .digest();
      for (let i = 0; i + 4 <= hash.length && written < dims; i += 4) {
        // Read 4 bytes as a uint32, map to [-1, 1].
        const u32 = hash.readUInt32BE(i);
        floats[written] = (u32 / 0xffff_ffff) * 2 - 1;
        written += 1;
      }
      counter += 1;
    }

    // L2 normalize — Qdrant configured for cosine expects unit-length vectors.
    let normSquared = 0;
    for (const v of floats) {
      normSquared += v * v;
    }
    const norm = Math.sqrt(normSquared) || 1;
    return floats.map((v) => v / norm);
  }

  return {
    embed: embedOne,
    async embedBatch(inputs: string[]): Promise<number[][]> {
      assertEmbeddingInputBatch(inputs);

      // SHA-256 is pure CPU — no per-call overhead, so batching is just N
      // sequential hashes. Kept here to satisfy the EmbeddingProvider contract
      // and to keep call-site shape uniform across providers.
      return Promise.all(inputs.map(embedOne));
    },
  };
}

function assertLocalEmbeddingClientInput(
  value: unknown,
): asserts value is LocalEmbeddingClientInput {
  const candidate = assertObject(value, "local embedding client input");
  if (
    typeof candidate.dimensions !== "number"
    || !Number.isSafeInteger(candidate.dimensions)
    || candidate.dimensions < 1
  ) {
    throw new Error(
      `local embedding dimensions must be a positive integer, got ${String(candidate.dimensions)}`,
    );
  }
}

function assertEmbeddingInputBatch(value: unknown): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new Error("inputs must be an array");
  }

  for (const [index, input] of value.entries()) {
    assertNonBlankText(input, `inputs[${index}]`);
  }
}

function assertObject(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertNonBlankText(
  value: unknown,
  fieldName: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} must contain non-whitespace text`);
  }
}
