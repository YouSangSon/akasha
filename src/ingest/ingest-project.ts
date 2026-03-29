import type { MemoryRepository, SearchMemoryResult } from "../types.js";
import { collectProjectSources } from "./readers.js";

export type IngestProjectArtifactsInput = {
  projectRoot: string;
  projectId: string;
  repository: MemoryRepository;
};

export function ingestProjectArtifacts(
  input: IngestProjectArtifactsInput,
): SearchMemoryResult[] {
  const sources = collectProjectSources(input.projectRoot);

  return sources.map((source) =>
    input.repository.addMemory({
      scopeType: "project",
      scopeId: input.projectId,
      source: {
        scopeType: "project",
        scopeId: input.projectId,
        sourceType: source.sourceType,
        externalId: source.sourceRef,
        title: source.title,
        uri: source.uri,
      },
      memoryType: source.memoryType,
      content: source.content,
    }),
  );
}
