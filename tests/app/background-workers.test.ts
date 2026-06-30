import { describe, expect, it, vi } from "vitest";
import {
  startBackgroundWorkers,
  type BackgroundWorkerServices,
  type StartBackgroundWorkersOptions,
} from "../../src/app/background-workers.js";
import type { Logger } from "../../src/logger.js";

type StartCompactionSweeper = NonNullable<
  StartBackgroundWorkersOptions["startCompactionSweeper"]
>;
type StartIngestSweeper = NonNullable<
  StartBackgroundWorkersOptions["startIngestSweeper"]
>;
const callStartBackgroundWorkers = (input: unknown) =>
  startBackgroundWorkers(input as StartBackgroundWorkersOptions);

describe("startBackgroundWorkers", () => {
  it.each([undefined, null, "input", 12, true, []])(
    "rejects non-object direct options",
    async (input) => {
      await expect(callStartBackgroundWorkers(input)).rejects.toThrow(
        "startBackgroundWorkers options must be an object",
      );
    },
  );

  it.each<[
    (options: StartBackgroundWorkersOptions) => unknown,
    string,
  ]>([
    [(options) => ({ ...options, logger: null }), "logger must be an object"],
    [
      (options) => ({
        ...options,
        logger: { ...options.logger, error: null },
      }),
      "logger.error must be a function",
    ],
    [(options) => ({ ...options, env: null }), "env must be an object"],
    [
      (options) => ({
        ...options,
        env: { COMPACTION_SWEEP_ENABLED: 1 },
      }),
      "env.COMPACTION_SWEEP_ENABLED must be a string",
    ],
    [
      (options) => ({ ...options, failFast: "true" }),
      "failFast must be a boolean",
    ],
    [(options) => ({ ...options, metrics: null }), "metrics must be an object"],
    [
      (options) => ({
        ...options,
        metrics: { observeSweeperTick: null },
      }),
      "metrics.observeSweeperTick must be a function",
    ],
    [
      (options) => ({ ...options, bootstrapServices: "bootstrap" }),
      "bootstrapServices must be a function",
    ],
    [
      (options) => ({ ...options, startCompactionSweeper: null }),
      "startCompactionSweeper must be a function",
    ],
    [
      (options) => ({ ...options, startIngestSweeper: null }),
      "startIngestSweeper must be a function",
    ],
  ])("rejects invalid direct option field", async (mutateOptions, message) => {
    const bootstrapServices = vi.fn().mockResolvedValue(buildServices());

    await expect(
      callStartBackgroundWorkers(
        mutateOptions({
          logger: buildLogger(),
          env: {},
          bootstrapServices,
        }),
      ),
    ).rejects.toThrow(message);

    expect(bootstrapServices).not.toHaveBeenCalled();
  });

  it("rejects malformed bootstrap services in fail-fast mode", async () => {
    await expect(
      startBackgroundWorkers({
        logger: buildLogger(),
        env: enabledEnv(),
        failFast: true,
        bootstrapServices: vi.fn().mockResolvedValue(null),
      }),
    ).rejects.toThrow("background worker services must be an object");
  });

  it("logs malformed bootstrap services and returns a noop handle by default", async () => {
    const logger = buildLogger();
    const startCompactionSweeper = vi.fn<StartCompactionSweeper>();
    const startIngestSweeper = vi.fn<StartIngestSweeper>();

    const handle = await startBackgroundWorkers({
      logger,
      env: enabledEnv(),
      bootstrapServices: vi.fn().mockResolvedValue(null),
      startCompactionSweeper,
      startIngestSweeper,
    });

    expect(handle.startedWorkers).toEqual([]);
    expect(startCompactionSweeper).not.toHaveBeenCalled();
    expect(startIngestSweeper).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it("shares one canonical services bootstrap across both enabled loops", async () => {
    const logger = buildLogger();
    const services = buildServices();
    const bootstrapServices = vi.fn().mockResolvedValue(services);
    const stopCompaction = vi.fn().mockResolvedValue(undefined);
    const stopIngest = vi.fn().mockResolvedValue(undefined);
    const startCompactionSweeper = vi.fn<StartCompactionSweeper>(() => ({
      stop: stopCompaction,
    }));
    const startIngestSweeper = vi.fn<StartIngestSweeper>(() => ({
      stop: stopIngest,
    }));
    const metrics = { observeSweeperTick: vi.fn() };

    const handle = await startBackgroundWorkers({
      logger,
      env: enabledEnv(),
      metrics,
      bootstrapServices,
      startCompactionSweeper,
      startIngestSweeper,
    });

    expect(bootstrapServices).toHaveBeenCalledOnce();
    expect(startCompactionSweeper).toHaveBeenCalledOnce();
    expect(startIngestSweeper).toHaveBeenCalledOnce();
    expect(startCompactionSweeper.mock.calls[0]?.[0]).toMatchObject({
      intervalMs: 1000,
      logger,
      metrics,
    });
    expect(startCompactionSweeper.mock.calls[0]?.[0].archiveRepository).toBe(
      services.archiveRepository,
    );
    expect(startCompactionSweeper.mock.calls[0]?.[0].vectorIndex).toBe(
      services.vectorIndex,
    );
    expect(startIngestSweeper.mock.calls[0]?.[0]).toMatchObject({
      intervalMs: 1500,
      logger,
      metrics,
    });
    expect(startIngestSweeper.mock.calls[0]?.[0].ingestJobs).toBe(
      services.ingestJobs,
    );
    expect(startIngestSweeper.mock.calls[0]?.[0].chunkRepository).toBe(
      services.chunkRepository,
    );
    expect(startIngestSweeper.mock.calls[0]?.[0].embeddings).toBe(
      services.embeddings,
    );
    expect(startIngestSweeper.mock.calls[0]?.[0].vectorIndex).toBe(
      services.vectorIndex,
    );
    expect(handle.startedWorkers).toEqual(["compaction", "ingest"]);

    await handle.stop();
  });

  it("stops both loops and closes canonical services once", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const services = buildServices(close);
    const stopCompaction = vi.fn().mockResolvedValue(undefined);
    const stopIngest = vi.fn().mockResolvedValue(undefined);
    const handle = await startBackgroundWorkers({
      logger: buildLogger(),
      env: enabledEnv(),
      bootstrapServices: vi.fn().mockResolvedValue(services),
      startCompactionSweeper: vi.fn<StartCompactionSweeper>(() => ({
        stop: stopCompaction,
      })),
      startIngestSweeper: vi.fn<StartIngestSweeper>(() => ({
        stop: stopIngest,
      })),
    });

    await handle.stop();
    await handle.stop();

    expect(stopCompaction).toHaveBeenCalledOnce();
    expect(stopIngest).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects startup failures in fail-fast mode", async () => {
    await expect(
      startBackgroundWorkers({
        logger: buildLogger(),
        env: enabledEnv(),
        failFast: true,
        bootstrapServices: vi.fn().mockRejectedValue(new Error("pg down")),
        startCompactionSweeper: vi.fn(),
        startIngestSweeper: vi.fn(),
      }),
    ).rejects.toThrow("pg down");
  });
});

function enabledEnv(): NodeJS.ProcessEnv {
  return {
    COMPACTION_SWEEP_ENABLED: "true",
    COMPACTION_SWEEP_INTERVAL_MS: "1000",
    INGEST_SWEEP_ENABLED: "true",
    INGEST_SWEEP_INTERVAL_MS: "1500",
  };
}

function buildServices(
  close: () => Promise<void> = vi.fn().mockResolvedValue(undefined),
): BackgroundWorkerServices {
  return {
    archiveRepository:
      {} as BackgroundWorkerServices["archiveRepository"],
    chunkRepository:
      {} as BackgroundWorkerServices["chunkRepository"],
    embeddings: {} as BackgroundWorkerServices["embeddings"],
    ingestJobs: {} as BackgroundWorkerServices["ingestJobs"],
    vectorIndex: {} as BackgroundWorkerServices["vectorIndex"],
    close,
  };
}

function buildLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => buildLogger()),
  } as unknown as Logger;
}
