import type { Logger } from "../logger.js";
import { bootstrapCanonicalServices } from "../mcp/canonical-services.js";
import type { CanonicalServices } from "../mcp/types.js";
import {
  loadIngestSweepEnabled,
  loadIngestSweepIntervalMs,
  startIngestSweeper,
  type IngestSweeperHandle,
  type StartIngestSweeperInput,
} from "../compact/ingest-sweeper-loop.js";
import {
  loadSweeperEnabled,
  loadSweeperIntervalMs,
  startBackgroundSweeper,
  type BackgroundSweeperHandle,
  type StartBackgroundSweeperInput,
} from "../compact/sweeper-loop.js";
import type { SweeperMetricsRecorder } from "../compact/sweeper-metrics.js";

export type BackgroundWorkerName = "compaction" | "ingest";

export type BackgroundWorkerServices = Pick<
  CanonicalServices,
  | "archiveRepository"
  | "chunkRepository"
  | "embeddings"
  | "ingestJobs"
  | "vectorIndex"
  | "close"
>;

export type BackgroundWorkersHandle = {
  startedWorkers: readonly BackgroundWorkerName[];
  stop(): Promise<void>;
};

export type StartBackgroundWorkersOptions = {
  logger: Logger;
  env?: NodeJS.ProcessEnv;
  failFast?: boolean;
  metrics?: SweeperMetricsRecorder;
  bootstrapServices?: () => Promise<BackgroundWorkerServices>;
  startCompactionSweeper?: (
    input: Readonly<StartBackgroundSweeperInput>,
  ) => BackgroundSweeperHandle;
  startIngestSweeper?: (
    input: Readonly<StartIngestSweeperInput>,
  ) => IngestSweeperHandle;
};

type StartedWorker = {
  name: BackgroundWorkerName;
  handle: BackgroundSweeperHandle | IngestSweeperHandle;
};

export async function startBackgroundWorkers(
  options: Readonly<StartBackgroundWorkersOptions>,
): Promise<BackgroundWorkersHandle> {
  assertStartBackgroundWorkersOptions(options);

  const env = options.env ?? process.env;
  const enabledWorkers = resolveEnabledWorkers(env);
  if (enabledWorkers.length === 0) {
    return createNoopWorkersHandle();
  }

  const failFast = options.failFast ?? false;
  const bootstrapServices =
    options.bootstrapServices ?? bootstrapCanonicalServices;

  let services: BackgroundWorkerServices;
  try {
    services = await bootstrapServices();
    assertBackgroundWorkerServices(services);
  } catch (err: unknown) {
    if (failFast) {
      throw err;
    }
    for (const worker of enabledWorkers) {
      logWorkerStartFailure(options.logger, worker, err);
    }
    return createNoopWorkersHandle();
  }

  const started: StartedWorker[] = [];
  const startCompaction =
    options.startCompactionSweeper ?? startBackgroundSweeper;
  const startIngest = options.startIngestSweeper ?? startIngestSweeper;

  if (enabledWorkers.includes("compaction")) {
    try {
      started.push({
        name: "compaction",
        handle: startCompaction({
          archiveRepository: services.archiveRepository,
          vectorIndex: services.vectorIndex,
          logger: options.logger,
          intervalMs: loadSweeperIntervalMs(env),
          metrics: options.metrics,
        }),
      });
    } catch (err: unknown) {
      if (failFast) {
        await stopStartedWorkers(started, services);
        throw err;
      }
      logWorkerStartFailure(options.logger, "compaction", err);
    }
  }

  if (enabledWorkers.includes("ingest")) {
    try {
      started.push({
        name: "ingest",
        handle: startIngest({
          ingestJobs: services.ingestJobs,
          chunkRepository: services.chunkRepository,
          embeddings: services.embeddings,
          vectorIndex: services.vectorIndex,
          logger: options.logger,
          intervalMs: loadIngestSweepIntervalMs(env),
          metrics: options.metrics,
        }),
      });
    } catch (err: unknown) {
      if (failFast) {
        await stopStartedWorkers(started, services);
        throw err;
      }
      logWorkerStartFailure(options.logger, "ingest", err);
    }
  }

  if (started.length === 0) {
    await services.close?.();
    return createNoopWorkersHandle();
  }

  options.logger.info(
    {
      event: "background_workers.started",
      workers: started.map((worker) => worker.name),
    },
    "background workers started",
  );

  return createWorkersHandle(started, services);
}

function assertStartBackgroundWorkersOptions(
  options: unknown,
): asserts options is StartBackgroundWorkersOptions {
  const candidate = assertObject(options, "startBackgroundWorkers options");
  const logger = assertObject(candidate.logger, "logger");
  assertFunction(logger.info, "logger.info");
  assertFunction(logger.error, "logger.error");
  assertOptionalEnv(candidate.env);
  assertOptionalBoolean(candidate.failFast, "failFast");
  assertOptionalMetrics(candidate.metrics);
  assertOptionalFunction(candidate.bootstrapServices, "bootstrapServices");
  assertOptionalFunction(
    candidate.startCompactionSweeper,
    "startCompactionSweeper",
  );
  assertOptionalFunction(candidate.startIngestSweeper, "startIngestSweeper");
}

function assertBackgroundWorkerServices(
  services: unknown,
): asserts services is BackgroundWorkerServices {
  const candidate = assertObject(services, "background worker services");
  assertObject(candidate.archiveRepository, "services.archiveRepository");
  assertObject(candidate.chunkRepository, "services.chunkRepository");
  assertObject(candidate.embeddings, "services.embeddings");
  assertObject(candidate.ingestJobs, "services.ingestJobs");
  assertObject(candidate.vectorIndex, "services.vectorIndex");
  assertOptionalFunction(candidate.close, "services.close");
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

function assertOptionalBoolean(value: unknown, fieldName: string): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean`);
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

function resolveEnabledWorkers(env: NodeJS.ProcessEnv): BackgroundWorkerName[] {
  const workers: BackgroundWorkerName[] = [];
  if (loadSweeperEnabled(env)) {
    workers.push("compaction");
  }
  if (loadIngestSweepEnabled(env)) {
    workers.push("ingest");
  }
  return workers;
}

function createNoopWorkersHandle(): BackgroundWorkersHandle {
  return {
    startedWorkers: [],
    async stop(): Promise<void> {
      return;
    },
  };
}

function createWorkersHandle(
  started: readonly StartedWorker[],
  services: BackgroundWorkerServices,
): BackgroundWorkersHandle {
  let stopPromise: Promise<void> | null = null;

  return {
    startedWorkers: started.map((worker) => worker.name),
    stop(): Promise<void> {
      if (!stopPromise) {
        stopPromise = stopStartedWorkers(started, services);
      }
      return stopPromise;
    },
  };
}

async function stopStartedWorkers(
  started: readonly StartedWorker[],
  services: BackgroundWorkerServices,
): Promise<void> {
  const results = await Promise.allSettled(
    started.map((worker) => worker.handle.stop()),
  );
  await services.close?.();

  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (rejected) {
    throw rejected.reason;
  }
}

function logWorkerStartFailure(
  logger: Logger,
  worker: BackgroundWorkerName,
  err: unknown,
): void {
  if (worker === "compaction") {
    logger.error(
      { event: "compact.sweep_start_failed", err },
      "failed to start outbox sweeper; continuing without it",
    );
    return;
  }

  logger.error(
    { event: "ingest.sweep_start_failed", err },
    "failed to start ingest sweeper; continuing without it",
  );
}
