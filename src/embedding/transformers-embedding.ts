import type { EmbeddingProvider } from "./embedding-provider.js";

// Free, local-first embedding provider backed by ONNX models from Hugging Face
// (via @huggingface/transformers). Default model is Xenova/all-MiniLM-L6-v2 —
// 384 dimensions, ~22MB ONNX file downloaded once to ~/.cache/huggingface/hub
// on first call, then memory-resident. CPU-only inference is sufficient.
//
// The transformers package is an OPTIONAL dependency (declared in package.json
// optionalDependencies). Users who only need EMBEDDING_PROVIDER=openai or
// =local don't pay the ~50MB onnxruntime-node binary install cost. The dynamic
// import below surfaces a friendly error when the package is missing.

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
  // requiring the optional dep. Real default factory loads
  // @huggingface/transformers and returns a feature-extraction pipeline.
  createExtractor?: () => Promise<FeatureExtractor>;
};

export function createTransformersEmbeddingClient(
  input: TransformersEmbeddingClientInput,
): EmbeddingProvider {
  let extractorPromise: Promise<FeatureExtractor> | null = null;

  const factory = input.createExtractor ?? defaultFactory(input.model);

  return {
    async embed(inputText: string): Promise<number[]> {
      extractorPromise ??= factory();
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
      // @ts-ignore — optional dep; types may or may not be present at compile
      // time depending on whether the user installed it. Cast through unknown
      // makes runtime resolution fully decoupled from the import-time type
      // resolution. ts-ignore (vs ts-expect-error) tolerates the case where
      // the package IS installed and the suppression turns out to be unused.
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
        `EMBEDDING_PROVIDER=transformers requires the optional dependency ` +
          `@huggingface/transformers. Install it with: ` +
          `npm install @huggingface/transformers. (Original: ${reason})`,
      );
    }
    return pipeline("feature-extraction", model);
  };
}
