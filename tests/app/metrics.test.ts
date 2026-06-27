import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";

import { createOperatorServer } from "../../src/app/server.js";
import {
  createMetricsRegistry,
  METRICS_CONTENT_TYPE,
} from "../../src/app/metrics.js";
import type { BackgroundQueueMetricsCollector } from "../../src/app/background-queue-metrics.js";
import type { DependencyProbes } from "../../src/health/check-dependencies.js";
import type { ToolRegistry } from "../../src/mcp/types.js";
import { goalRunRegistryStubs } from "../fixtures/goal-run-stubs.js";

type ServerHandle = {
  baseUrl: string;
  close: () => Promise<void>;
};

const handles: ServerHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

function buildRegistry(): ToolRegistry {
  return {
    ...goalRunRegistryStubs(),
    add_memory: vi.fn().mockResolvedValue({
      ok: true,
      memoryId: "project:p:1",
      summary: "added",
    }),
    search_memory: vi.fn().mockResolvedValue({
      ok: true,
      projectKey: "p",
      query: "q",
      results: [],
    }),
    build_context_pack: vi.fn().mockResolvedValue({
      ok: true,
      projectKey: "p",
      packMarkdown: "# Context Pack",
      selectedMemoryIds: [],
      selectionRationale: [],
      sections: {
        project_summary: [],
        recent_decisions: [],
        constraints: [],
        open_questions: [],
        relevant_notes: [],
      },
    }),
    reindex_memory: vi.fn().mockResolvedValue({
      ok: true,
      projectKey: "p",
      scopes: [],
      chunkCount: 0,
    }),
    compact_memory: vi.fn().mockResolvedValue({
      ok: true,
      projectKey: "p",
      dryRun: true,
      archivedIds: [],
      mergedIds: [],
      duplicateGroups: [],
      decayCandidates: [],
      promotionCandidates: [],
      summary: "noop",
    }),
    list_memory: vi.fn().mockResolvedValue({
      ok: true,
      scopeType: "project",
      scopeId: "p",
      memories: [],
    }),
    inspect_memory_graph: vi.fn().mockResolvedValue({
      ok: true,
      scopeType: "project",
      scopeId: "p",
      entities: [],
      relationships: [],
    }),
    update_memory: vi.fn().mockResolvedValue({
      ok: true,
      updated: true,
      memory: undefined,
    }),
    delete_memory: vi.fn().mockResolvedValue({
      ok: true,
      archived: true,
      qdrantPointsDeleted: 0,
      qdrantPointsPending: 0,
    }),
    tag_memory: vi.fn().mockResolvedValue({
      ok: true,
      updated: true,
      memory: undefined,
    }),
    list_audit_log: vi.fn().mockResolvedValue({
      ok: true,
      organizationId: "default",
      entries: [],
    }),
    unarchive_memory: vi.fn().mockResolvedValue({
      ok: true,
      outcomes: [],
      restoredCount: 0,
      skippedCount: 0,
      failedCount: 0,
    }),
  };
}

async function startTestServer(input: {
  bearerTokens?: readonly string[];
  dependencyProbes?: DependencyProbes;
  backgroundQueueMetrics?: BackgroundQueueMetricsCollector | null;
} = {}): Promise<ServerHandle> {
  const server = createOperatorServer({
    registry: buildRegistry(),
    bearerTokens: input.bearerTokens ?? [],
    dependencyProbes: input.dependencyProbes,
    oauthProtectedResource: null,
    backgroundQueueMetrics: input.backgroundQueueMetrics,
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address() as AddressInfo;
  const handle = {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve) => server.close(() => resolve())),
  };
  handles.push(handle);
  return handle;
}

