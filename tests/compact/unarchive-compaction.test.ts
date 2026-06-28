import { describe, expect, it, vi } from "vitest";
import {
  unarchiveCompaction,
  type UnarchiveCompactionDeps,
} from "../../src/compact/unarchive-compaction.js";
import type {
  ArchiveRow,
  MemoryArchiveRepository,
} from "../../src/store/memory-archive-repository.js";

const SILENT_LOGGER = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
} as unknown as UnarchiveCompactionDeps["logger"];

const NOW = new Date("2026-04-25T12:00:00.000Z");

function makeArchive(overrides: Partial<ArchiveRow> = {}): ArchiveRow {
  return {
    id: 50,
    organizationId: "org-a",
    sourceRecordId: 100,
    sourceId: 200,
    scopeType: "project",
    scopeId: "alpha",
    projectKey: "alpha",
    kind: "decision",
    title: null,
    content: "Decision: ship Friday",
    summary: null,
    durability: "durable",
    importance: 5,
    originalCreatedAt: "2026-04-25T00:00:00.000Z",
    originalUpdatedAt: "2026-04-25T01:00:00.000Z",
    unarchivedAt: null,
    ...overrides,
  };
}

function makeRepo(
  archives: ArchiveRow[],
  overrides: Partial<MemoryArchiveRepository> = {},
): MemoryArchiveRepository & {
  findArchiveByIds: ReturnType<typeof vi.fn>;
  restoreToCanonical: ReturnType<typeof vi.fn>;
  deleteRestoredCanonicalRecord: ReturnType<typeof vi.fn>;
  markUnarchived: ReturnType<typeof vi.fn>;
} {
  return {
    createCompactionRun: vi.fn(),
    findRunByIdempotencyKey: vi.fn(),
    applyCompactionRecord: vi.fn(),
    markQdrantStatus: vi.fn(),
    completeCompactionRun: vi.fn(),
    findPendingQdrantCleanup: vi.fn().mockResolvedValue([]),
    claimPendingQdrantCleanup: vi.fn().mockResolvedValue([]),
    acquireScopeLock: vi.fn(),
    countRecentApplyRuns: vi.fn().mockResolvedValue(0),
    findArchiveByIds: vi.fn().mockResolvedValue(archives),
    restoreToCanonical: vi
      .fn()
      .mockResolvedValue({ restoredRecordId: 999 }),
    deleteRestoredCanonicalRecord: vi.fn().mockResolvedValue(undefined),
    markUnarchived: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as MemoryArchiveRepository & {
    findArchiveByIds: ReturnType<typeof vi.fn>;
    restoreToCanonical: ReturnType<typeof vi.fn>;
    deleteRestoredCanonicalRecord: ReturnType<typeof vi.fn>;
    markUnarchived: ReturnType<typeof vi.fn>;
  };
}

function makeDeps(
  repo: MemoryArchiveRepository,
  overrides: Partial<UnarchiveCompactionDeps> = {},
): UnarchiveCompactionDeps {
  return {
    archiveRepository: repo,
    chunkRepository: {
      insertChunks: vi.fn().mockResolvedValue([
        {
          id: 7000,
          memoryRecordId: 999,
          chunkIndex: 0,
          content: "Decision: ship Friday",
          startOffset: 0,
          endOffset: 21,
          embeddingVersion: "v1",
        },
      ]),
      updatePointIds: vi.fn().mockResolvedValue(undefined),
      deleteChunksForRecord: vi.fn().mockResolvedValue(undefined),
      listChunks: vi.fn(),
      getChunksByRecordId: vi.fn().mockResolvedValue([]),
      createContextPackRun: vi.fn(),
    },
    embeddings: {
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      // F4: writeCanonicalMemory uses embedBatch for chunk embeddings.
      embedBatch: vi
        .fn()
        .mockImplementation(async (inputs: string[]) =>
          inputs.map(() => [0.1, 0.2, 0.3]),
        ),
    },
    vectorIndex: {
      upsert: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(),
      delete: vi.fn(),
      deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
      ensureCollection: vi.fn(),
    },
    embedding: {
      provider: "local",
      model: "test-model",
      dimensions: 3,
      version: "v1",
      targetTokens: 256,
      overlapTokens: 32,
    },
    logger: SILENT_LOGGER,
    now: () => NOW,
    ...overrides,
  };
}

describe("unarchiveCompaction (empty input)", () => {
  it("rejects whitespace-only organizationId before side effects", async () => {
    const repo = makeRepo([makeArchive()]);
    const deps = makeDeps(repo);

    await expect(
      unarchiveCompaction(
        { archiveIds: [50], organizationId: " \n\t ", actor: "test" },
        deps,
      ),
    ).rejects.toThrow(/organizationId/);

    expect(repo.findArchiveByIds).not.toHaveBeenCalled();
    expect(repo.restoreToCanonical).not.toHaveBeenCalled();
    expect(deps.chunkRepository.insertChunks).not.toHaveBeenCalled();
    expect(deps.embeddings.embedBatch).not.toHaveBeenCalled();
    expect(deps.vectorIndex.upsert).not.toHaveBeenCalled();
    expect(deps.vectorIndex.delete).not.toHaveBeenCalled();
    expect(repo.markUnarchived).not.toHaveBeenCalled();
  });

  it("returns zero counts when no archive ids supplied", async () => {
    const repo = makeRepo([]);
    const result = await unarchiveCompaction(
      { archiveIds: [], organizationId: "org-a", actor: "test" },
      makeDeps(repo),
    );
    expect(result).toEqual({
      outcomes: [],
      restoredCount: 0,
      skippedCount: 0,
      failedCount: 0,
      durationMs: 0,
    });
    expect(repo.findArchiveByIds).not.toHaveBeenCalled();
  });
});

describe("unarchiveCompaction (happy path)", () => {
  it("restores an archive: PG row, chunks, qdrant points, markUnarchived", async () => {
    const archive = makeArchive();
    const repo = makeRepo([archive]);
    const deps = makeDeps(repo);

    const result = await unarchiveCompaction(
      { archiveIds: [50], organizationId: "org-a", actor: "test" },
      deps,
    );

    expect(result.restoredCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.outcomes[0]).toMatchObject({
      archiveId: 50,
      status: "restored",
      restoredRecordId: 999,
      sourceRecordId: 100,
      chunkCount: 1,
    });
    expect(repo.restoreToCanonical).toHaveBeenCalledWith(archive, "org-a");
    expect(deps.vectorIndex.upsert).toHaveBeenCalledTimes(1);
    expect(repo.markUnarchived).toHaveBeenCalledWith(50);
  });

  it("batches embeddings once for all restored chunks", async () => {
    const archive = makeArchive();
    const repo = makeRepo([archive]);
    const deps = makeDeps(repo);
    (deps.chunkRepository.insertChunks as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        {
          id: 7000,
          memoryRecordId: 999,
          chunkIndex: 0,
          content: "Decision: ship Friday",
          startOffset: 0,
          endOffset: 21,
          embeddingVersion: "v1",
        },
        {
          id: 7001,
          memoryRecordId: 999,
          chunkIndex: 1,
          content: "Rollback plan: Monday",
          startOffset: 22,
          endOffset: 43,
          embeddingVersion: "v1",
        },
      ]);

    const result = await unarchiveCompaction(
      { archiveIds: [50], organizationId: "org-a", actor: "test" },
      deps,
    );

    expect(result.outcomes[0]).toMatchObject({
      archiveId: 50,
      status: "restored",
      chunkCount: 2,
    });
    expect(deps.embeddings.embedBatch).toHaveBeenCalledOnce();
    expect(deps.embeddings.embedBatch).toHaveBeenCalledWith([
      "Decision: ship Friday",
      "Rollback plan: Monday",
    ]);
    expect(deps.embeddings.embed).not.toHaveBeenCalled();
  });

  it("forwards organizationId to findArchiveByIds and restoreToCanonical", async () => {
    const archive = makeArchive({ organizationId: "finance-team" });
    const repo = makeRepo([archive]);
    const deps = makeDeps(repo);

    await unarchiveCompaction(
      { archiveIds: [50], organizationId: "finance-team", actor: "ops" },
      deps,
    );

    expect(repo.findArchiveByIds).toHaveBeenCalledWith([50], "finance-team");
    expect(repo.restoreToCanonical).toHaveBeenCalledWith(
      archive,
      "finance-team",
    );
  });
});

