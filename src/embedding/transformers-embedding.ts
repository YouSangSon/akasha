import type {
  EmbeddingChunkingTokenizer,
  EmbeddingProvider,
} from "./embedding-provider.js";
import { MULTILINGUAL_E5_MODEL } from "./embedding-provider.js";

// Free, local-first embedding provider backed by ONNX models from Hugging Face
// (via @huggingface/transformers). Default model is Xenova/all-MiniLM-L6-v2 —
// 384 dimensions, ~22MB ONNX file downloaded once to ~/.cache/huggingface/hub
// on first call, then memory-resident. CPU-only inference is sufficient.
//
// The transformers package is a regular runtime dependency because
// EMBEDDING_PROVIDER=transformers is the default. The dynamic import below keeps
// startup cheap for openai/local configs and surfaces a friendly error if a
// production bundle or install omits the package.

export type FeatureExtractorOptions = {
  pooling: "mean";
  normalize: boolean;
};

export type FeatureExtractor = ((
  text: string,
  options: FeatureExtractorOptions,
) => Promise<{ data: Float32Array | number[] }>) & {
  tokenizer?: {
    model_max_length: number;
    encode(text: string, options: { add_special_tokens: boolean }): number[];
  };
};

export class EmbeddingInputTooLongError extends Error {
  constructor(
    readonly actualTokens: number,
    readonly maxInputTokens: number,
  ) {
    super(`Embedding input has ${actualTokens} tokens; maximum is ${maxInputTokens}. Shorten the input or split the stored document into chunks.`);
    this.name = "EmbeddingInputTooLongError";
  }
}

export type TransformersEmbeddingClientInput = {
  model: string;
  // Lazy factory called once on first embed(). Allows test injection without
  // loading @huggingface/transformers and returns a feature-extraction pipeline.
  createExtractor?: () => Promise<FeatureExtractor>;
};

export function createTransformersEmbeddingClient(
  input: TransformersEmbeddingClientInput,
): EmbeddingProvider {
  assertTransformersEmbeddingClientInput(input);

  let extractorPromise: Promise<LoadedExtractor> | null = null;

  const factory = input.createExtractor ?? defaultFactory(input.model);
  const documentPrefix = input.model === MULTILINGUAL_E5_MODEL ? "passage: " : "";
  const queryPrefix = input.model === MULTILINGUAL_E5_MODEL ? "query: " : "";

  function getExtractor(): Promise<LoadedExtractor> {
    extractorPromise ??= loadExtractor(factory, input.createExtractor === undefined);
    return extractorPromise;
  }

  async function embedOne(inputText: string, prefix: string): Promise<number[]> {
    assertNonBlankText(inputText, "inputText");
    const formatted = prefix + inputText;

    const { extractor, tokenizer } = await getExtractor();
    if (tokenizer) {
      const actualTokens = tokenizer.countTokens(formatted, true);
      if (actualTokens > tokenizer.maxInputTokens) {
        throw new EmbeddingInputTooLongError(actualTokens, tokenizer.maxInputTokens);
      }
    }
    const out = await extractor(formatted, {
      pooling: "mean",
      normalize: true,
    });
    const data = out.data;
    if (!data || (typeof data.length === "number" && data.length === 0)) {
      throw new Error(
        `transformers extractor returned empty embedding for model ${input.model}`,
      );
    }
    return Array.from(data as ArrayLike<number>);
  }

  return {
    embed: (text) => embedOne(text, documentPrefix),
    embedQuery: (text) => embedOne(text, queryPrefix),
    embedSimilarityBatch: (texts) => embedBatch(texts, queryPrefix),
    async getChunkingTokenizer(): Promise<EmbeddingChunkingTokenizer> {
      const { tokenizer } = await getExtractor();
      if (!tokenizer) {
        throw new Error("transformers feature extractor tokenizer is required for chunking");
      }
      return documentPrefix ? {
        maxInputTokens: tokenizer.maxInputTokens,
        countTokens: (text, addSpecialTokens) => tokenizer.countTokens(addSpecialTokens ? documentPrefix + text : text, addSpecialTokens),
      } : tokenizer;
    },
    embedBatch: (texts) => embedBatch(texts, documentPrefix),
  };

  async function embedBatch(inputs: string[], prefix: string): Promise<number[][]> {
    assertEmbeddingInputBatch(inputs);
    // Keep sequential CPU inference; batch tensor reshaping needs measured benefit first.
    const results: number[][] = [];
    for (const text of inputs) {
      results.push(await embedOne(text, prefix));
    }
    return results;
  }
}

type LoadedExtractor = {
  extractor: FeatureExtractor;
  tokenizer?: EmbeddingChunkingTokenizer;
};

async function loadExtractor(
  factory: () => Promise<FeatureExtractor>,
  requireTokenizer: boolean,
): Promise<LoadedExtractor> {
  const extractor = await factory();
  assertFunction(extractor, "transformers feature extractor");
  const tokenizer = extractor.tokenizer;
  if (tokenizer === undefined || tokenizer === null) {
    if (requireTokenizer) {
      throw new Error("transformers feature extractor tokenizer is required");
    }
    return { extractor };
  }
  if (!Number.isSafeInteger(tokenizer.model_max_length) || tokenizer.model_max_length < 1) {
    throw new Error("transformers tokenizer model_max_length must be a positive safe integer");
  }
  assertFunction(tokenizer.encode, "transformers tokenizer encode");
  return {
    extractor,
    tokenizer: {
      maxInputTokens: tokenizer.model_max_length,
      countTokens(text, addSpecialTokens) {
        const tokens = tokenizer.encode(text, { add_special_tokens: addSpecialTokens });
        if (!Array.isArray(tokens)) {
          throw new Error("transformers tokenizer encode must return token IDs");
        }
        return tokens.length;
      },
    },
  };
}

function defaultFactory(model: string): () => Promise<FeatureExtractor> {
  return async () => {
    let pipeline: (
      task: string,
      modelName: string,
    ) => Promise<FeatureExtractor>;
    try {
      const mod = (await import("@huggingface/transformers")) as unknown as {
        pipeline: (
          task: string,
          modelName: string,
        ) => Promise<FeatureExtractor>;
      };
      pipeline = mod.pipeline;
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `EMBEDDING_PROVIDER=transformers requires @huggingface/transformers ` +
          `to be present in the runtime install. Run npm install for this ` +
          `package and rebuild. (Original: ${reason})`,
      );
    }
    return pipeline("feature-extraction", model);
  };
}

function assertTransformersEmbeddingClientInput(
  value: unknown,
): asserts value is TransformersEmbeddingClientInput {
  const candidate = assertObject(value, "transformers embedding client input");
  assertNonBlankText(candidate.model, "model");
  if (candidate.createExtractor !== undefined) {
    assertFunction(candidate.createExtractor, "createExtractor");
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

function assertFunction(value: unknown, fieldName: string): void {
  if (typeof value !== "function") {
    throw new Error(`${fieldName} must be a function`);
  }
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
