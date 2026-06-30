import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadSweeperEnabled,
  loadSweeperIntervalMs,
  startBackgroundSweeper,
} from "../../src/compact/sweeper-loop.js";
import type { MemoryArchiveRepository } from "../../src/store/memory-archive-repository.js";

const SILENT_LOGGER = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
} as unknown as Parameters<typeof startBackgroundSweeper>[0]["logger"];
const callStartBackgroundSweeper = (input: unknown) =>
  startBackgroundSweeper(
    input as Parameters<typeof startBackgroundSweeper>[0],
  );

function makeRepo(): MemoryArchiveRepository {
  return {
    createCompactionRun: vi.fn(),
    findRunByIdempotencyKey: vi.fn(),
    applyCompactionRecord: vi.fn(),
    markQdrantStatus: vi.fn().mockResolvedValue(undefined),
    completeCompactionRun: vi.fn(),
    findPendingQdrantCleanup: vi.fn().mockResolvedValue([]),
    claimPendingQdrantCleanup: vi.fn().mockResolvedValue([]),
    acquireScopeLock: vi.fn(),
    countRecentApplyRuns: vi.fn().mockResolvedValue(0),
    findArchiveByIds: vi.fn().mockResolvedValue([]),
    restoreToCanonical: vi.fn(),
    deleteRestoredCanonicalRecord: vi.fn().mockResolvedValue(undefined),
    markUnarchived: vi.fn().mockResolvedValue(undefined),
  };
}

function makeVectorIndex() {
  return {
    delete: vi.fn(),
    deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn(),
    query: vi.fn(),
    ensureCollection: vi.fn(),
  };
}

describe("startBackgroundSweeper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([undefined, null, "input", 12, true, []])(
    "rejects non-object direct input",
    (input) => {
      expect(() => callStartBackgroundSweeper(input)).toThrow(
        "startBackgroundSweeper input must be an object",
      );
    },
  );

  it.each<[
    (input: Parameters<typeof startBackgroundSweeper>[0]) => unknown,
    string,
  ]>([
    [(input) => ({ ...input, logger: null }), "logger must be an object"],
    [
      (input) => ({ ...input, logger: { ...input.logger, info: null } }),
      "logger.info must be a function",
    ],
    [
      (input) => ({ ...input, logger: { ...input.logger, error: null } }),
      "logger.error must be a function",
    ],
    [(input) => ({ ...input, metrics: null }), "metrics must be an object"],
    [
      (input) => ({
        ...input,
        metrics: { observeSweeperTick: null },
      }),
      "metrics.observeSweeperTick must be a function",
    ],
    [
      (input) => ({ ...input, intervalMs: Number.NaN }),
      "startBackgroundSweeper: intervalMs must be ≥ 1000 (got NaN)",
    ],
    [
      (input) => ({ ...input, intervalMs: 1000.5 }),
      "startBackgroundSweeper: intervalMs must be ≥ 1000 (got 1000.5)",
    ],
  ])("rejects invalid direct input field", (mutateInput, message) => {
    const repo = makeRepo();

    expect(() =>
      callStartBackgroundSweeper(
        mutateInput({
          archiveRepository: repo,
          vectorIndex: makeVectorIndex(),
          logger: SILENT_LOGGER,
        }),
      ),
    ).toThrow(message);

    expect(repo.claimPendingQdrantCleanup).not.toHaveBeenCalled();
  });

  it("rejects intervalMs < 1000", () => {
    const repo = makeRepo();
    expect(() =>
      startBackgroundSweeper({
        archiveRepository: repo,
        vectorIndex: makeVectorIndex(),
        logger: SILENT_LOGGER,
        intervalMs: 500,
      }),
    ).toThrow(/intervalMs must be ≥ 1000/);
  });

  it("claims pending qdrant cleanup on each tick", async () => {
    const repo = makeRepo();
    const metrics = { observeSweeperTick: vi.fn() };
    const handle = startBackgroundSweeper({
      archiveRepository: repo,
      vectorIndex: makeVectorIndex(),
      logger: SILENT_LOGGER,
      metrics,
      intervalMs: 1000,
    });

    expect(repo.claimPendingQdrantCleanup).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(repo.claimPendingQdrantCleanup).toHaveBeenCalledTimes(1);
    expect(metrics.observeSweeperTick).toHaveBeenCalledWith(
      expect.objectContaining({
        worker: "compaction",
        status: "success",
        counts: {
          scanned: 0,
          cleaned: 0,
          retried: 0,
          failed: 0,
        },
        durationSeconds: expect.any(Number),
      }),
    );

    await vi.advanceTimersByTimeAsync(1000);
    expect(repo.claimPendingQdrantCleanup).toHaveBeenCalledTimes(2);

    await handle.stop();
  });

  it("stops further ticks after stop() is called", async () => {
    const repo = makeRepo();
    const handle = startBackgroundSweeper({
      archiveRepository: repo,
      vectorIndex: makeVectorIndex(),
      logger: SILENT_LOGGER,
      intervalMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(repo.claimPendingQdrantCleanup).toHaveBeenCalledTimes(1);

    await handle.stop();

    await vi.advanceTimersByTimeAsync(5000);
    expect(repo.claimPendingQdrantCleanup).toHaveBeenCalledTimes(1);
  });

  it("swallows tick errors and continues looping", async () => {
    const repo = makeRepo();
    const metrics = { observeSweeperTick: vi.fn() };
    (repo.claimPendingQdrantCleanup as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("transient PG failure"))
      .mockResolvedValueOnce([]);

    const handle = startBackgroundSweeper({
      archiveRepository: repo,
      vectorIndex: makeVectorIndex(),
      logger: SILENT_LOGGER,
      metrics,
      intervalMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(repo.claimPendingQdrantCleanup).toHaveBeenCalledTimes(2);
    expect(metrics.observeSweeperTick).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        worker: "compaction",
        status: "error",
        durationSeconds: expect.any(Number),
      }),
    );
    expect(metrics.observeSweeperTick).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        worker: "compaction",
        status: "success",
      }),
    );
    await handle.stop();
  });
});

