import { describe, expect, it, vi } from "vitest";
import { runWorkerProcess } from "../../src/app/worker.js";
import type { Logger } from "../../src/logger.js";
import type { RunWorkerProcessOptions } from "../../src/app/worker.js";

describe("runWorkerProcess", () => {
  it.each([null, "input", 12, true, []])(
    "rejects non-object direct options",
    async (options) => {
      await expect(
        runWorkerProcess(options as RunWorkerProcessOptions),
      ).rejects.toThrow("runWorkerProcess options must be an object");
    },
  );

  it.each<[
    (options: RunWorkerProcessOptions) => unknown,
    string,
  ]>([
    [(options) => ({ ...options, logger: null }), "logger must be an object"],
    [
      (options) => ({ ...options, logger: { ...options.logger, warn: null } }),
      "logger.warn must be a function",
    ],
    [(options) => ({ ...options, env: null }), "env must be an object"],
    [
      (options) => ({
        ...options,
        env: { INGEST_SWEEP_ENABLED: 1 },
      }),
      "env.INGEST_SWEEP_ENABLED must be a string",
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
      (options) => ({ ...options, startWorkers: "start" }),
      "startWorkers must be a function",
    ],
  ])("rejects invalid direct option field", async (mutateOptions, message) => {
    const startWorkers = vi.fn();

    await expect(
      runWorkerProcess(
        mutateOptions({
          logger: buildLogger(),
          startWorkers,
        }) as RunWorkerProcessOptions,
      ),
    ).rejects.toThrow(message);

    expect(startWorkers).not.toHaveBeenCalled();
  });

  it.each([
    [null, "background workers handle must be an object"],
    [
      { startedWorkers: null },
      "background workers handle.startedWorkers must be an array",
    ],
    [
      { startedWorkers: ["other"], stop: vi.fn() },
      'background workers handle.startedWorkers[0] must be "compaction" or "ingest"',
    ],
    [
      { startedWorkers: [], stop: null },
      "background workers handle.stop must be a function",
    ],
  ])("rejects malformed injected worker handles", async (handle, message) => {
    await expect(
      runWorkerProcess({
        logger: buildLogger(),
        startWorkers: vi.fn().mockResolvedValue(handle),
      }),
    ).rejects.toThrow(message);
  });

  it("starts background workers in fail-fast mode", async () => {
    const startWorkers = vi.fn().mockRejectedValue(new Error("startup failed"));

    await expect(
      runWorkerProcess({
        logger: buildLogger(),
        startWorkers,
      }),
    ).rejects.toThrow("startup failed");

    expect(startWorkers).toHaveBeenCalledWith(
      expect.objectContaining({ failFast: true }),
    );
  });

  it("logs when no background workers are enabled", async () => {
    const logger = buildLogger();
    const handle = {
      startedWorkers: [],
      stop: vi.fn().mockResolvedValue(undefined),
    };

    const result = await runWorkerProcess({
      logger,
      startWorkers: vi.fn().mockResolvedValue(handle),
    });

    expect(result).toBe(handle);
    expect(logger.warn).toHaveBeenCalledWith(
      { event: "background_worker.no_workers_enabled" },
      "no background workers enabled",
    );
  });
});

function buildLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => buildLogger()),
  } as unknown as Logger;
}
