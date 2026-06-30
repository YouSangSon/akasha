import type { DependencyReport } from "../health/check-dependencies.js";
import type {
  SweeperRowOutcome,
  SweeperTickObservation,
} from "../compact/sweeper-metrics.js";
import type {
  BackgroundQueue,
  BackgroundQueueBacklogSnapshot,
  BackgroundQueueState,
} from "./background-queue-metrics.js";

export const METRICS_CONTENT_TYPE = "text/plain; version=0.0.4";

export type HttpRequestObservation = {
  method: string | undefined;
  route: string;
  statusCode: number;
  durationSeconds: number;
};

export type MetricsRegistry = {
  observeHttpRequest(observation: HttpRequestObservation): void;
  observeSweeperTick(observation: SweeperTickObservation): void;
  setDependencyReport(report: DependencyReport): void;
  render(backlog?: BackgroundQueueBacklogSnapshot): string;
};

type HttpMetricSample = {
  method: string;
  route: string;
  status: string;
  count: number;
  durationSecondsSum: number;
};

type SweeperTickSample = {
  worker: string;
  status: string;
  count: number;
  durationSecondsSum: number;
};

type SweeperRowSample = {
  worker: string;
  outcome: string;
  count: number;
};

type BackgroundQueueSample = {
  queue: BackgroundQueue;
  state: BackgroundQueueState;
  count: number;
};

const KNOWN_METHODS = new Set([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
]);

const KNOWN_SWEEPER_ROW_OUTCOMES = new Set<SweeperRowOutcome>([
  "scanned",
  "cleaned",
  "completed",
  "retried",
  "failed",
]);

const KNOWN_BACKGROUND_QUEUES = new Set<BackgroundQueue>([
  "ingest",
  "compaction",
]);

const KNOWN_BACKGROUND_QUEUE_STATES = new Set<BackgroundQueueState>([
  "pending",
  "due",
  "failed",
]);

export function createMetricsRegistry(): MetricsRegistry {
  const httpSamples = new Map<string, HttpMetricSample>();
  const sweeperTickSamples = new Map<string, SweeperTickSample>();
  const sweeperRowSamples = new Map<string, SweeperRowSample>();
  let latestDependencyReport: DependencyReport | null = null;

  return {
    observeHttpRequest(observation) {
      const method = normalizeHttpMethod(observation.method);
      const status = String(observation.statusCode);
      const key = buildHttpSampleKey(method, observation.route, status);
      const existing = httpSamples.get(key);
      const durationSeconds = Math.max(0, observation.durationSeconds);

      if (existing) {
        existing.count += 1;
        existing.durationSecondsSum += durationSeconds;
        return;
      }

      httpSamples.set(key, {
        method,
        route: observation.route,
        status,
        count: 1,
        durationSecondsSum: durationSeconds,
      });
    },

    observeSweeperTick(observation) {
      const key = buildSweeperTickSampleKey(
        observation.worker,
        observation.status,
      );
      const durationSeconds = Math.max(0, observation.durationSeconds);
      const existing = sweeperTickSamples.get(key);

      if (existing) {
        existing.count += 1;
        existing.durationSecondsSum += durationSeconds;
      } else {
        sweeperTickSamples.set(key, {
          worker: observation.worker,
          status: observation.status,
          count: 1,
          durationSecondsSum: durationSeconds,
        });
      }

      for (const [outcome, count] of Object.entries(observation.counts ?? {})) {
        observeSweeperRows(
          sweeperRowSamples,
          observation.worker,
          outcome,
          count,
        );
      }
    },

    setDependencyReport(report) {
      latestDependencyReport = report;
    },

    render(backlog) {
      return renderMetrics({
        httpSamples: [...httpSamples.values()],
        sweeperTickSamples: [...sweeperTickSamples.values()],
        sweeperRowSamples: [...sweeperRowSamples.values()],
        backgroundQueueBacklog: backlog,
        dependencyReport: latestDependencyReport,
      });
    },
  };
}

export function normalizeHttpMethod(method: string | undefined): string {
  if (method !== undefined && typeof method !== "string") {
    throw new Error("method must be a string when provided");
  }

  const upper = method?.toUpperCase() ?? "UNKNOWN";
  return KNOWN_METHODS.has(upper) ? upper : "OTHER";
}