describe("loadSweeperEnabled", () => {
  it("returns false when env var is unset or empty", () => {
    expect(loadSweeperEnabled({})).toBe(false);
    expect(loadSweeperEnabled({ COMPACTION_SWEEP_ENABLED: "" })).toBe(false);
  });

  it("returns true for canonical true values", () => {
    expect(loadSweeperEnabled({ COMPACTION_SWEEP_ENABLED: "true" })).toBe(true);
    expect(loadSweeperEnabled({ COMPACTION_SWEEP_ENABLED: "1" })).toBe(true);
    expect(loadSweeperEnabled({ COMPACTION_SWEEP_ENABLED: "yes" })).toBe(true);
    expect(loadSweeperEnabled({ COMPACTION_SWEEP_ENABLED: "  TRUE  " })).toBe(
      true,
    );
  });

  it("returns false for non-canonical values (fail-closed)", () => {
    expect(loadSweeperEnabled({ COMPACTION_SWEEP_ENABLED: "false" })).toBe(false);
    expect(loadSweeperEnabled({ COMPACTION_SWEEP_ENABLED: "0" })).toBe(false);
    expect(loadSweeperEnabled({ COMPACTION_SWEEP_ENABLED: "yep" })).toBe(false);
  });
});

describe("loadSweeperIntervalMs", () => {
  it("returns 30_000 default when env unset", () => {
    expect(loadSweeperIntervalMs({})).toBe(30_000);
  });

  it("parses integer values", () => {
    expect(loadSweeperIntervalMs({ COMPACTION_SWEEP_INTERVAL_MS: "60000" }))
      .toBe(60_000);
  });

  it("rejects values < 1000 and non-numeric", () => {
    expect(() =>
      loadSweeperIntervalMs({ COMPACTION_SWEEP_INTERVAL_MS: "500" }),
    ).toThrow(/≥ 1000/);
    expect(() =>
      loadSweeperIntervalMs({ COMPACTION_SWEEP_INTERVAL_MS: "abc" }),
    ).toThrow(/finite integer/);
    expect(() =>
      loadSweeperIntervalMs({ COMPACTION_SWEEP_INTERVAL_MS: "1000abc" }),
    ).toThrow(/finite integer/);
    expect(() =>
      loadSweeperIntervalMs({ COMPACTION_SWEEP_INTERVAL_MS: "1000.5" }),
    ).toThrow(/finite integer/);
    expect(() =>
      loadSweeperIntervalMs({ COMPACTION_SWEEP_INTERVAL_MS: "1e3" }),
    ).toThrow(/finite integer/);
    expect(() =>
      loadSweeperIntervalMs({ COMPACTION_SWEEP_INTERVAL_MS: "0x3e8" }),
    ).toThrow(/finite integer/);
    expect(() =>
      loadSweeperIntervalMs({ COMPACTION_SWEEP_INTERVAL_MS: "0b1111101000" }),
    ).toThrow(/finite integer/);
  });
});