describe("unarchiveCompaction (skip cases)", () => {
  it("reports archive_not_found_or_org_mismatch when id is unknown", async () => {
    const repo = makeRepo([]); // empty findArchiveByIds result
    const result = await unarchiveCompaction(
      { archiveIds: [50, 51], organizationId: "org-a", actor: "ops" },
      makeDeps(repo),
    );

    expect(result.skippedCount).toBe(2);
    expect(result.outcomes.every((o) => o.status === "skipped")).toBe(true);
    const skippedReasons = result.outcomes.map((o) =>
      o.status === "skipped" ? o.reason : "",
    );
    expect(skippedReasons).toEqual([
      "archive_not_found_or_org_mismatch",
      "archive_not_found_or_org_mismatch",
    ]);
  });

  it("reports already_unarchived when unarchivedAt is set", async () => {
    const repo = makeRepo([
      makeArchive({ unarchivedAt: "2026-04-24T00:00:00.000Z" }),
    ]);
    const deps = makeDeps(repo);

    const result = await unarchiveCompaction(
      { archiveIds: [50], organizationId: "org-a", actor: "ops" },
      deps,
    );

    expect(result.skippedCount).toBe(1);
    expect(result.outcomes[0]).toEqual({
      archiveId: 50,
      status: "skipped",
      reason: "already_unarchived",
    });
    expect(repo.restoreToCanonical).not.toHaveBeenCalled();
  });

  it("reports pre_p19.1_archive_missing_source_id when sourceId is null", async () => {
    const repo = makeRepo([makeArchive({ sourceId: null })]);
    const deps = makeDeps(repo);

    const result = await unarchiveCompaction(
      { archiveIds: [50], organizationId: "org-a", actor: "ops" },
      deps,
    );

    expect(result.skippedCount).toBe(1);
    expect(result.outcomes[0]).toEqual({
      archiveId: 50,
      status: "skipped",
      reason: "pre_p19.1_archive_missing_source_id",
    });
    expect(repo.restoreToCanonical).not.toHaveBeenCalled();
  });
});

