// unarchiveCompaction — restores archived records back to canonical state.
//
// Flow per archive id:
//   1. findArchiveByIds (org-scoped) → ArchiveRow
//   2. Skip if already unarchived (unarchivedAt !== null) — idempotent
//   3. restoreToCanonical → INSERT into memory_records preserving original
//      timestamps + source_id. New row gets a fresh BIGSERIAL id.
//   4. Re-chunk content via existing chunkText
//   5. insertChunks (writes memory_chunks rows with the new record id)
//   6. Embed each chunk via EmbeddingClient
//   7. qdrantClient.upsert points with the new chunk ids
//   8. updatePointIds back to memory_chunks
//   9. markUnarchived(archiveId) — set unarchived_at = NOW()
//
// Each archive is processed independently inside a try/catch so one
// failed restore doesn't block the rest of the batch. The restored record
// id differs from the original — callers searching by old id won't find
// it; the response includes the mapping so callers can update references.

import type { Logger } from "../logger.js";
import type {
  Durability,
  MemoryType,
  ScopeType,
  SearchMemoryResult,
  SourceType,
} from "../types.js";
import { chunkText } from "../chunk/chunk-text.js";
import { toQdrantPoint } from "../qdrant/point-mapper.js";
import type {
  ArchiveRow,
  MemoryArchiveRepository,
} from "../store/memory-archive-repository.js";
import type {
  ChunkEmbeddingConfig,
  EmbeddingClient,
  MemoryChunkRepository,
  QdrantUpsertClient,
} from "../store/canonical-indexing.js";

export type UnarchiveCompactionInput = {
  archiveIds: number[];
  organizationId: string;
  actor: string;
};

export type UnarchiveOutcome =
  | {
      archiveId: number;
      status: "restored";
      restoredRecordId: number;
      sourceRecordId: number;
      chunkCount: number;
    }
  | {
      archiveId: number;
      status: "skipped";
      reason: string;
    }
  | {
      archiveId: number;
      status: "failed";
      error: string;
    };

export type UnarchiveResult = {
  outcomes: UnarchiveOutcome[];
  restoredCount: number;
  skippedCount: number;
  failedCount: number;
  durationMs: number;
};

export type UnarchiveCompactionDeps = {
  archiveRepository: MemoryArchiveRepository;
  chunkRepository: MemoryChunkRepository;
  embeddings: EmbeddingClient;
  qdrantClient: QdrantUpsertClient;
  collectionName: string;
  embedding: ChunkEmbeddingConfig;
  logger: Logger;
  now?: () => Date;
};

export async function unarchiveCompaction(
  input: Readonly<UnarchiveCompactionInput>,
  deps: Readonly<UnarchiveCompactionDeps>,
): Promise<UnarchiveResult> {
  const startedAt = (deps.now ?? (() => new Date()))();

  if (input.archiveIds.length === 0) {
    return {
      outcomes: [],
      restoredCount: 0,
      skippedCount: 0,
      failedCount: 0,
      durationMs: 0,
    };
  }

  const archives = await deps.archiveRepository.findArchiveByIds(
    input.archiveIds,
    input.organizationId,
  );

  // Map by id so we can report "not found" for archive ids that weren't
  // returned (org mismatch or simply missing).
  const found = new Map(archives.map((a) => [a.id, a]));
  const outcomes: UnarchiveOutcome[] = [];

  for (const archiveId of input.archiveIds) {
    const archive = found.get(archiveId);
    if (!archive) {
      outcomes.push({
        archiveId,
        status: "skipped",
        reason: "archive_not_found_or_org_mismatch",
      });
      continue;
    }
    if (archive.unarchivedAt !== null) {
      outcomes.push({
        archiveId,
        status: "skipped",
        reason: "already_unarchived",
      });
      continue;
    }
    if (archive.sourceId === null) {
      outcomes.push({
        archiveId,
        status: "skipped",
        reason: "pre_p19.1_archive_missing_source_id",
      });
      continue;
    }

    try {
      const outcome = await restoreOne(archive, input.organizationId, deps);
      outcomes.push(outcome);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      deps.logger.error(
        {
          event: "compact.unarchive_failed",
          archiveId,
          err: errorMessage,
        },
        "unarchive failed for archive row",
      );
      outcomes.push({ archiveId, status: "failed", error: errorMessage });
    }
  }

  const endedAt = (deps.now ?? (() => new Date()))();
  return {
    outcomes,
    restoredCount: outcomes.filter((o) => o.status === "restored").length,
    skippedCount: outcomes.filter((o) => o.status === "skipped").length,
    failedCount: outcomes.filter((o) => o.status === "failed").length,
    durationMs: endedAt.getTime() - startedAt.getTime(),
  };
}

