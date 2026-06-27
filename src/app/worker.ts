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
  const logger = options.logger ?? rootLogger;
  const metrics = options.metrics ?? createMetricsRegistry();
  const startWorkers = options.startWorkers ?? startBackgroundWorkers;

  const handle = await startWorkers({
    logger,
    env: options.env,
    metrics,
    failFast: true,
  });

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