function buildHttpSampleKey(
  method: string,
  route: string,
  status: string,
): string {
  return `${method}\u0000${route}\u0000${status}`;
}

function renderMetrics(input: {
  httpSamples: HttpMetricSample[];
  sweeperTickSamples: SweeperTickSample[];
  sweeperRowSamples: SweeperRowSample[];
  backgroundQueueBacklog?: BackgroundQueueBacklogSnapshot;
  dependencyReport: DependencyReport | null;
}): string {
  const lines = [
    "# HELP akasha_http_requests_total Total HTTP requests handled by Akasha.",
    "# TYPE akasha_http_requests_total counter",
  ];

  for (const sample of sortHttpSamples(input.httpSamples)) {
    const labels = renderLabels({
      method: sample.method,
      route: sample.route,
      status: sample.status,
    });
    lines.push(`akasha_http_requests_total${labels} ${sample.count}`);
  }

  lines.push(
    "# HELP akasha_http_request_duration_seconds HTTP request duration in seconds.",
    "# TYPE akasha_http_request_duration_seconds summary",
  );

  for (const sample of sortHttpSamples(input.httpSamples)) {
    const labels = renderLabels({
      method: sample.method,
      route: sample.route,
      status: sample.status,
    });
    lines.push(
      `akasha_http_request_duration_seconds_count${labels} ${sample.count}`,
    );
    lines.push(
      `akasha_http_request_duration_seconds_sum${labels} ${formatNumber(
        sample.durationSecondsSum,
      )}`,
    );
  }

  appendSweeperMetrics(
    lines,
    input.sweeperTickSamples,
    input.sweeperRowSamples,
  );
  appendBackgroundQueueMetrics(lines, input.backgroundQueueBacklog);

  if (input.dependencyReport) {
    appendDependencyMetrics(lines, input.dependencyReport);
  }

  return `${lines.join("\n")}\n`;
}

function buildSweeperTickSampleKey(worker: string, status: string): string {
  return `${worker}\u0000${status}`;
}

function buildSweeperRowSampleKey(worker: string, outcome: string): string {
  return `${worker}\u0000${outcome}`;
}

function observeSweeperRows(
  samples: Map<string, SweeperRowSample>,
  worker: string,
  outcome: string,
  count: number,
): void {
  if (!isKnownSweeperRowOutcome(outcome)) {
    return;
  }

  const key = buildSweeperRowSampleKey(worker, outcome);
  const sanitizedCount = Math.max(0, count);
  const existing = samples.get(key);

  if (existing) {
    existing.count += sanitizedCount;
    return;
  }

  samples.set(key, {
    worker,
    outcome,
    count: sanitizedCount,
  });
}

function isKnownSweeperRowOutcome(outcome: string): outcome is SweeperRowOutcome {
  return KNOWN_SWEEPER_ROW_OUTCOMES.has(outcome as SweeperRowOutcome);
}

function isKnownBackgroundQueue(queue: string): queue is BackgroundQueue {
  return KNOWN_BACKGROUND_QUEUES.has(queue as BackgroundQueue);
}

function isKnownBackgroundQueueState(
  state: string,
): state is BackgroundQueueState {
  return KNOWN_BACKGROUND_QUEUE_STATES.has(state as BackgroundQueueState);
}

function appendSweeperMetrics(
  lines: string[],
  tickSamples: SweeperTickSample[],
  rowSamples: SweeperRowSample[],
): void {
  lines.push(
    "# HELP akasha_sweeper_ticks_total Total background sweeper ticks.",
    "# TYPE akasha_sweeper_ticks_total counter",
  );
  for (const sample of sortSweeperTickSamples(tickSamples)) {
    const labels = renderLabels({
      worker: sample.worker,
      status: sample.status,
    });
    lines.push(`akasha_sweeper_ticks_total${labels} ${sample.count}`);
  }

  lines.push(
    "# HELP akasha_sweeper_tick_duration_seconds Background sweeper tick duration in seconds.",
    "# TYPE akasha_sweeper_tick_duration_seconds summary",
  );
  for (const sample of sortSweeperTickSamples(tickSamples)) {
    const labels = renderLabels({
      worker: sample.worker,
      status: sample.status,
    });
    lines.push(
      `akasha_sweeper_tick_duration_seconds_count${labels} ${sample.count}`,
    );
    lines.push(
      `akasha_sweeper_tick_duration_seconds_sum${labels} ${formatNumber(
        sample.durationSecondsSum,
      )}`,
    );
  }

  lines.push(
    "# HELP akasha_sweeper_rows_total Total rows observed by background sweepers by outcome.",
    "# TYPE akasha_sweeper_rows_total counter",
  );
  for (const sample of sortSweeperRowSamples(rowSamples)) {
    const labels = renderLabels({
      worker: sample.worker,
      outcome: sample.outcome,
    });
    lines.push(`akasha_sweeper_rows_total${labels} ${sample.count}`);
  }
}

