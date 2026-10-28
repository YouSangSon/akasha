// unarchiveCompaction — restores archived records back to canonical state.
//
// Production holds the archive lock while rereading its state, then commits
// the restored record, pending index job, and unarchived marker together.
// The new record lock is acquired before commit and held through indexing.
// Index failures retain the canonical record and its retry job.
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
} from "../types.js";
import { chunkForEmbedding } from "../chunk/chunk-for-embedding.js";
import type {
  ArchiveRow,
  MemoryArchiveRepository,
} from "../store/memory-archive-repository.js";
import { assertNonBlankText } from "../store/memory-content.js";
import {
  refreshCanonicalMemoryIndex,
  type ChunkEmbeddingConfig,
  type EmbeddingClient,
  type MemoryChunkRepository,
} from "../store/canonical-indexing.js";
import type { MemoryWriteCoordinator } from "../store/memory-write-coordinator.js";
import type { VectorIndex, VectorPoint } from "../vector/vector-index.js";
import { buildVectorPoint } from "../vector/point-builder.js";

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
      indexPending?: boolean;
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
  vectorIndex: VectorIndex;
  embedding: ChunkEmbeddingConfig;
  writes?: MemoryWriteCoordinator;
  logger: Logger;
  now?: () => Date;
};

export async function unarchiveCompaction(
  input: Readonly<UnarchiveCompactionInput>,
  deps: Readonly<UnarchiveCompactionDeps>,
): Promise<UnarchiveResult> {
  assertUnarchiveCompactionInput(input);
  const scopedOrganizationId = input.organizationId.trim();

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

  const archives = deps.writes ? [] : await deps.archiveRepository.findArchiveByIds(
    input.archiveIds,
    scopedOrganizationId,
  );

  // Map by id so we can report "not found" for archive ids that weren't
  // returned (org mismatch or simply missing).
  const found = new Map(archives.map((a) => [a.id, a]));
  const outcomes: UnarchiveOutcome[] = [];

  for (const archiveId of input.archiveIds) {
    try {
      const outcome = deps.writes
        ? await deps.writes.archive(scopedOrganizationId, archiveId, async (scope) => {
          const [archive] = await scope.archiveRepository.findArchiveByIds([archiveId], scopedOrganizationId);
          return restoreArchive(archiveId, archive, scopedOrganizationId, { ...deps, ...scope });
        })
        : await restoreArchive(archiveId, found.get(archiveId), scopedOrganizationId, deps);
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

async function restoreArchive(
  archiveId: number,
  archive: ArchiveRow | undefined,
  organizationId: string,
  deps: UnarchiveCompactionDeps,
): Promise<UnarchiveOutcome> {
  if (!archive || archive.organizationId !== organizationId) {
    return { archiveId, status: "skipped", reason: "archive_not_found_or_org_mismatch" };
  }
  if (archive.unarchivedAt !== null) {
    return { archiveId, status: "skipped", reason: "already_unarchived" };
  }
  if (archive.sourceId === null) {
    return { archiveId, status: "skipped", reason: "pre_p19.1_archive_missing_source_id" };
  }
  if (!deps.writes) return restoreOne(archive, organizationId, deps);

  return deps.writes.restore(normalizeArchive(archive), organizationId, async (scope, record, job) => {
    const restored = {
      archiveId,
      status: "restored" as const,
      restoredRecordId: record.id,
      sourceRecordId: archive.sourceRecordId,
    };
    try {
      const indexed = await refreshCanonicalMemoryIndex({ ...scope, record, job });
      return { ...restored, ...indexed };
    } catch (error: unknown) {
      deps.logger.error({
        event: "compact.unarchive_index_pending",
        archiveId,
        restoredRecordId: record.id,
        err: error,
      }, "canonical memory restored; search indexing is pending retry");
      return { ...restored, chunkCount: 0, indexPending: true };
    }
  });
}

function normalizeArchive(archive: ArchiveRow): ArchiveRow & {
  scopeType: ScopeType;
  kind: MemoryType;
  durability: Durability;
} {
  return {
    ...archive,
    scopeType: toUnarchiveArchiveScopeType(archive.scopeType),
    kind: toUnarchiveArchiveKind(archive.kind),
    durability: toUnarchiveArchiveDurability(archive.durability),
  };
}

async function restoreOne(
  archive: ArchiveRow,
  organizationId: string,
  deps: UnarchiveCompactionDeps,
): Promise<UnarchiveOutcome> {
  let restoredRecordId: number | null = null;
  let upsertedPointIds: string[] = [];

  try {
    const restorableArchive = normalizeArchive(archive);
    const { scopeType: archiveScopeType, kind: archiveKind, durability: archiveDurability } = restorableArchive;
    const restored = await deps.archiveRepository.restoreToCanonical(
      restorableArchive,
      organizationId,
    );
    restoredRecordId = restored.restoredRecordId;

    // Synthesize a SearchMemoryResult-shaped value for chunkRepository.insertChunks.
    // insertChunks only reads .id and .organizationId; the source field is
    // synthesized so the type checks out (real source row is unchanged at
    // archive.sourceId — we don't touch it).
    const restoredRecord: SearchMemoryResult = {
      id: restoredRecordId,
      organizationId,
      sourceId: archive.sourceId!,
      scopeType: archiveScopeType,
      scopeId: archive.scopeId,
      projectKey: archive.projectKey,
      memoryType: archiveKind,
      title: archive.title,
      content: archive.content,
      summary: archive.summary,
      durability: archiveDurability,
      importance: archive.importance,
      createdAt: archive.originalCreatedAt,
      updatedAt: archive.originalUpdatedAt,
      source: {
        id: archive.sourceId!,
        scopeType: archiveScopeType,
        scopeId: archive.scopeId,
        sourceType: "document",
        externalId: `restored-from-archive-${archive.id}`,
        title: archive.title,
        uri: null,
        createdAt: archive.originalCreatedAt,
      },
    };

    const chunks = await chunkForEmbedding({
      text: archive.content,
      targetTokens: deps.embedding.targetTokens,
      overlapTokens: deps.embedding.overlapTokens,
    }, deps.embeddings);
    const storedChunks = await deps.chunkRepository.insertChunks({
      record: restoredRecord,
      chunks,
      embedding: deps.embedding,
    });

    const embeddings = await deps.embeddings.embedBatch(
      storedChunks.map((chunk) => chunk.content),
    );
    if (embeddings.length !== storedChunks.length) {
      throw new Error(
        `unarchive embedBatch returned ${embeddings.length} vectors for ${storedChunks.length} chunks`,
      );
    }

    const points: VectorPoint[] = storedChunks.map((chunk, index) =>
      buildVectorPoint({
        chunkId: chunk.id,
        vector: embeddings[index] ?? [],
        memoryRecordId: restoredRecord.id,
        organizationId,
        scopeType: restoredRecord.scopeType,
        scopeId: restoredRecord.scopeId,
        projectKey: restoredRecord.projectKey ?? null,
        kind: restoredRecord.memoryType,
        durability: restoredRecord.durability ?? "ephemeral",
        title: restoredRecord.title ?? null,
        summary: restoredRecord.summary ?? null,
        tags: restoredRecord.tags ?? [],
        updatedAt: restoredRecord.updatedAt,
        embeddingVersion: chunk.embeddingVersion,
      }),
    );

    if (points.length > 0) {
      await deps.vectorIndex.upsert(points);
      upsertedPointIds = points.map((point) => point.id);
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
  } catch (err: unknown) {
    await compensateFailedRestore({
      archiveId: archive.id,
      organizationId,
      restoredRecordId,
      upsertedPointIds,
      deps,
    });
    throw err;
  }
}

function assertUnarchiveCompactionInput(
  input: unknown,
): asserts input is UnarchiveCompactionInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("unarchiveCompaction input must be an object");
  }

  const candidate = input as Record<string, unknown>;
  assertPositiveSafeIntegerArray(candidate.archiveIds, "archiveIds");
  assertNonBlankText(candidate.organizationId, "organizationId");
  assertNonBlankText(candidate.actor, "actor");
}

function assertPositiveSafeIntegerArray(
  value: unknown,
  fieldName: string,
): asserts value is number[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  for (const [index, item] of value.entries()) {
    if (
      typeof item !== "number" ||
      !Number.isSafeInteger(item) ||
      item <= 0
    ) {
      throw new Error(
        `${fieldName}[${index}] must be a positive safe integer`,
      );
    }
  }
}

function toUnarchiveArchiveScopeType(value: unknown): ScopeType {
  if (value === "user" || value === "project") {
    return value;
  }
  throw new Error("unarchive archive scopeType must be one of: user, project");
}

function toUnarchiveArchiveKind(value: unknown): MemoryType {
  if (value === "decision" || value === "fact" || value === "summary") {
    return value;
  }
  throw new Error(
    "unarchive archive kind must be one of: decision, summary, fact",
  );
}

function toUnarchiveArchiveDurability(value: unknown): Durability {
  if (value === "ephemeral" || value === "durable" || value === "archived") {
    return value;
  }
  throw new Error(
    "unarchive archive durability must be one of: ephemeral, durable, archived",
  );
}

async function compensateFailedRestore(args: {
  archiveId: number;
  organizationId: string;
  restoredRecordId: number | null;
  upsertedPointIds: string[];
  deps: UnarchiveCompactionDeps;
}): Promise<void> {
  if (args.upsertedPointIds.length > 0) {
    try {
      await args.deps.vectorIndex.delete(args.upsertedPointIds, {
        organizationId: args.organizationId,
      });
    } catch (err: unknown) {
      args.deps.logger.error(
        {
          event: "compact.unarchive_vector_compensation_failed",
          archiveId: args.archiveId,
          err,
        },
        "failed to delete vector points after unarchive failure",
      );
    }
  }

  if (args.restoredRecordId !== null) {
    try {
      await args.deps.archiveRepository.deleteRestoredCanonicalRecord(
        args.restoredRecordId,
        args.organizationId,
      );
    } catch (err: unknown) {
      args.deps.logger.error(
        {
          event: "compact.unarchive_sql_compensation_failed",
          archiveId: args.archiveId,
          restoredRecordId: args.restoredRecordId,
          err,
        },
        "failed to delete restored canonical record after unarchive failure",
      );
    }
  }
}