async function scrapeMetrics(handle: ServerHandle): Promise<string> {
  const res = await fetch(`${handle.baseUrl}/metrics`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe(METRICS_CONTENT_TYPE);
  return res.text();
}

function expectMetricLine(text: string, prefix: string): void {
  const line = text.split("\n").find((entry) => entry.startsWith(prefix));
  expect(line).toBeDefined();
  const value = Number(line?.split(" ").at(-1));
  expect(Number.isFinite(value)).toBe(true);
}

describe("GET /metrics", () => {
  it("is unauthenticated even when bearer tokens are configured", async () => {
    const handle = await startTestServer({ bearerTokens: ["configured-token"] });

    const res = await fetch(`${handle.baseUrl}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(METRICS_CONTENT_TYPE);
    const text = await res.text();
    expect(text).toContain("akasha_http_requests_total");
    expect(text).not.toContain("unauthorized");
  });

  it("emits request counters and durations with stable route labels", async () => {
    const handle = await startTestServer({ bearerTokens: ["metrics-token"] });

    const health = await fetch(`${handle.baseUrl}/healthz`);
    expect(health.status).toBe(200);
    const admin = await fetch(`${handle.baseUrl}/admin/memory`);
    expect(admin.status).toBe(200);
    const addMemory = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer metrics-token",
      },
      body: JSON.stringify({
        projectKey: "p",
        kind: "decision",
        content: "request metrics are stable",
      }),
    });
    expect(addMemory.status).toBe(200);

    const text = await scrapeMetrics(handle);
    expect(text).toContain(
      'akasha_http_requests_total{method="GET",route="/healthz",status="200"} 1',
    );
    expect(text).toContain(
      'akasha_http_requests_total{method="GET",route="/admin/memory",status="200"} 1',
    );
    expect(text).toContain(
      'akasha_http_requests_total{method="POST",route="/v1/memory",status="200"} 1',
    );
    expect(text).toContain(
      'akasha_http_request_duration_seconds_count{method="POST",route="/v1/memory",status="200"} 1',
    );
    expectMetricLine(
      text,
      'akasha_http_request_duration_seconds_sum{method="POST",route="/v1/memory",status="200"} ',
    );
    expect(text).not.toContain("metrics-token");
  });

  it("does not include raw query strings in metrics output", async () => {
    const secret = "do-not-export-this-query";
    const handle = await startTestServer({ bearerTokens: ["query-token"] });

    const health = await fetch(`${handle.baseUrl}/healthz?search=${secret}`);
    expect(health.status).toBe(401);
    const unknown = await fetch(`${handle.baseUrl}/v1/unknown?search=${secret}`, {
      method: "POST",
      headers: { authorization: "Bearer query-token" },
    });
    expect(unknown.status).toBe(404);

    const text = await scrapeMetrics(handle);
    expect(text).toContain(
      'akasha_http_requests_total{method="GET",route="/healthz",status="401"} 1',
    );
    expect(text).toContain(
      'akasha_http_requests_total{method="POST",route="unknown",status="404"} 1',
    );
    expect(text).not.toContain(secret);
    expect(text).not.toContain("search=");
  });

  it("emits dependency gauges only from the most recent /readyz probe", async () => {
    const postgres = vi.fn().mockResolvedValue(undefined);
    const qdrant = vi
      .fn()
      .mockRejectedValue(new Error("qdrant outage with private detail"));
    const handle = await startTestServer({
      dependencyProbes: { postgres, qdrant },
    });

    const beforeReady = await scrapeMetrics(handle);
    expect(beforeReady).not.toContain("akasha_dependency_up");
    expect(postgres).not.toHaveBeenCalled();
    expect(qdrant).not.toHaveBeenCalled();

    const ready = await fetch(`${handle.baseUrl}/readyz`);
    expect(ready.status).toBe(503);
    expect(postgres).toHaveBeenCalledOnce();
    expect(qdrant).toHaveBeenCalledOnce();

    const afterReady = await scrapeMetrics(handle);
    expect(postgres).toHaveBeenCalledOnce();
    expect(qdrant).toHaveBeenCalledOnce();
    expect(afterReady).toContain('akasha_dependency_up{name="postgres"} 1');
    expect(afterReady).toContain('akasha_dependency_up{name="qdrant"} 0');
    expectMetricLine(
      afterReady,
      'akasha_dependency_check_duration_seconds{name="postgres"} ',
    );
    expectMetricLine(
      afterReady,
      'akasha_dependency_check_duration_seconds{name="qdrant"} ',
    );
    expect(afterReady).not.toContain("private detail");
  });

  it("includes live background queue backlog gauges from the collector", async () => {
    const collector: BackgroundQueueMetricsCollector = {
      collect: vi.fn().mockResolvedValue({
        collectSuccess: true,
        rows: [
          { queue: "ingest", state: "pending", count: 8 },
          { queue: "ingest", state: "due", count: 3 },
          { queue: "ingest", state: "failed", count: 1 },
          { queue: "compaction", state: "pending", count: 5 },
          { queue: "compaction", state: "due", count: 2 },
          { queue: "compaction", state: "failed", count: 0 },
        ],
      }),
    };
    const handle = await startTestServer({ backgroundQueueMetrics: collector });

    const text = await scrapeMetrics(handle);

    expect(collector.collect).toHaveBeenCalledOnce();
    expect(text).toContain("akasha_background_queue_collect_success 1");
    expect(text).toContain(
      'akasha_background_queue_rows{queue="ingest",state="due"} 3',
    );
    expect(text).toContain(
      'akasha_background_queue_rows{queue="compaction",state="pending"} 5',
    );
    expect(text).not.toContain("org-");
    expect(text).not.toContain("qdrant exploded");
  });

  it("still returns metrics with collect_success=0 when the queue collector fails", async () => {
    const collector: BackgroundQueueMetricsCollector = {
      collect: vi
        .fn()
        .mockRejectedValue(new Error("qdrant exploded for org-secret row 42")),
    };
    const handle = await startTestServer({ backgroundQueueMetrics: collector });

    const response = await fetch(`${handle.baseUrl}/metrics`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(METRICS_CONTENT_TYPE);
    expect(collector.collect).toHaveBeenCalledOnce();
    expect(text).toContain("akasha_background_queue_collect_success 0");
    expect(text).toContain("akasha_http_requests_total");
    expect(text).not.toContain("org-secret");
    expect(text).not.toContain("row 42");
    expect(text).not.toContain("qdrant exploded");
  });
});

describe("createMetricsRegistry sweeper metrics", () => {
  it("emits low-cardinality sweeper tick and row counters", () => {
    const metrics = createMetricsRegistry();

    metrics.observeSweeperTick({
      worker: "compaction",
      status: "success",
      durationSeconds: 0.25,
      counts: {
        scanned: 3,
        cleaned: 2,
        retried: 1,
        failed: 0,
      },
    });
    metrics.observeSweeperTick({
      worker: "compaction",
      status: "error",
      durationSeconds: 0.5,
    });
    metrics.observeSweeperTick({
      worker: "ingest",
      status: "success",
      durationSeconds: 0.75,
      counts: {
        scanned: 4,
        completed: 3,
        retried: 0,
        failed: 1,
        ignoredCustomOutcome: 99,
      } as never,
    });

    const text = metrics.render();

    expect(text).toContain(
      'akasha_sweeper_ticks_total{worker="compaction",status="success"} 1',
    );
    expect(text).toContain(
      'akasha_sweeper_ticks_total{worker="compaction",status="error"} 1',
    );
    expect(text).toContain(
      'akasha_sweeper_ticks_total{worker="ingest",status="success"} 1',
    );
    expect(text).toContain(
      'akasha_sweeper_tick_duration_seconds_count{worker="compaction",status="success"} 1',
    );
    expect(text).toContain(
      'akasha_sweeper_tick_duration_seconds_sum{worker="compaction",status="error"} 0.5',
    );
    expect(text).toContain(
      'akasha_sweeper_rows_total{worker="compaction",outcome="cleaned"} 2',
    );
    expect(text).toContain(
      'akasha_sweeper_rows_total{worker="ingest",outcome="failed"} 1',
    );
    expect(text).not.toContain("ignoredCustomOutcome");
  });
});

describe("createMetricsRegistry background queue metrics", () => {
  it("renders sanitized backlog gauges and collect success", () => {
    const metrics = createMetricsRegistry();

    const text = metrics.render({
      collectSuccess: true,
      rows: [
        { queue: "ingest", state: "pending", count: 7 },
        { queue: "ingest", state: "due", count: 3 },
        { queue: "compaction", state: "failed", count: 2 },
        {
          queue: "org-secret" as never,
          state: "failed",
          count: 99,
        },
        {
          queue: "ingest",
          state: "row-123" as never,
          count: 88,
        },
      ],
    });

    expect(text).toContain("akasha_background_queue_collect_success 1");
    expect(text).toContain(
      'akasha_background_queue_rows{queue="ingest",state="pending"} 7',
    );
    expect(text).toContain(
      'akasha_background_queue_rows{queue="ingest",state="due"} 3',
    );
    expect(text).toContain(
      'akasha_background_queue_rows{queue="compaction",state="failed"} 2',
    );
    expect(text).not.toContain("org-secret");
    expect(text).not.toContain("row-123");
  });

  it("renders collect failure without backlog row labels or error details", () => {
    const metrics = createMetricsRegistry();

    const text = metrics.render({
      collectSuccess: false,
      rows: [],
    });

    expect(text).toContain("akasha_background_queue_collect_success 0");
    expect(text).not.toContain("organization");
    expect(text).not.toContain("private qdrant error");
  });
});
