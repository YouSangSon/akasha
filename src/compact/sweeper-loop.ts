// Background loop wrapper for runOutboxSweep. Process-lifetime worker that
// calls the one-shot sweep on a fixed interval. Caller (startOperatorServer)
// decides cadence via COMPACTION_SWEEP_INTERVAL_MS env, defaults to 30s.
//
// Stop handle: returned `{ stop }` cancels the next tick and awaits any
// in-flight sweep so process shutdown doesn't leave a dangling Qdrant call.
//
// Errors during sweep are logged and swallowed — the loop must not die on
// transient infra failures (Qdrant 503, PG hiccup). Per-row max-attempts in
// runOutboxSweep prevents infinite retries on persistently-failing rows.

import {
  runOutboxSweep,
  type RunOutboxSweepInput,
  type SweepResult,
} from "./outbox-sweeper.js";

export type StartBackgroundSweeperInput = RunOutboxSweepInput & {
  intervalMs?: number;
};

export type BackgroundSweeperHandle = {
  stop(): Promise<void>;
};

const DEFAULT_INTERVAL_MS = 30_000;

export function startBackgroundSweeper(
  input: Readonly<StartBackgroundSweeperInput>,
): BackgroundSweeperHandle {
  const intervalMs = input.intervalMs ?? DEFAULT_INTERVAL_MS;
  if (intervalMs < 1000) {
    throw new Error(
      `startBackgroundSweeper: intervalMs must be ≥ 1000 (got ${intervalMs})`,
    );
  }

  let stopped = false;
  let inFlight: Promise<SweepResult> | null = null;
  let timer: NodeJS.Timeout | null = null;

  const tick = async () => {
    if (stopped) return;
    inFlight = runOutboxSweep(input);
    try {
      const result = await inFlight;
      if (result.scanned > 0) {
        input.logger.info(
          {
            event: "compact.sweep_tick",
            scanned: result.scanned,
            cleaned: result.cleaned,
            retried: result.retried,
            failed: result.failed,
          },
          "outbox sweep tick completed",
        );
      }
    } catch (err: unknown) {
      input.logger.error(
        {
          event: "compact.sweep_tick_failed",
          err: err instanceof Error ? err.message : String(err),
        },
        "outbox sweep tick threw; loop continues",
      );
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
    { event: "compact.sweep_loop_started", intervalMs },
    "outbox sweep loop started",
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
        { event: "compact.sweep_loop_stopped" },
        "outbox sweep loop stopped",
      );
    },
  };
}

// Helper for ops/tests: manually fire one sweep without starting a loop.
// Re-exports runOutboxSweep so callers can import a single module.
export { runOutboxSweep };

// Resolves the env-driven enable flag. Used by startOperatorServer to
// decide whether to spin up the loop. Default: disabled (P19 ships the
// machinery; ops opts in per deploy).
export function loadSweeperEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env.COMPACTION_SWEEP_ENABLED;
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function loadSweeperIntervalMs(env: NodeJS.ProcessEnv): number {
  const raw = env.COMPACTION_SWEEP_INTERVAL_MS;
  if (!raw) return DEFAULT_INTERVAL_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1000) {
    throw new Error(
      `COMPACTION_SWEEP_INTERVAL_MS must be a finite integer ≥ 1000 (got ${raw})`,
    );
  }
  return parsed;
}
