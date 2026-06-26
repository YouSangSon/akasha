import type { DependencyReport } from "../health/check-dependencies.js";

export const METRICS_CONTENT_TYPE = "text/plain; version=0.0.4";

export type HttpRequestObservation = {
  method: string | undefined;
  route: string;
  statusCode: number;
  durationSeconds: number;
};

export type MetricsRegistry = {
  observeHttpRequest(observation: HttpRequestObservation): void;
  setDependencyReport(report: DependencyReport): void;
  render(): string;
};

type HttpMetricSample = {
  method: string;
  route: string;
  status: string;
  count: number;
  durationSecondsSum: number;
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

export function createMetricsRegistry(): MetricsRegistry {
  const httpSamples = new Map<string, HttpMetricSample>();
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

    setDependencyReport(report) {
      latestDependencyReport = report;
    },

    render() {
      return renderMetrics({
        httpSamples: [...httpSamples.values()],
        dependencyReport: latestDependencyReport,
      });
    },
  };
}

export function normalizeHttpMethod(method: string | undefined): string {
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

  if (input.dependencyReport) {
    appendDependencyMetrics(lines, input.dependencyReport);
  }

  return `${lines.join("\n")}\n`;
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

function sortHttpSamples(samples: HttpMetricSample[]): HttpMetricSample[] {
  return [...samples].sort((a, b) => {
    const route = a.route.localeCompare(b.route);
    if (route !== 0) return route;
    const method = a.method.localeCompare(b.method);
    if (method !== 0) return method;
    return a.status.localeCompare(b.status);
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
