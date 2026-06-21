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

function makeRepo(): MemoryArchiveRepository {
  return {
    createCompactionRun: vi.fn(),
    findRunByIdempotencyKey: vi.fn(),
    applyCompactionRecord: vi.fn(),
    markQdrantStatus: vi.fn().mockResolvedValue(undefined),
    completeCompactionRun: vi.fn(),
    findPendingQdrantCleanup: vi.fn().mockResolvedValue([]),
    acquireScopeLock: vi.fn(),
    countRecentApplyRuns: vi.fn().mockResolvedValue(0),
    findArchiveByIds: vi.fn().mockResolvedValue([]),
    restoreToCanonical: vi.fn(),
    markUnarchived: vi.fn().mockResolvedValue(undefined),
  };
}

describe("startBackgroundSweeper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects intervalMs < 1000", () => {
    const repo = makeRepo();
    expect(() =>
      startBackgroundSweeper({
        archiveRepository: repo,
        vectorIndex: { delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), upsert: vi.fn(), query: vi.fn(), ensureCollection: vi.fn() },
        logger: SILENT_LOGGER,
        intervalMs: 500,
      }),
    ).toThrow(/intervalMs must be ≥ 1000/);
  });

  it("calls findPendingQdrantCleanup on each tick", async () => {
    const repo = makeRepo();
    const handle = startBackgroundSweeper({
      archiveRepository: repo,
      vectorIndex: { delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), upsert: vi.fn(), query: vi.fn(), ensureCollection: vi.fn() },
      logger: SILENT_LOGGER,
      intervalMs: 1000,
    });

    expect(repo.findPendingQdrantCleanup).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(repo.findPendingQdrantCleanup).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(repo.findPendingQdrantCleanup).toHaveBeenCalledTimes(2);

    await handle.stop();
  });

  it("stops further ticks after stop() is called", async () => {
    const repo = makeRepo();
    const handle = startBackgroundSweeper({
      archiveRepository: repo,
      vectorIndex: { delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), upsert: vi.fn(), query: vi.fn(), ensureCollection: vi.fn() },
      logger: SILENT_LOGGER,
      intervalMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(repo.findPendingQdrantCleanup).toHaveBeenCalledTimes(1);

    await handle.stop();

    await vi.advanceTimersByTimeAsync(5000);
    expect(repo.findPendingQdrantCleanup).toHaveBeenCalledTimes(1);
  });

  it("swallows tick errors and continues looping", async () => {
    const repo = makeRepo();
    (repo.findPendingQdrantCleanup as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("transient PG failure"))
      .mockResolvedValueOnce([]);

    const handle = startBackgroundSweeper({
      archiveRepository: repo,
      vectorIndex: { delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), upsert: vi.fn(), query: vi.fn(), ensureCollection: vi.fn() },
      logger: SILENT_LOGGER,
      intervalMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(repo.findPendingQdrantCleanup).toHaveBeenCalledTimes(2);
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
  });
});
