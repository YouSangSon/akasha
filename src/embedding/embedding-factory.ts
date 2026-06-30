import { createLocalEmbeddingClient } from "./local-embedding.js";
import { createOpenAiEmbeddingClient } from "./openai-embeddings.js";
import { createTransformersEmbeddingClient } from "./transformers-embedding.js";
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
  assertCreateEmbeddingProviderInput(input);

  switch (input.config.provider) {
    case "openai": {
      if (
        input.openaiApiKey === undefined ||
        input.openaiApiKey.trim().length === 0
      ) {
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
    case "transformers": {
      return createTransformersEmbeddingClient({
        model: input.config.model,
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
  return value === "openai" || value === "local" || value === "transformers";
}

function assertCreateEmbeddingProviderInput(
  value: unknown,
): asserts value is CreateEmbeddingProviderInput {
  const candidate = assertObject(value, "embedding provider input");
  const config = assertObject(candidate.config, "embedding provider config");
  assertEmbeddingProviderName(config.provider, "provider");
  assertNonBlankText(config.model, "model");
  assertPositiveSafeInteger(config.dimensions, "dimensions");

  if (candidate.openaiApiKey !== undefined) {
    assertString(candidate.openaiApiKey, "openaiApiKey");
  }
}

function assertEmbeddingProviderName(
  value: unknown,
  fieldName: string,
): asserts value is EmbeddingProviderName {
  if (value !== "openai" && value !== "local" && value !== "transformers") {
    throw new Error(
      `${fieldName} must be "openai", "local", or "transformers"`,
    );
  }
}

function assertPositiveSafeInteger(
  value: unknown,
  fieldName: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${fieldName} must be a positive safe integer`);
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

function assertString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
}

function assertNonBlankText(
  value: unknown,
  fieldName: string,
): asserts value is string {
  assertString(value, fieldName);
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} must contain non-whitespace text`);
  }
}
