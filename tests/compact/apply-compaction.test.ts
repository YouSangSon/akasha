import { describe, expect, it, vi } from "vitest";
import {
  applyCompaction,
  CompactionRateLimitError,
  type ApplyCompactionDeps,
  type ApplyCompactionInput,
} from "../../src/compact/apply-compaction.js";
import type { SearchMemoryResult } from "../../src/types.js";
import type {
  CompactionRunRow,
  MemoryArchiveRepository,
} from "../../src/store/memory-archive-repository.js";

const NOW = new Date("2026-04-25T12:00:00.000Z");

function makeRecord(overrides: Partial<SearchMemoryResult> = {}): SearchMemoryResult {
  return {
    id: 1,
    organizationId: "org-a",
    sourceId: 100,
    scopeType: "project",
    scopeId: "project-alpha",
    memoryType: "summary",
    content: "default content",
    createdAt: "2026-04-25T00:00:00.000Z",
    updatedAt: "2026-04-25T00:00:00.000Z",
    importance: 0,
    durability: "durable",
    source: {
      id: 200,
      scopeType: "project",
      scopeId: "project-alpha",
      sourceType: "document",
      externalId: "doc-1",
      title: "Doc 1",
      uri: "file:///tmp/doc-1.md",
      createdAt: "2026-04-25T00:00:00.000Z",
    },
    ...overrides,
  };
}

const TEST_RUN_ID = "00000000-0000-0000-0000-000000000001";

const FRESH_RUN: CompactionRunRow = {
  id: 7,
  organizationId: "org-a",
  status: "pending",
  archivedCount: 0,
  duplicateCount: 0,
  decayCount: 0,
  qdrantFailed: 0,
};

function makeRepoMocks(overrides: Partial<MemoryArchiveRepository> = {}) {
  const createCompactionRun = vi.fn().mockResolvedValue(FRESH_RUN);
  const findRunByIdempotencyKey = vi.fn().mockResolvedValue(null);
  const applyCompactionRecord = vi
    .fn()
    .mockResolvedValue({ archived: false, qdrantPointIds: [] });
  const markQdrantStatus = vi.fn().mockResolvedValue(undefined);
  const completeCompactionRun = vi.fn().mockResolvedValue(undefined);
  const findPendingQdrantCleanup = vi.fn().mockResolvedValue([]);
  const acquireScopeLock = vi.fn().mockResolvedValue(true);
  const countRecentApplyRuns = vi.fn().mockResolvedValue(0);

  const repo: MemoryArchiveRepository = {
    createCompactionRun,
    findRunByIdempotencyKey,
    applyCompactionRecord,
    markQdrantStatus,
    completeCompactionRun,
    findPendingQdrantCleanup,
    acquireScopeLock,
    countRecentApplyRuns,
    findArchiveByIds: vi.fn().mockResolvedValue([]),
    restoreToCanonical: vi.fn(),
    markUnarchived: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return {
    repo,
    createCompactionRun,
    applyCompactionRecord,
    markQdrantStatus,
    completeCompactionRun,
  };
}

function makeQdrant(overrides: Partial<{ deletePoints: ReturnType<typeof vi.fn> }> = {}) {
  return {
    deletePoints: overrides.deletePoints ?? vi.fn().mockResolvedValue(undefined),
  };
}

const SILENT_LOGGER = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
} as unknown as ApplyCompactionDeps["logger"];

function makeInput(overrides: Partial<ApplyCompactionInput> = {}): ApplyCompactionInput {
  return {
    records: [],
    scope: "project",
    scopeLabel: "project-alpha",
    projectKey: "project-alpha",
    organizationId: "org-a",
    actor: "test-actor",
    dryRun: true,
    now: NOW,
    ...overrides,
  };
}

function makeDeps(
  repo: MemoryArchiveRepository,
  qdrant: { deletePoints: ReturnType<typeof vi.fn> },
  overrides: Partial<ApplyCompactionDeps> = {},
): ApplyCompactionDeps {
  return {
    archiveRepository: repo,
    qdrantClient: qdrant,
    collectionName: "memory_chunks_v1",
    logger: SILENT_LOGGER,
    generateRunId: () => TEST_RUN_ID,
    now: () => NOW,
    ...overrides,
  };
}

describe("applyCompaction (dry-run)", () => {
  it("returns plan + zero stats without calling repo or qdrant", async () => {
    const { repo, createCompactionRun, applyCompactionRecord } = makeRepoMocks();
    const qdrant = makeQdrant();

    const result = await applyCompaction(
      makeInput({ dryRun: true }),
      makeDeps(repo, qdrant),
    );

    expect(result.dryRun).toBe(true);
    expect(result.compactionRunId).toBe(TEST_RUN_ID);
    expect(result.applyStats.archived).toBe(0);
    expect(createCompactionRun).not.toHaveBeenCalled();
    expect(applyCompactionRecord).not.toHaveBeenCalled();
    expect(qdrant.deletePoints).not.toHaveBeenCalled();
  });
});