function appendDependencyMetrics(
  lines: string[],
  report: DependencyReport,
): void {
  lines.push(
    "# HELP akasha_dependency_up Most recent readiness dependency status from /readyz.",
    "# TYPE akasha_dependency_up gauge",
  );
  for (const check of [...report.checks].sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const labels = renderLabels({ name: check.name });
    lines.push(`akasha_dependency_up${labels} ${check.status === "ok" ? 1 : 0}`);
  }

  lines.push(
    "# HELP akasha_dependency_check_duration_seconds Most recent readiness dependency check duration from /readyz.",
    "# TYPE akasha_dependency_check_duration_seconds gauge",
  );
  for (const check of [...report.checks].sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const labels = renderLabels({ name: check.name });
    lines.push(
      `akasha_dependency_check_duration_seconds${labels} ${formatNumber(
        check.durationMs / 1000,
      )}`,
    );
  }
}

function appendBackgroundQueueMetrics(
  lines: string[],
  snapshot: BackgroundQueueBacklogSnapshot | undefined,
): void {
  if (!snapshot) {
    return;
  }

  lines.push(
    "# HELP akasha_background_queue_collect_success Whether the most recent background queue backlog collection succeeded.",
    "# TYPE akasha_background_queue_collect_success gauge",
    `akasha_background_queue_collect_success ${snapshot.collectSuccess ? 1 : 0}`,
    "# HELP akasha_background_queue_rows Current background queue backlog rows by queue and state.",
    "# TYPE akasha_background_queue_rows gauge",
  );

  const samples = snapshot.rows.flatMap((row): BackgroundQueueSample[] => {
    if (
      !isKnownBackgroundQueue(row.queue) ||
      !isKnownBackgroundQueueState(row.state)
    ) {
      return [];
    }

    return [
      {
        queue: row.queue,
        state: row.state,
        count: sanitizeGaugeValue(row.count),
      },
    ];
  });

  for (const sample of sortBackgroundQueueSamples(samples)) {
    const labels = renderLabels({
      queue: sample.queue,
      state: sample.state,
    });
    lines.push(`akasha_background_queue_rows${labels} ${sample.count}`);
  }
}

function sortHttpSamples(samples: HttpMetricSample[]): HttpMetricSample[] {
  return [...samples].sort((a, b) => {
    const route = a.route.localeCompare(b.route);
    if (route !== 0) return route;
    const method = a.method.localeCompare(b.method);
    if (method !== 0) return method;
    return a.status.localeCompare(b.status);
  });
}

function sortSweeperTickSamples(
  samples: SweeperTickSample[],
): SweeperTickSample[] {
  return [...samples].sort((a, b) => {
    const worker = a.worker.localeCompare(b.worker);
    if (worker !== 0) return worker;
    return a.status.localeCompare(b.status);
  });
}

function sortSweeperRowSamples(
  samples: SweeperRowSample[],
): SweeperRowSample[] {
  return [...samples].sort((a, b) => {
    const worker = a.worker.localeCompare(b.worker);
    if (worker !== 0) return worker;
    return a.outcome.localeCompare(b.outcome);
  });
}

function sortBackgroundQueueSamples(
  samples: BackgroundQueueSample[],
): BackgroundQueueSample[] {
  return [...samples].sort((a, b) => {
    const queue = a.queue.localeCompare(b.queue);
    if (queue !== 0) return queue;
    return a.state.localeCompare(b.state);
  });
}

function renderLabels(labels: Record<string, string>): string {
  return `{${Object.entries(labels)
    .map(([key, value]) => `${key}="${escapeLabelValue(value)}"`)
    .join(",")}}`;
}

function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return String(Math.max(0, value));
}

function sanitizeGaugeValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}