async function restoreOne(
  archive: ArchiveRow,
  organizationId: string,
  deps: UnarchiveCompactionDeps,
): Promise<UnarchiveOutcome> {
  const { restoredRecordId } = await deps.archiveRepository.restoreToCanonical(
    archive,
    organizationId,
  );

  // Synthesize a SearchMemoryResult-shaped value for chunkRepository.insertChunks.
  // insertChunks only reads .id and .organizationId; the source field is
  // synthesized so the type checks out (real source row is unchanged at
  // archive.sourceId — we don't touch it).
  const restoredRecord: SearchMemoryResult = {
    id: restoredRecordId,
    organizationId,
    sourceId: archive.sourceId!,
    scopeType: archive.scopeType as ScopeType,
    scopeId: archive.scopeId,
    projectKey: archive.projectKey,
    memoryType: archive.kind as MemoryType,
    title: archive.title,
    content: archive.content,
    summary: archive.summary,
    durability: archive.durability as Durability,
    importance: archive.importance,
    createdAt: archive.originalCreatedAt,
    updatedAt: archive.originalUpdatedAt,
    source: {
      id: archive.sourceId!,
      scopeType: archive.scopeType as ScopeType,
      scopeId: archive.scopeId,
      sourceType: "document" as SourceType,
      externalId: `restored-from-archive-${archive.id}`,
      title: archive.title,
      uri: null,
      createdAt: archive.originalCreatedAt,
    },
  };

  const chunks = chunkText({
    text: archive.content,
    targetTokens: deps.embedding.targetTokens,
    overlapTokens: deps.embedding.overlapTokens,
  });
  const storedChunks = await deps.chunkRepository.insertChunks({
    record: restoredRecord,
    chunks,
    embedding: deps.embedding,
  });

  const embeddings = await Promise.all(
    storedChunks.map((chunk) => deps.embeddings.embed(chunk.content)),
  );
  const points = storedChunks.map((chunk, index) =>
    toQdrantPoint({
      chunk: {
        id: chunk.id,
        memoryRecordId: chunk.memoryRecordId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        embeddingVersion: chunk.embeddingVersion,
      },
      record: {
        id: restoredRecord.id,
        organizationId,
        scopeType: restoredRecord.scopeType,
        scopeId: restoredRecord.scopeId,
        projectKey: restoredRecord.projectKey ?? null,
        durability: restoredRecord.durability ?? "ephemeral",
        kind: restoredRecord.memoryType,
        tags: [],
        updatedAt: restoredRecord.updatedAt,
      },
      embedding: embeddings[index] ?? [],
    }),
  );

  if (points.length > 0) {
    await deps.qdrantClient.upsert(deps.collectionName, { points });
    await deps.chunkRepository.updatePointIds(
      points.map((point, index) => ({
        chunkId: storedChunks[index]!.id,
        qdrantPointId: point.id,
      })),
    );
  }

  await deps.archiveRepository.markUnarchived(archive.id);

  return {
    archiveId: archive.id,
    status: "restored",
    restoredRecordId,
    sourceRecordId: archive.sourceRecordId,
    chunkCount: storedChunks.length,
  };
}