describe("applyCompaction (apply path - happy path)", () => {
  it("archives a duplicate group, calls qdrant delete, marks deleted", async () => {
    const archive = vi
      .fn()
      .mockResolvedValueOnce({
        archived: true,
        archiveId: 100,
        qdrantPointIds: ["p1", "p2"],
      })
      .mockResolvedValueOnce({
        archived: true,
        archiveId: 101,
        qdrantPointIds: ["p3"],
      });
    const { repo, createCompactionRun, markQdrantStatus, completeCompactionRun } =
      makeRepoMocks({ applyCompactionRecord: archive });
    const qdrant = makeQdrant();

    const records = [
      makeRecord({ id: 1, content: "Decision: ship" }),
      makeRecord({ id: 2, content: "Decision: ship" }),
      makeRecord({ id: 3, content: "Decision: ship" }),
    ];

    const result = await applyCompaction(
      makeInput({ records, dryRun: false, decayThreshold: 0 }),
      makeDeps(repo, qdrant),
    );

    expect(result.dryRun).toBe(false);
    expect(result.applyStats.archived).toBe(2);
    expect(result.applyStats.skipped).toBe(0);
    expect(result.applyStats.qdrantPointsDeleted).toBe(3); // p1, p2, p3
    expect(result.archivedIds.sort()).toEqual(["2", "3"]);
    expect(createCompactionRun).toHaveBeenCalledOnce();
    expect(qdrant.deletePoints).toHaveBeenCalledTimes(2);
    expect(markQdrantStatus).toHaveBeenCalledTimes(2);
    expect(markQdrantStatus.mock.calls[0]![1]).toBe("deleted");
    expect(completeCompactionRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed", archivedCount: 2 }),
    );
  });

  it("forwards organizationId to applyCompactionRecord (multi-tenancy guard)", async () => {
    const archive = vi
      .fn()
      .mockResolvedValue({ archived: true, archiveId: 1, qdrantPointIds: [] });
    const { repo } = makeRepoMocks({ applyCompactionRecord: archive });
    const qdrant = makeQdrant();

    const records = [
      makeRecord({ id: 10, content: "same" }),
      makeRecord({ id: 11, content: "same" }),
    ];

    await applyCompaction(
      makeInput({
        records,
        dryRun: false,
        organizationId: "finance-team",
        decayThreshold: 0,
      }),
      makeDeps(repo, qdrant),
    );

    expect(archive).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "finance-team" }),
    );
  });

  it("counts skipped when applyCompactionRecord returns archived=false", async () => {
    const archive = vi
      .fn()
      .mockResolvedValueOnce({ archived: false, qdrantPointIds: [] })
      .mockResolvedValueOnce({ archived: true, archiveId: 1, qdrantPointIds: [] });
    const { repo } = makeRepoMocks({ applyCompactionRecord: archive });
    const qdrant = makeQdrant();

    const records = [
      makeRecord({ id: 1, content: "x" }),
      makeRecord({ id: 2, content: "x" }),
      makeRecord({ id: 3, content: "x" }),
    ];

    const result = await applyCompaction(
      makeInput({ records, dryRun: false, decayThreshold: 0 }),
      makeDeps(repo, qdrant),
    );

    expect(result.applyStats.archived).toBe(1);
    expect(result.applyStats.skipped).toBe(1);
  });
});

describe("applyCompaction (apply path - replay)", () => {
  it("returns prior outcome when run already completed", async () => {
    const COMPLETED_RUN: CompactionRunRow = {
      ...FRESH_RUN,
      status: "completed",
      archivedCount: 5,
      qdrantFailed: 1,
    };
    const { repo, applyCompactionRecord } = makeRepoMocks({
      createCompactionRun: vi.fn().mockResolvedValue(COMPLETED_RUN),
    });
    const qdrant = makeQdrant();

    const result = await applyCompaction(
      makeInput({ dryRun: false }),
      makeDeps(repo, qdrant),
    );

    expect(result.applyStats.archived).toBe(5);
    expect(result.applyStats.qdrantPointsPending).toBe(1);
    expect(result.summary).toContain("Replay");
    expect(applyCompactionRecord).not.toHaveBeenCalled();
    expect(qdrant.deletePoints).not.toHaveBeenCalled();
  });
});

