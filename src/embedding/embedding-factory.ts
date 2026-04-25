import { createLocalEmbeddingClient } from "./local-embedding.js";
import { createOpenAiEmbeddingClient } from "./openai-embeddings.js";
import type {
  EmbeddingProvider,
  EmbeddingProviderConfig,
  EmbeddingProviderName,
} from "./embedding-provider.js";

// Single decision point for "which embedding provider gets wired?". The
// canonical-services bootstrap calls this exactly once. Adding a new provider
// (Naver HyperClova, on-prem sLLM, voyage-ai) is a single case below + the
// implementation file — no other code needs to change.

export type CreateEmbeddingProviderInput = {
  config: EmbeddingProviderConfig;
  // OpenAI provider needs the API key. Only required when provider="openai".
  openaiApiKey?: string;
};

export function createEmbeddingProvider(
  input: CreateEmbeddingProviderInput,
): EmbeddingProvider {
  switch (input.config.provider) {
    case "openai": {
      if (!input.openaiApiKey) {
        throw new Error(
          "EMBEDDING_PROVIDER=openai requires OPENAI_API_KEY",
        );
      }
      return createOpenAiEmbeddingClient({
        apiKey: input.openaiApiKey,
        model: input.config.model,
      });
    }
    case "local": {
      return createLocalEmbeddingClient({
        dimensions: input.config.dimensions,
      });
    }
    default: {
      const exhaustive: never = input.config.provider;
      throw new Error(
        `unsupported embedding provider: ${String(exhaustive)}`,
      );
    }
  }
}

export function isKnownEmbeddingProvider(
  value: string,
): value is EmbeddingProviderName {
  return value === "openai" || value === "local";
}
