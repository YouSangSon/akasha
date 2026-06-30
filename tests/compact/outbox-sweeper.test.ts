import { describe, expect, it, vi } from "vitest";
import {
  runOutboxSweep,
  type RunOutboxSweepInput,
} from "../../src/compact/outbox-sweeper.js";
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
const callRunOutboxSweep = (input: unknown) =>
  runOutboxSweep(input as RunOutboxSweepInput);

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
    deleteRestoredCanonicalRecord: vi.fn().mockResolvedValue(undefined),
    markUnarchived: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { repo, markQdrantStatus };
}

function makeVectorIndex(
  overrides: Partial<{
    delete: ReturnType<typeof vi.fn>;
    deleteByRecordIds: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    ensureCollection: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    delete: overrides.delete ?? vi.fn().mockResolvedValue(undefined),
    deleteByRecordIds:
      overrides.deleteByRecordIds ?? vi.fn().mockResolvedValue(undefined),
    upsert: overrides.upsert ?? vi.fn(),
    query: overrides.query ?? vi.fn(),
    ensureCollection: overrides.ensureCollection ?? vi.fn(),
  };
}

describe("runOutboxSweep", () => {
  it.each([undefined, null, "input", 12, true, []])(
    "rejects non-object direct input",
    async (input) => {
      await expect(callRunOutboxSweep(input)).rejects.toThrow(
        "runOutboxSweep input must be an object",
      );
    },
  );

  it.each<[
    (input: RunOutboxSweepInput) => unknown,
    string,
  ]>([
    [
      (input) => ({ ...input, archiveRepository: null }),
      "archiveRepository must be an object",
    ],
    [
      (input) => ({
        ...input,
        archiveRepository: {
          ...input.archiveRepository,
          claimPendingQdrantCleanup: null,
        },
      }),
      "archiveRepository.claimPendingQdrantCleanup must be a function",
    ],
    [
      (input) => ({ ...input, vectorIndex: null }),
      "vectorIndex must be an object",
    ],
    [
      (input) => ({
        ...input,
        vectorIndex: { ...input.vectorIndex, delete: null },
      }),
      "vectorIndex.delete must be a function",
    ],
    [(input) => ({ ...input, logger: null }), "logger must be an object"],
    [
      (input) => ({
        ...input,
        logger: { ...input.logger, warn: null },
      }),
      "logger.warn must be a function",
    ],
    [
      (input) => ({
        ...input,
        logger: { ...input.logger, error: null },
      }),
      "logger.error must be a function",
    ],
    [
      (input) => ({ ...input, batchSize: 0 }),
      "batchSize must be a positive safe integer",
    ],
    [
      (input) => ({ ...input, maxAttempts: Number.NaN }),
      "maxAttempts must be a positive safe integer",
    ],
    [(input) => ({ ...input, now: "now" }), "now must be a function"],
  ])("rejects invalid direct input field", async (mutateInput, message) => {
    const { repo, markQdrantStatus } = makeRepoWithPending([]);
    const vectorIndex = makeVectorIndex();

    await expect(
      callRunOutboxSweep(
        mutateInput({
          archiveRepository: repo,
          vectorIndex,
          logger: SILENT_LOGGER,
        }),
      ),
    ).rejects.toThrow(message);

    expect(repo.claimPendingQdrantCleanup).not.toHaveBeenCalled();
    expect(markQdrantStatus).not.toHaveBeenCalled();
    expect(vectorIndex.delete).not.toHaveBeenCalled();
  });

  it("rejects invalid injected time values before claiming rows", async () => {
    const { repo, markQdrantStatus } = makeRepoWithPending([]);
    const vectorIndex = makeVectorIndex();

    await expect(
      runOutboxSweep({
        archiveRepository: repo,
        vectorIndex,
        logger: SILENT_LOGGER,
        now: () => new Date("not-a-date"),
      }),
    ).rejects.toThrow("now result must be a valid Date");

    expect(repo.claimPendingQdrantCleanup).not.toHaveBeenCalled();
    expect(markQdrantStatus).not.toHaveBeenCalled();
    expect(vectorIndex.delete).not.toHaveBeenCalled();
  });

  it.each([
    [null, "claimPendingQdrantCleanup result must be an array", true],
    [null, "claimPendingQdrantCleanup result[0] must be an object"],
    [
      { archiveId: 0 },
      "claimPendingQdrantCleanup result[0].archiveId must be a positive safe integer",
    ],
    [
      { organizationId: " \n\t " },
      "claimPendingQdrantCleanup result[0].organizationId must contain non-whitespace text",
    ],
    [
      { qdrantPointIds: null },
      "claimPendingQdrantCleanup result[0].qdrantPointIds must be an array",
    ],
    [
      { qdrantPointIds: [""] },
      "claimPendingQdrantCleanup result[0].qdrantPointIds[0] must contain non-whitespace text",
    ],
    [
      { attemptCount: -1 },
      "claimPendingQdrantCleanup result[0].attemptCount must be a non-negative safe integer",
    ],
  ])(
    "rejects malformed claimed cleanup rows",
    async (overrides, message, useRawClaimResult = false) => {
      const row =
        overrides === null
          ? overrides
          : {
              archiveId: 9,
              organizationId: "org-a",
              qdrantPointIds: ["p9"],
              attemptCount: 0,
              ...(overrides as Record<string, unknown>),
            };
      const pending = useRawClaimResult ? row : [row];
      const { repo, markQdrantStatus } = makeRepoWithPending(
        pending as PendingQdrantCleanup[],
      );
      const vectorIndex = makeVectorIndex();

      await expect(
        runOutboxSweep({
          archiveRepository: repo,
          vectorIndex,
          logger: SILENT_LOGGER,
        }),
      ).rejects.toThrow(message);

      expect(repo.claimPendingQdrantCleanup).toHaveBeenCalledOnce();
      expect(markQdrantStatus).not.toHaveBeenCalled();
      expect(vectorIndex.delete).not.toHaveBeenCalled();
    },
  );

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
    const vectorIndex = makeVectorIndex();
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
    expect(vectorIndex.delete).toHaveBeenCalledWith(["p9"], {
      organizationId: "org-a",
    });
  });

  it("returns zero counts when no pending rows", async () => {
    const { repo } = makeRepoWithPending([]);
    const vectorIndex = makeVectorIndex({ delete: vi.fn() });

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
    const vectorIndex = makeVectorIndex();

    const result = await runOutboxSweep({
      archiveRepository: repo,
      vectorIndex,
      logger: SILENT_LOGGER,
    });

    expect(result).toEqual({ scanned: 2, cleaned: 2, retried: 0, failed: 0 });
    expect(vectorIndex.delete).toHaveBeenCalledTimes(2);
    expect(vectorIndex.delete).toHaveBeenNthCalledWith(1, ["p1", "p2"], {
      organizationId: "org-a",
    });
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
    const vectorIndex = makeVectorIndex({ delete: vi.fn() });

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