describe("applyCompaction (apply path - partial failure)", () => {
  it("Qdrant delete fails: archive remains, qdrantPending counted, sweeper handoff", async () => {
    const archive = vi
      .fn()
      .mockResolvedValue({
        archived: true,
        archiveId: 100,
        qdrantPointIds: ["p1", "p2"],
      });
    const { repo, markQdrantStatus, completeCompactionRun } = makeRepoMocks({
      applyCompactionRecord: archive,
    });
    const qdrant = makeQdrant({
      deletePoints: vi.fn().mockRejectedValue(new Error("Qdrant 503")),
    });

    const records = [
      makeRecord({ id: 1, content: "x" }),
      makeRecord({ id: 2, content: "x" }),
    ];

    const result = await applyCompaction(
      makeInput({ records, dryRun: false, decayThreshold: 0 }),
      makeDeps(repo, qdrant),
    );

    // PG archive succeeded — record IS archived even though Qdrant failed.
    expect(result.archivedIds).toEqual(["2"]);
    expect(result.applyStats.archived).toBe(1);
    expect(result.applyStats.qdrantPointsDeleted).toBe(0);
    expect(result.applyStats.qdrantPointsPending).toBe(2);
    // markQdrantStatus called with 'pending' + error message for sweeper.
    expect(markQdrantStatus).toHaveBeenCalledWith(100, "pending", "Qdrant 503");
    expect(completeCompactionRun).toHaveBeenCalledWith(
      expect.objectContaining({ qdrantFailed: 1 }),
    );
  });

  it("PG applyCompactionRecord throws: marks run failed and rethrows", async () => {
    const pgError = new Error("PG connection lost");
    const { repo, completeCompactionRun } = makeRepoMocks({
      applyCompactionRecord: vi.fn().mockRejectedValue(pgError),
    });
    const qdrant = makeQdrant();

    const records = [
      makeRecord({ id: 1, content: "x" }),
      makeRecord({ id: 2, content: "x" }),
    ];

    await expect(
      applyCompaction(
        makeInput({ records, dryRun: false }),
        makeDeps(repo, qdrant),
      ),
    ).rejects.toBe(pgError);

    expect(completeCompactionRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorMessage: "PG connection lost",
      }),
    );
    expect(qdrant.deletePoints).not.toHaveBeenCalled();
  });
});

describe("applyCompaction (rate limit)", () => {
  it("throws CompactionRateLimitError when org has a recent dryRun=false run", async () => {
    const countSpy = vi.fn().mockResolvedValue(1); // 1 recent apply
    const { repo } = makeRepoMocks({ countRecentApplyRuns: countSpy });
    const qdrant = makeQdrant();

    await expect(
      applyCompaction(
        makeInput({ dryRun: false }),
        makeDeps(repo, qdrant), // default rate limit: 1/hour
      ),
    ).rejects.toBeInstanceOf(CompactionRateLimitError);
    expect(countSpy).toHaveBeenCalledWith("org-a", 60 * 60 * 1000);
  });

  it("does not check rate limit when windowMs=0 (test/ops bypass)", async () => {
    const countSpy = vi.fn().mockResolvedValue(99);
    const { repo } = makeRepoMocks({ countRecentApplyRuns: countSpy });
    const qdrant = makeQdrant();

    await applyCompaction(
      makeInput({ dryRun: false }),
      makeDeps(repo, qdrant, {
        applyRateLimit: { windowMs: 0, maxRuns: 1 },
      }),
    );

    expect(countSpy).not.toHaveBeenCalled();
  });

  it("does not check rate limit on dry-run path", async () => {
    const countSpy = vi.fn().mockResolvedValue(5);
    const { repo } = makeRepoMocks({ countRecentApplyRuns: countSpy });
    const qdrant = makeQdrant();

    await applyCompaction(
      makeInput({ dryRun: true }),
      makeDeps(repo, qdrant),
    );

    expect(countSpy).not.toHaveBeenCalled();
  });
});

describe("applyCompaction (deduplicates records appearing in both duplicate and decay)", () => {
  it("archives a record once when present in duplicate.archive AND decayCandidates", async () => {
    const archive = vi
      .fn()
      .mockResolvedValue({ archived: true, archiveId: 1, qdrantPointIds: [] });
    const { repo } = makeRepoMocks({ applyCompactionRecord: archive });
    const qdrant = makeQdrant();

    // Build a record set where:
    // - id=1 and id=2 are duplicates (same content) → id=2 archived as duplicate
    // - id=2 also old + low importance → would qualify as decay
    const oldDup1 = makeRecord({
      id: 1,
      content: "duplicate fact",
      importance: 5,
      memoryType: "fact",
    });
    const oldDup2 = makeRecord({
      id: 2,
      content: "duplicate fact",
      importance: 1, // low importance → decay-eligible
      createdAt: "2025-01-01T00:00:00.000Z", // old
      memoryType: "fact",
    });

    await applyCompaction(
      makeInput({
        records: [oldDup1, oldDup2],
        dryRun: false,
        decayThreshold: 0.5,
        halfLifeDays: 30,
      }),
      makeDeps(repo, qdrant),
    );

    // applyCompactionRecord called exactly once for id=2 (the only archive
    // candidate); id=1 is the kept record. Reason='duplicate' wins over 'decay'.
    expect(archive).toHaveBeenCalledTimes(1);
    expect(archive).toHaveBeenCalledWith(
      expect.objectContaining({
        recordId: 2,
        reason: "duplicate",
        keptRecordId: 1,
      }),
    );
  });
});
