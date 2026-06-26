import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadIngestSweepEnabled,
  loadIngestSweepIntervalMs,
  startIngestSweeper,
} from "../../src/compact/ingest-sweeper-loop.js";
import type { IngestJobRepository } from "../../src/types.js";
import type { MemoryChunkRepository } from "../../src/store/canonical-indexing.js";
import type { StartIngestSweeperInput } from "../../src/compact/ingest-sweeper-loop.js";

const SILENT_LOGGER = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
} as unknown as StartIngestSweeperInput["logger"];

function makeIngestJobRepo(): IngestJobRepository {
  return {
    create: vi.fn(),
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
    markQdrantCompleted: vi.fn().mockResolvedValue(undefined),
    markQdrantPending: vi.fn().mockResolvedValue(undefined),
    markQdrantFailed: vi.fn().mockResolvedValue(undefined),
    listPendingForRetry: vi.fn().mockResolvedValue([]),
    claimPendingForRetry: vi.fn().mockResolvedValue([]),
  };
}

function makeChunkRepo(): MemoryChunkRepository {
  return {
    insertChunks: vi.fn(),
    updatePointIds: vi.fn().mockResolvedValue(undefined),
    deleteChunksForRecord: vi.fn().mockResolvedValue(undefined),
    listChunks: vi.fn().mockResolvedValue([]),
    getChunksByRecordId: vi.fn().mockResolvedValue([]),
    createContextPackRun: vi.fn(),
  };
}

describe("startIngestSweeper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects intervalMs < 1000", () => {
    expect(() =>
      startIngestSweeper({
        ingestJobs: makeIngestJobRepo(),
        chunkRepository: makeChunkRepo(),
        embeddings: { embed: vi.fn(), embedBatch: vi.fn() },
        vectorIndex: { upsert: vi.fn(), query: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), ensureCollection: vi.fn() },
        logger: SILENT_LOGGER,
        intervalMs: 500,
      }),
    ).toThrow(/intervalMs must be ≥ 1000/);
  });

  it("calls claimPendingForRetry on each tick", async () => {
    const ingestJobs = makeIngestJobRepo();
    const handle = startIngestSweeper({
      ingestJobs,
      chunkRepository: makeChunkRepo(),
      embeddings: { embed: vi.fn(), embedBatch: vi.fn() },
      vectorIndex: { upsert: vi.fn(), query: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), ensureCollection: vi.fn() },
      logger: SILENT_LOGGER,
      intervalMs: 1000,
    });

    expect(ingestJobs.claimPendingForRetry).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(ingestJobs.claimPendingForRetry).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(ingestJobs.claimPendingForRetry).toHaveBeenCalledTimes(2);

    await handle.stop();
  });

  it("stops further ticks after stop() is called", async () => {
    const ingestJobs = makeIngestJobRepo();
    const handle = startIngestSweeper({
      ingestJobs,
      chunkRepository: makeChunkRepo(),
      embeddings: { embed: vi.fn(), embedBatch: vi.fn() },
      vectorIndex: { upsert: vi.fn(), query: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), ensureCollection: vi.fn() },
      logger: SILENT_LOGGER,
      intervalMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(ingestJobs.claimPendingForRetry).toHaveBeenCalledTimes(1);

    await handle.stop();

    await vi.advanceTimersByTimeAsync(5000);
    expect(ingestJobs.claimPendingForRetry).toHaveBeenCalledTimes(1);
  });

  it("swallows tick errors and continues looping", async () => {
    const ingestJobs = makeIngestJobRepo();
    (ingestJobs.claimPendingForRetry as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("transient PG failure"))
      .mockResolvedValueOnce([]);

    const handle = startIngestSweeper({
      ingestJobs,
      chunkRepository: makeChunkRepo(),
      embeddings: { embed: vi.fn(), embedBatch: vi.fn() },
      vectorIndex: { upsert: vi.fn(), query: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn().mockResolvedValue(undefined), ensureCollection: vi.fn() },
      logger: SILENT_LOGGER,
      intervalMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(ingestJobs.claimPendingForRetry).toHaveBeenCalledTimes(2);
    await handle.stop();
  });
});

describe("loadIngestSweepEnabled", () => {
  it("returns false when env var is unset or empty", () => {
    expect(loadIngestSweepEnabled({})).toBe(false);
    expect(loadIngestSweepEnabled({ INGEST_SWEEP_ENABLED: "" })).toBe(false);
  });

  it("returns true for canonical true values", () => {
    expect(loadIngestSweepEnabled({ INGEST_SWEEP_ENABLED: "true" })).toBe(true);
    expect(loadIngestSweepEnabled({ INGEST_SWEEP_ENABLED: "1" })).toBe(true);
    expect(loadIngestSweepEnabled({ INGEST_SWEEP_ENABLED: "yes" })).toBe(true);
    expect(
      loadIngestSweepEnabled({ INGEST_SWEEP_ENABLED: "  TRUE  " }),
    ).toBe(true);
  });

  it("returns false for non-canonical values (fail-closed)", () => {
    expect(loadIngestSweepEnabled({ INGEST_SWEEP_ENABLED: "false" })).toBe(false);
    expect(loadIngestSweepEnabled({ INGEST_SWEEP_ENABLED: "0" })).toBe(false);
    expect(loadIngestSweepEnabled({ INGEST_SWEEP_ENABLED: "yep" })).toBe(false);
  });
});

describe("loadIngestSweepIntervalMs", () => {
  it("returns 30_000 default when env unset", () => {
    expect(loadIngestSweepIntervalMs({})).toBe(30_000);
  });

  it("parses integer values", () => {
    expect(
      loadIngestSweepIntervalMs({ INGEST_SWEEP_INTERVAL_MS: "60000" }),
    ).toBe(60_000);
  });

  it("rejects values < 1000 and non-numeric", () => {
    expect(() =>
      loadIngestSweepIntervalMs({ INGEST_SWEEP_INTERVAL_MS: "500" }),
    ).toThrow(/≥ 1000/);
    expect(() =>
      loadIngestSweepIntervalMs({ INGEST_SWEEP_INTERVAL_MS: "abc" }),
    ).toThrow(/finite integer/);
  });
});
