import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";

import { createOperatorServer } from "../../src/app/server.js";
import { METRICS_CONTENT_TYPE } from "../../src/app/metrics.js";
import type { DependencyProbes } from "../../src/health/check-dependencies.js";
import type { ToolRegistry } from "../../src/mcp/types.js";

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
} = {}): Promise<ServerHandle> {
  const server = createOperatorServer({
    registry: buildRegistry(),
    bearerTokens: input.bearerTokens ?? [],
    dependencyProbes: input.dependencyProbes,
    oauthProtectedResource: null,
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
});
