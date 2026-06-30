import { pathToFileURL } from "node:url";

import { rootLogger, type Logger } from "../logger.js";
import { createMetricsRegistry, type MetricsRegistry } from "./metrics.js";
import {
  startBackgroundWorkers,
  type BackgroundWorkersHandle,
  type StartBackgroundWorkersOptions,
} from "./background-workers.js";

export type RunWorkerProcessOptions = {
  logger?: Logger;
  env?: NodeJS.ProcessEnv;
  metrics?: MetricsRegistry;
  startWorkers?: (
    options: Readonly<StartBackgroundWorkersOptions>,
  ) => Promise<BackgroundWorkersHandle>;
};

export async function runWorkerProcess(
  options: Readonly<RunWorkerProcessOptions> = {},
): Promise<BackgroundWorkersHandle> {
  assertRunWorkerProcessOptions(options);

  const logger = options.logger ?? rootLogger;
  const metrics = options.metrics ?? createMetricsRegistry();
  const startWorkers = options.startWorkers ?? startBackgroundWorkers;

  const handle = await startWorkers({
    logger,
    env: options.env,
    metrics,
    failFast: true,
  });
  assertBackgroundWorkersHandle(handle);

  if (handle.startedWorkers.length === 0) {
    logger.warn(
      { event: "background_worker.no_workers_enabled" },
      "no background workers enabled",
    );
  } else {
    logger.info(
      {
        event: "background_worker.started",
        workers: handle.startedWorkers,
      },
      "background worker started",
    );
  }

  return handle;
}

function assertRunWorkerProcessOptions(
  options: unknown,
): asserts options is RunWorkerProcessOptions {
  const candidate = assertObject(options, "runWorkerProcess options");
  assertOptionalLogger(candidate.logger);
  assertOptionalEnv(candidate.env);
  assertOptionalMetrics(candidate.metrics);
  assertOptionalFunction(candidate.startWorkers, "startWorkers");
}

function assertBackgroundWorkersHandle(
  handle: unknown,
): asserts handle is BackgroundWorkersHandle {
  const candidate = assertObject(handle, "background workers handle");
  if (!Array.isArray(candidate.startedWorkers)) {
    throw new Error("background workers handle.startedWorkers must be an array");
  }
  for (const [index, worker] of candidate.startedWorkers.entries()) {
    if (worker !== "compaction" && worker !== "ingest") {
      throw new Error(
        `background workers handle.startedWorkers[${index}] must be "compaction" or "ingest"`,
      );
    }
  }
  assertFunction(candidate.stop, "background workers handle.stop");
}

function assertOptionalLogger(value: unknown): void {
  if (value === undefined) {
    return;
  }
  const logger = assertObject(value, "logger");
  assertFunction(logger.info, "logger.info");
  assertFunction(logger.warn, "logger.warn");
  assertFunction(logger.error, "logger.error");
}

function assertOptionalEnv(value: unknown): void {
  if (value === undefined) {
    return;
  }
  const env = assertObject(value, "env");
  for (const key of [
    "COMPACTION_SWEEP_ENABLED",
    "COMPACTION_SWEEP_INTERVAL_MS",
    "INGEST_SWEEP_ENABLED",
    "INGEST_SWEEP_INTERVAL_MS",
  ]) {
    const envValue = env[key];
    if (envValue !== undefined && typeof envValue !== "string") {
      throw new Error(`env.${key} must be a string`);
    }
  }
}

function assertOptionalMetrics(value: unknown): void {
  if (value === undefined) {
    return;
  }
  const metrics = assertObject(value, "metrics");
  assertFunction(metrics.observeSweeperTick, "metrics.observeSweeperTick");
}

function assertObject(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertFunction(value: unknown, fieldName: string): void {
  if (typeof value !== "function") {
    throw new Error(`${fieldName} must be a function`);
  }
}

function assertOptionalFunction(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }
  assertFunction(value, fieldName);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}

async function main(): Promise<void> {
  const logger = rootLogger;
  let workers: BackgroundWorkersHandle | null = null;
  let keepAlive: NodeJS.Timeout | null = null;
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    logger.info(
      { event: "background_worker.shutdown", signal },
      "stopping background worker",
    );
    if (keepAlive) {
      clearInterval(keepAlive);
      keepAlive = null;
    }

    try {
      await workers?.stop();
      process.exit(0);
    } catch (err: unknown) {
      logger.error(
        { event: "background_worker.shutdown_failed", err },
        "failed to stop background worker cleanly",
      );
      process.exit(1);
    }
  };

  process.once("SIGINT", (signal) => {
    void shutdown(signal);
  });
  process.once("SIGTERM", (signal) => {
    void shutdown(signal);
  });

  try {
    workers = await runWorkerProcess({ logger });
    if (shuttingDown) {
      await workers.stop();
      return;
    }
    keepAlive = setInterval(() => undefined, 60_000);
  } catch (err: unknown) {
    if (!shuttingDown) {
      logger.error(
        { event: "background_worker.start_failed", err },
        "failed to start background worker",
      );
      process.exit(1);
    }
  }
}
