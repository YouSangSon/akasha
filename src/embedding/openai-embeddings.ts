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
  };
}
