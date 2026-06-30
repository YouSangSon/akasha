// Background loop wrapper for runIngestSweep. Process-lifetime worker that
// calls the one-shot sweep on a fixed interval. Caller (startOperatorServer)
// decides cadence via INGEST_SWEEP_INTERVAL_MS env, defaults to 30 s.
//
// Stop handle: returned `{ stop }` cancels the next tick and awaits any
// in-flight sweep so process shutdown doesn't leave a dangling Qdrant call.
//
// Errors during sweep are logged and swallowed — the loop must not die on
// transient infra failures. Per-job max-attempts in runIngestSweep prevents
// infinite retries on persistently-failing records.

import {
  runIngestSweep,
  type RunIngestSweepInput,
  type IngestSweepResult,
} from "./ingest-sweeper.js";
import type { SweeperMetricsRecorder } from "./sweeper-metrics.js";

export type StartIngestSweeperInput = RunIngestSweepInput & {
  intervalMs?: number;
  metrics?: SweeperMetricsRecorder;
};

export type IngestSweeperHandle = {
  stop(): Promise<void>;
};

const DEFAULT_INTERVAL_MS = 30_000;

export function startIngestSweeper(
  input: Readonly<StartIngestSweeperInput>,
): IngestSweeperHandle {
  assertStartIngestSweeperInput(input);
  const intervalMs = resolveIntervalMs(input.intervalMs, "startIngestSweeper");

  let stopped = false;
  let inFlight: Promise<IngestSweepResult> | null = null;
  let timer: NodeJS.Timeout | null = null;

  const tick = async () => {
    if (stopped) return;
    const start = process.hrtime.bigint();
    inFlight = runIngestSweep(input);
    try {
      const result = await inFlight;
      input.metrics?.observeSweeperTick({
        worker: "ingest",
        status: "success",
        durationSeconds: elapsedSeconds(start),
        counts: {
          scanned: result.scanned,
          completed: result.completed,
          retried: result.retried,
          failed: result.failed,
        },
      });
      if (result.scanned > 0) {
        input.logger.info(
          {
            event: "ingest.sweep_tick",
            scanned: result.scanned,
            completed: result.completed,
            retried: result.retried,
            failed: result.failed,
          },
          "ingest sweep tick completed",
        );
      }
    } catch (err: unknown) {
      input.logger.error(
        {
          event: "ingest.sweep_tick_failed",
          err: err instanceof Error ? err.message : String(err),
        },
        "ingest sweep tick threw; loop continues",
      );
      input.metrics?.observeSweeperTick({
        worker: "ingest",
        status: "error",
        durationSeconds: elapsedSeconds(start),
      });
    } finally {
      inFlight = null;
    }
  };

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(async () => {
      await tick();
      schedule();
    }, intervalMs);
    // Don't keep the event loop alive solely for this timer — the process
    // should exit cleanly on SIGINT/SIGTERM.
    timer.unref?.();
  };

  schedule();
  input.logger.info(
    { event: "ingest.sweep_loop_started", intervalMs },
    "ingest sweep loop started",
  );

  return {
    async stop(): Promise<void> {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (inFlight) {
        try {
          await inFlight;
        } catch {
          // Already logged in tick; swallow during shutdown.
        }
      }
      input.logger.info(
        { event: "ingest.sweep_loop_stopped" },
        "ingest sweep loop stopped",
      );
    },
  };
}

function elapsedSeconds(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1_000_000_000;
}

function assertStartIngestSweeperInput(
  input: unknown,
): asserts input is StartIngestSweeperInput {
  const candidate = assertObject(input, "startIngestSweeper input");
  const logger = assertObject(candidate.logger, "logger");
  assertFunction(logger.info, "logger.info");
  assertFunction(logger.error, "logger.error");
  assertOptionalMetrics(candidate.metrics);
  assertOptionalIntervalMs(candidate.intervalMs, "startIngestSweeper");
}

function resolveIntervalMs(
  value: number | undefined,
  context: string,
): number {
  if (value === undefined) {
    return DEFAULT_INTERVAL_MS;
  }
  assertOptionalIntervalMs(value, context);
  return value;
}

function assertOptionalIntervalMs(value: unknown, context: string): void {
  if (value === undefined) {
    return;
  }
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1000
  ) {
    throw new Error(
      `${context}: intervalMs must be ≥ 1000 (got ${String(value)})`,
    );
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

// Helper for ops/tests: manually fire one sweep without starting a loop.
// Re-exports runIngestSweep so callers can import a single module.
export { runIngestSweep };

// Resolves the env-driven enable flag. Used by startOperatorServer to
// decide whether to spin up the loop. Default: disabled so existing deploys
// don't get a surprise worker.
export function loadIngestSweepEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env.INGEST_SWEEP_ENABLED;
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function loadIngestSweepIntervalMs(env: NodeJS.ProcessEnv): number {
  const raw = env.INGEST_SWEEP_INTERVAL_MS;
  if (!raw) return DEFAULT_INTERVAL_MS;
  const normalized = raw.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(
      `INGEST_SWEEP_INTERVAL_MS must be a finite integer ≥ 1000 (got ${raw})`,
    );
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 1000) {
    throw new Error(
      `INGEST_SWEEP_INTERVAL_MS must be a finite integer ≥ 1000 (got ${raw})`,
    );
  }
  return parsed;
}
