import type { EmbeddingProvider } from "./embedding-provider.js";

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

export type FeatureExtractor = (
  text: string,
  options: FeatureExtractorOptions,
) => Promise<{ data: Float32Array | number[] }>;

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

  let extractorPromise: Promise<FeatureExtractor> | null = null;

  const factory = input.createExtractor ?? defaultFactory(input.model);

  async function embedOne(inputText: string): Promise<number[]> {
    assertNonBlankText(inputText, "inputText");

    extractorPromise ??= loadExtractor(factory);
    const extractor = await extractorPromise;
    const out = await extractor(inputText, {
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
    embed: embedOne,
    async embedBatch(inputs: string[]): Promise<number[][]> {
      assertEmbeddingInputBatch(inputs);

      // Sequential single-text calls. ONNX-side batch input is supported by
      // @huggingface/transformers but the result tensor reshaping is enough
      // additional surface that we keep batching at the orchestrator level
      // for now — local CPU inference has no per-call HTTP RTT to amortize,
      // so the cost/latency benefit is minimal. Revisit if ONNX batch shows
      // a measurable win in benchmarks.
      const results: number[][] = [];
      for (const text of inputs) {
        results.push(await embedOne(text));
      }
      return results;
    },
  };
}

async function loadExtractor(
  factory: () => Promise<FeatureExtractor>,
): Promise<FeatureExtractor> {
  const extractor = await factory();
  assertFunction(extractor, "transformers feature extractor");
  return extractor;
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
    } catch (err) {
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
