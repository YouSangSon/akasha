import { QdrantClient } from "@qdrant/js-client-rest";

export type CreateQdrantClientInput = {
  url: string;
  apiKey: string;
};

export function createQdrantClient(input: CreateQdrantClientInput) {
  return new QdrantClient({
    url: input.url,
    apiKey: input.apiKey,
  });
}
