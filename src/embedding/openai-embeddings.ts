import OpenAI from "openai";

export type EmbeddingVector = number[];

// `input` accepts either a single string or an array — the OpenAI Embeddings
// endpoint natively supports batch input (up to ~2048 entries / ~300k tokens
// per request) at the same per-token cost, so callers that have multiple
// texts should use the array form to collapse N HTTP RTTs into one.
export type EmbeddingsCreateParams = {
  input: string | string[];
  model: string;
};

export type EmbeddingsCreateResult = {
  data: Array<{
    embedding: EmbeddingVector;
  }>;
};

export type EmbeddingsCreateClient = {
  embeddings: {
    create(input: EmbeddingsCreateParams): Promise<EmbeddingsCreateResult>;
  };
};

export type OpenAiEmbeddingClientInput = {
  apiKey: string;
  model: string;
  createClient?: (apiKey: string) => EmbeddingsCreateClient;
};

export function createOpenAiEmbeddingClient(
  input: OpenAiEmbeddingClientInput,
) {
  assertOpenAiEmbeddingClientInput(input);

  const client =
    input.createClient !== undefined
      ? input.createClient(input.apiKey)
      : ({
          embeddings: new OpenAI({
            apiKey: input.apiKey,
          }).embeddings,
        } satisfies EmbeddingsCreateClient);
  assertEmbeddingsCreateClient(client);

  return {
    async embed(inputText: string): Promise<EmbeddingVector> {
      assertNonBlankText(inputText, "inputText");

      const response = await client.embeddings.create({
        input: inputText,
        model: input.model,
      });

      const embedding = response.data[0]?.embedding;

      if (!embedding) {
        throw new Error(
          `OpenAI returned no embedding data for model ${input.model}`,
        );
      }

      if (embedding.length === 0) {
        throw new Error(
          `OpenAI returned an empty embedding vector for model ${input.model}`,
        );
      }

      return embedding;
    },

    async embedBatch(inputs: string[]): Promise<EmbeddingVector[]> {
      assertEmbeddingInputBatch(inputs);

      if (inputs.length === 0) {
        return [];
      }

      const response = await client.embeddings.create({
        input: inputs,
        model: input.model,
      });

      // OpenAI returns one entry per input in input order — verify count
      // before slicing so a future API change can't silently truncate.
      if (response.data.length !== inputs.length) {
        throw new Error(
          `OpenAI returned ${response.data.length} embeddings for ${inputs.length} inputs (model ${input.model})`,
        );
      }

      const embeddings = response.data.map((item, index) => {
        if (!item.embedding || item.embedding.length === 0) {
          throw new Error(
            `OpenAI returned an empty embedding vector at index ${index} for model ${input.model}`,
          );
        }
        return item.embedding;
      });

      return embeddings;
    },
  };
}

function assertOpenAiEmbeddingClientInput(
  value: unknown,
): asserts value is OpenAiEmbeddingClientInput {
  const candidate = assertObject(value, "OpenAI embedding client input");
  assertNonBlankText(candidate.apiKey, "apiKey");
  assertNonBlankText(candidate.model, "model");
  if (candidate.createClient !== undefined) {
    assertFunction(candidate.createClient, "createClient");
  }
}

function assertEmbeddingsCreateClient(
  value: unknown,
): asserts value is EmbeddingsCreateClient {
  const candidate = assertObject(value, "OpenAI embeddings client");
  const embeddings = assertObject(
    candidate.embeddings,
    "OpenAI embeddings client.embeddings",
  );
  assertFunction(embeddings.create, "OpenAI embeddings client.embeddings.create");
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