describe("unarchiveCompaction (failure isolation)", () => {
  it("deletes the restored canonical row when embedding fails after restore", async () => {
    const repo = makeRepo([makeArchive({ id: 50 })]);
    const deps = makeDeps(repo);
    (deps.embeddings.embedBatch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("embedding provider unavailable"),
    );

    const result = await unarchiveCompaction(
      { archiveIds: [50], organizationId: "org-a", actor: "ops" },
      deps,
    );

    expect(result.outcomes[0]).toEqual({
      archiveId: 50,
      status: "failed",
      error: "embedding provider unavailable",
    });
    expect(repo.deleteRestoredCanonicalRecord).toHaveBeenCalledWith(999, "org-a");
    expect(deps.vectorIndex.delete).not.toHaveBeenCalled();
    expect(repo.markUnarchived).not.toHaveBeenCalled();
  });

  it("deletes vector points and the restored row when chunk point updates fail", async () => {
    const repo = makeRepo([makeArchive({ id: 50 })]);
    const deps = makeDeps(repo);
    (deps.chunkRepository.updatePointIds as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("chunk update failed"));

    const result = await unarchiveCompaction(
      { archiveIds: [50], organizationId: "org-a", actor: "ops" },
      deps,
    );

    expect(result.outcomes[0]).toEqual({
      archiveId: 50,
      status: "failed",
      error: "chunk update failed",
    });
    expect(deps.vectorIndex.delete).toHaveBeenCalledWith(
      ["memory:999:chunk:7000"],
      { organizationId: "org-a" },
    );
    expect(repo.deleteRestoredCanonicalRecord).toHaveBeenCalledWith(999, "org-a");
    expect(repo.markUnarchived).not.toHaveBeenCalled();
  });

  it("preserves the original failure when vector cleanup also fails", async () => {
    const repo = makeRepo([makeArchive({ id: 50 })]);
    const deps = makeDeps(repo);
    (deps.chunkRepository.updatePointIds as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("chunk update failed"));
    (deps.vectorIndex.delete as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("vector cleanup failed"));

    const result = await unarchiveCompaction(
      { archiveIds: [50], organizationId: "org-a", actor: "ops" },
      deps,
    );

    expect(result.outcomes[0]).toEqual({
      archiveId: 50,
      status: "failed",
      error: "chunk update failed",
    });
    expect(repo.deleteRestoredCanonicalRecord).toHaveBeenCalledWith(999, "org-a");
    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "compact.unarchive_vector_compensation_failed",
        archiveId: 50,
      }),
      "failed to delete vector points after unarchive failure",
    );
  });

  it("isolates per-archive failures; one bad restore doesn't kill the batch", async () => {
    const repo = makeRepo([makeArchive({ id: 50 }), makeArchive({ id: 51 })]);
    (repo.restoreToCanonical as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ restoredRecordId: 999 })
      .mockRejectedValueOnce(new Error("PG full"));
    const deps = makeDeps(repo);

    const result = await unarchiveCompaction(
      { archiveIds: [50, 51], organizationId: "org-a", actor: "ops" },
      deps,
    );

    expect(result.restoredCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.outcomes[0]!.status).toBe("restored");
    expect(result.outcomes[1]).toEqual({
      archiveId: 51,
      status: "failed",
      error: "PG full",
    });
  });

  it("isolates embedBatch length mismatches to the affected archive", async () => {
    const repo = makeRepo([makeArchive({ id: 50 }), makeArchive({ id: 51 })]);
    const deps = makeDeps(repo);
    (deps.embeddings.embedBatch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([]);

    const result = await unarchiveCompaction(
      { archiveIds: [50, 51], organizationId: "org-a", actor: "ops" },
      deps,
    );

    expect(result.restoredCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(result.outcomes[0]).toMatchObject({
      archiveId: 50,
      status: "failed",
      error: expect.stringContaining(
        "unarchive embedBatch returned 0 vectors for 1 chunks",
      ),
    });
    expect(result.outcomes[1]).toMatchObject({
      archiveId: 51,
      status: "restored",
    });
    expect(repo.markUnarchived).toHaveBeenCalledOnce();
    expect(repo.markUnarchived).toHaveBeenCalledWith(51);
  });
});
