import OpenAI from "openai";

export type EmbeddingVector = number[];

export type EmbeddingsCreateParams = {
  input: string;
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
  const client =
    input.createClient?.(input.apiKey) ??
    ({
      embeddings: new OpenAI({
        apiKey: input.apiKey,
      }).embeddings,
    } satisfies EmbeddingsCreateClient);

  return {
    async embed(inputText: string): Promise<EmbeddingVector> {
      const response = await client.embeddings.create({
        input: inputText,
        model: input.model,
      });

      return response.data[0]?.embedding ?? [];
    },
  };
}
