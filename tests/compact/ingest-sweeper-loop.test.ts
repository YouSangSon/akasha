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
const callStartIngestSweeper = (input: unknown) =>
  startIngestSweeper(input as StartIngestSweeperInput);

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

function makeVectorIndex() {
  return {
    upsert: vi.fn(),
    query: vi.fn(),
    delete: vi.fn(),
    deleteByRecordIds: vi.fn().mockResolvedValue(undefined),
    ensureCollection: vi.fn(),
  };
}

describe("startIngestSweeper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([undefined, null, "input", 12, true, []])(
    "rejects non-object direct input",
    (input) => {
      expect(() => callStartIngestSweeper(input)).toThrow(
        "startIngestSweeper input must be an object",
      );
    },
  );

  it.each<[
    (input: StartIngestSweeperInput) => unknown,
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
      "startIngestSweeper: intervalMs must be ≥ 1000 (got NaN)",
    ],
    [
      (input) => ({ ...input, intervalMs: 1000.5 }),
      "startIngestSweeper: intervalMs must be ≥ 1000 (got 1000.5)",
    ],
  ])("rejects invalid direct input field", (mutateInput, message) => {
    const ingestJobs = makeIngestJobRepo();

    expect(() =>
      callStartIngestSweeper(
        mutateInput({
          ingestJobs,
          chunkRepository: makeChunkRepo(),
          embeddings: { embed: vi.fn(), embedBatch: vi.fn() },
          vectorIndex: makeVectorIndex(),
          logger: SILENT_LOGGER,
        }),
      ),
    ).toThrow(message);

    expect(ingestJobs.claimPendingForRetry).not.toHaveBeenCalled();
  });

  it("rejects intervalMs < 1000", () => {
    expect(() =>
      startIngestSweeper({
        ingestJobs: makeIngestJobRepo(),
        chunkRepository: makeChunkRepo(),
        embeddings: { embed: vi.fn(), embedBatch: vi.fn() },
        vectorIndex: makeVectorIndex(),
        logger: SILENT_LOGGER,
        intervalMs: 500,
      }),
    ).toThrow(/intervalMs must be ≥ 1000/);
  });

  it("calls claimPendingForRetry on each tick", async () => {
    const ingestJobs = makeIngestJobRepo();
    const metrics = { observeSweeperTick: vi.fn() };
    const handle = startIngestSweeper({
      ingestJobs,
      chunkRepository: makeChunkRepo(),
      embeddings: { embed: vi.fn(), embedBatch: vi.fn() },
      vectorIndex: makeVectorIndex(),
      logger: SILENT_LOGGER,
      metrics,
      intervalMs: 1000,
    });

    expect(ingestJobs.claimPendingForRetry).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(ingestJobs.claimPendingForRetry).toHaveBeenCalledTimes(1);
    expect(metrics.observeSweeperTick).toHaveBeenCalledWith(
      expect.objectContaining({
        worker: "ingest",
        status: "success",
        counts: {
          scanned: 0,
          completed: 0,
          retried: 0,
          failed: 0,
        },
        durationSeconds: expect.any(Number),
      }),
    );

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
      vectorIndex: makeVectorIndex(),
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
    const metrics = { observeSweeperTick: vi.fn() };
    (ingestJobs.claimPendingForRetry as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("transient PG failure"))
      .mockResolvedValueOnce([]);

    const handle = startIngestSweeper({
      ingestJobs,
      chunkRepository: makeChunkRepo(),
      embeddings: { embed: vi.fn(), embedBatch: vi.fn() },
      vectorIndex: makeVectorIndex(),
      logger: SILENT_LOGGER,
      metrics,
      intervalMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(ingestJobs.claimPendingForRetry).toHaveBeenCalledTimes(2);
    expect(metrics.observeSweeperTick).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        worker: "ingest",
        status: "error",
        durationSeconds: expect.any(Number),
      }),
    );
    expect(metrics.observeSweeperTick).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        worker: "ingest",
        status: "success",
      }),
    );
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
    expect(() =>
      loadIngestSweepIntervalMs({ INGEST_SWEEP_INTERVAL_MS: "1000abc" }),
    ).toThrow(/finite integer/);
    expect(() =>
      loadIngestSweepIntervalMs({ INGEST_SWEEP_INTERVAL_MS: "1000.5" }),
    ).toThrow(/finite integer/);
    expect(() =>
      loadIngestSweepIntervalMs({ INGEST_SWEEP_INTERVAL_MS: "1e3" }),
    ).toThrow(/finite integer/);
    expect(() =>
      loadIngestSweepIntervalMs({ INGEST_SWEEP_INTERVAL_MS: "0x3e8" }),
    ).toThrow(/finite integer/);
    expect(() =>
      loadIngestSweepIntervalMs({ INGEST_SWEEP_INTERVAL_MS: "0b1111101000" }),
    ).toThrow(/finite integer/);
  });
});
