// Provider-agnostic embedding contract. Concrete providers (OpenAI, local
// deterministic, future Naver HyperClova / 사내 sLLM) implement this shape so
// the canonical-services bootstrap can swap them via env config without any
// callers needing to know which one is wired.

export type EmbeddingProvider = {
  embed(inputText: string): Promise<number[]>;
};

export type EmbeddingProviderName = "openai" | "local" | "transformers";

export type EmbeddingProviderConfig = {
  provider: EmbeddingProviderName;
  model: string;
  dimensions: number;
};
