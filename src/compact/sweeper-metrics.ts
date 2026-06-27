export type SweeperWorker = "compaction" | "ingest";

export type SweeperTickStatus = "success" | "error";

export type SweeperRowOutcome =
  | "scanned"
  | "cleaned"
  | "completed"
  | "retried"
  | "failed";

export type SweeperTickObservation = {
  worker: SweeperWorker;
  status: SweeperTickStatus;
  durationSeconds: number;
  counts?: Partial<Record<SweeperRowOutcome, number>>;
};

export type SweeperMetricsRecorder = {
  observeSweeperTick(observation: SweeperTickObservation): void;
};
