import { describe, expect, it, vi } from "vitest";
import { runOutboxSweep } from "../../src/compact/outbox-sweeper.js";
import type {
  MemoryArchiveRepository,
  PendingQdrantCleanup,
} from "../../src/store/memory-archive-repository.js";

const SILENT_LOGGER = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
} as unknown as Parameters<typeof runOutboxSweep>[0]["logger"];

function makeRepoWithPending(
  pending: PendingQdrantCleanup[],
  overrides: Partial<MemoryArchiveRepository> = {},
): { repo: MemoryArchiveRepository; markQdrantStatus: ReturnType<typeof vi.fn> } {
  const findPendingQdrantCleanup = vi.fn().mockResolvedValue(pending);
  const claimPendingQdrantCleanup = vi.fn().mockResolvedValue(pending);
  const markQdrantStatus = vi.fn().mockResolvedValue(undefined);

  const repo: MemoryArchiveRepository = {
    createCompactionRun: vi.fn(),
    findRunByIdempotencyKey: vi.fn(),
    applyCompactionRecord: vi.fn(),
    markQdrantStatus,
    completeCompactionRun: vi.fn(),
    findPendingQdrantCleanup,
    claimPendingQdrantCleanup,
    acquireScopeLock: vi.fn(),
    countRecentApplyRuns: vi.fn().mockResolvedValue(0),
    findArchiveByIds: vi.fn().mockResolvedValue([]),
    restoreToCanonical: vi.fn(),
    markUnarchived: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { repo, markQdrantStatus };
}

describe("runOutboxSweep", () => {
  it("claims pending rows with the injected clock before deleting vectors", async () => {
    const pending: PendingQdrantCleanup[] = [
      {
        archiveId: 9,
        organizationId: "org-a",
        qdrantPointIds: ["p9"],
        attemptCount: 0,
      },
    ];
    const claimPendingQdrantCleanup = vi.fn().mockResolvedValue(pending);
    const { repo } = makeRepoWithPending([], { claimPendingQdrantCleanup });
    const vectorIndex = {
      delete: vi.fn().mockResolvedValue(undefined),
      deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
      upsert: vi.fn(),
      query: vi.fn(),
      ensureCollection: vi.fn(),
    };
    const now = new Date("2026-06-25T00:00:00.000Z");

    const result = await runOutboxSweep({
      archiveRepository: repo,
      vectorIndex,
      logger: SILENT_LOGGER,
      now: () => now,
    });

    expect(result).toEqual({ scanned: 1, cleaned: 1, retried: 0, failed: 0 });
    expect(claimPendingQdrantCleanup).toHaveBeenCalledWith({ limit: 100, now });
    expect(repo.findPendingQdrantCleanup).not.toHaveBeenCalled();
  });

  it("returns zero counts when no pending rows", async () => {
    const { repo } = makeRepoWithPending([]);
    const vectorIndex = { delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), upsert: vi.fn(), query: vi.fn(), ensureCollection: vi.fn() };

    const result = await runOutboxSweep({
      archiveRepository: repo,
      vectorIndex,
      logger: SILENT_LOGGER,
    });

    expect(result).toEqual({ scanned: 0, cleaned: 0, retried: 0, failed: 0 });
    expect(vectorIndex.delete).not.toHaveBeenCalled();
  });

  it("cleans pending rows and marks them deleted", async () => {
    const pending: PendingQdrantCleanup[] = [
      {
        archiveId: 1,
        organizationId: "org-a",
        qdrantPointIds: ["p1", "p2"],
        attemptCount: 0,
      },
      {
        archiveId: 2,
        organizationId: "org-a",
        qdrantPointIds: ["p3"],
        attemptCount: 1,
      },
    ];
    const { repo, markQdrantStatus } = makeRepoWithPending(pending);
    const vectorIndex = { delete: vi.fn().mockResolvedValue(undefined), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), upsert: vi.fn(), query: vi.fn(), ensureCollection: vi.fn() };

    const result = await runOutboxSweep({
      archiveRepository: repo,
      vectorIndex,
      logger: SILENT_LOGGER,
    });

    expect(result).toEqual({ scanned: 2, cleaned: 2, retried: 0, failed: 0 });
    expect(vectorIndex.delete).toHaveBeenCalledTimes(2);
    expect(vectorIndex.delete).toHaveBeenNthCalledWith(1, ["p1", "p2"]);
    expect(markQdrantStatus.mock.calls.every((c) => c[1] === "deleted")).toBe(
      true,
    );
  });

  it("retries on Qdrant error if attempt < maxAttempts (status stays pending)", async () => {
    const pending: PendingQdrantCleanup[] = [
      {
        archiveId: 1,
        organizationId: "org-a",
        qdrantPointIds: ["p1"],
        attemptCount: 2, // next attempt = 3, < default maxAttempts (5)
      },
    ];
    const { repo, markQdrantStatus } = makeRepoWithPending(pending);
    const vectorIndex = {
      delete: vi.fn().mockRejectedValue(new Error("Qdrant 503")),
      deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
      upsert: vi.fn(), query: vi.fn(), ensureCollection: vi.fn(),
    };

    const result = await runOutboxSweep({
      archiveRepository: repo,
      vectorIndex,
      logger: SILENT_LOGGER,
    });

    expect(result).toEqual({ scanned: 1, cleaned: 0, retried: 1, failed: 0 });
    expect(markQdrantStatus).toHaveBeenCalledWith(1, "pending", "Qdrant 503");
  });

  it("gives up and marks failed after maxAttempts", async () => {
    const pending: PendingQdrantCleanup[] = [
      {
        archiveId: 1,
        organizationId: "org-a",
        qdrantPointIds: ["p1"],
        attemptCount: 4, // next attempt = 5 = default maxAttempts → giveUp
      },
    ];
    const { repo, markQdrantStatus } = makeRepoWithPending(pending);
    const vectorIndex = {
      delete: vi.fn().mockRejectedValue(new Error("Qdrant 503")),
      deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
      upsert: vi.fn(), query: vi.fn(), ensureCollection: vi.fn(),
    };

    const result = await runOutboxSweep({
      archiveRepository: repo,
      vectorIndex,
      logger: SILENT_LOGGER,
    });

    expect(result).toEqual({ scanned: 1, cleaned: 0, retried: 0, failed: 1 });
    expect(markQdrantStatus).toHaveBeenCalledWith(1, "failed", "Qdrant 503");
  });

  it("respects custom batchSize and maxAttempts", async () => {
    const { repo } = makeRepoWithPending([]);
    const claimSpy = repo.claimPendingQdrantCleanup as ReturnType<typeof vi.fn>;
    const vectorIndex = { delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), upsert: vi.fn(), query: vi.fn(), ensureCollection: vi.fn() };

    await runOutboxSweep({
      archiveRepository: repo,
      vectorIndex,
      logger: SILENT_LOGGER,
      batchSize: 25,
      maxAttempts: 2,
    });

    expect(claimSpy).toHaveBeenCalledWith({
      limit: 25,
      now: expect.any(Date),
    });
  });
});
