// Provider-agnostic embedding contract. Concrete providers (OpenAI, local
// deterministic, future Naver HyperClova / 사내 sLLM) implement this shape so
// the canonical-services bootstrap can swap them via env config without any
// callers needing to know which one is wired.

export type EmbeddingProvider = {
  embed(inputText: string): Promise<number[]>;
  // Batch counterpart to `embed`. OpenAI sends one HTTP call for the whole
  // array (cost: same per token, latency: 1 RTT instead of N), so callers
  // that have multiple texts (e.g. chunked records, reindex sweeps) should
  // prefer this over Promise.all(map(embed)). Local-only providers may
  // delegate to N sequential embed calls without losing anything since they
  // pay no per-call overhead.
  embedBatch(inputs: string[]): Promise<number[][]>;
};

export type EmbeddingProviderName = "openai" | "local" | "transformers";

export type EmbeddingProviderConfig = {
  provider: EmbeddingProviderName;
  model: string;
  dimensions: number;
};
