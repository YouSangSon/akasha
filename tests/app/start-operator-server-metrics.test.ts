import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServiceConfig } from "../../src/config.js";
import type { Logger } from "../../src/logger.js";
import type { ToolRegistry } from "../../src/mcp/types.js";

const servers: Server[] = [];
const originalEnv = {
  COMPACTION_SWEEP_ENABLED: process.env.COMPACTION_SWEEP_ENABLED,
  INGEST_SWEEP_ENABLED: process.env.INGEST_SWEEP_ENABLED,
};

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  restoreEnv("COMPACTION_SWEEP_ENABLED", originalEnv.COMPACTION_SWEEP_ENABLED);
  restoreEnv("INGEST_SWEEP_ENABLED", originalEnv.INGEST_SWEEP_ENABLED);
  vi.doUnmock("../../src/app/background-queue-metrics.js");
  vi.doUnmock("../../src/app/background-workers.js");
  vi.resetModules();
});

describe("startOperatorServer metrics wiring", () => {
  it("shares one metrics registry between background sweepers and /metrics", async () => {
    const stopSweeper = vi.fn().mockResolvedValue(undefined);
    const startBackgroundWorkers = vi.fn((input: {
      metrics?: {
        observeSweeperTick(observation: {
          worker: "compaction";
          status: "success";
          durationSeconds: number;
          counts: { scanned: number; cleaned: number };
        }): void;
      };
    }) => {
      input.metrics?.observeSweeperTick({
        worker: "compaction",
        status: "success",
        durationSeconds: 0.125,
        counts: { scanned: 1, cleaned: 1 },
      });
      return Promise.resolve({
        startedWorkers: ["compaction"] as const,
        stop: stopSweeper,
      });
    });
    const collectBackgroundQueues = vi.fn().mockResolvedValue({
      collectSuccess: true,
      rows: [
        { queue: "ingest", state: "due", count: 3 },
        { queue: "compaction", state: "pending", count: 4 },
      ],
    });
    const createBackgroundQueueMetricsCollector = vi.fn(() => ({
      collect: collectBackgroundQueues,
    }));

    vi.doMock("../../src/app/background-queue-metrics.js", () => ({
      createBackgroundQueueMetricsCollector,
    }));
    vi.doMock("../../src/app/background-workers.js", () => ({
      startBackgroundWorkers,
    }));

    process.env.COMPACTION_SWEEP_ENABLED = "true";
    process.env.INGEST_SWEEP_ENABLED = "false";

    const { startOperatorServer } = await import("../../src/app/server.js");
    const server = startOperatorServer({
      config: buildTestConfig(),
      registry: {} as ToolRegistry,
      logger: buildTestLogger(),
      bearerTokens: [],
      dependencyProbes: {},
      oauthProtectedResource: null,
      oauthTokenVerifier: null,
    });
    servers.push(server);

    if (!server.address()) {
      await once(server, "listening");
    }
    await vi.waitFor(() => expect(startBackgroundWorkers).toHaveBeenCalledOnce());

    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/metrics`);
    expect(response.status).toBe(200);
    const text = await response.text();

    expect(text).toContain(
      'akasha_sweeper_ticks_total{worker="compaction",status="success"} 1',
    );
    expect(text).toContain(
      'akasha_sweeper_rows_total{worker="compaction",outcome="cleaned"} 1',
    );
    expect(createBackgroundQueueMetricsCollector).toHaveBeenCalledOnce();
    expect(collectBackgroundQueues).toHaveBeenCalledOnce();
    expect(text).toContain("akasha_background_queue_collect_success 1");
    expect(text).toContain(
      'akasha_background_queue_rows{queue="ingest",state="due"} 3',
    );
    expect(text).toContain(
      'akasha_background_queue_rows{queue="compaction",state="pending"} 4',
    );

    await new Promise<void>((resolve) => server.close(() => resolve()));
    servers.pop();
    await vi.waitFor(() => expect(stopSweeper).toHaveBeenCalledOnce());
  });
});

function buildTestConfig(): ServiceConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    databaseUrl: "postgres://memory:memory@127.0.0.1:5432/memory_os",
    vectorBackend: "pgvector",
    qdrant: {
      url: "",
      apiKey: "",
      collectionName: "memory_chunks_v1",
    },
    openai: {
      apiKey: "",
    },
    embedding: {
      provider: "local",
      model: "local-deterministic-v1",
      dimensions: 384,
      version: "v1",
      chunkTargetTokens: 800,
      chunkOverlapTokens: 120,
    },
    backups: {
      directory: "/tmp/akasha-test-backups",
    },
  };
}

function buildTestLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => buildTestLogger()),
  } as unknown as Logger;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
