import { once } from "node:events";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServiceConfig } from "../../src/config.js";
import type { BackgroundWorkersHandle } from "../../src/app/background-workers.js";
import type { Logger } from "../../src/logger.js";
import type { ToolRegistry } from "../../src/mcp/types.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  vi.doUnmock("../../src/app/background-workers.js");
  vi.doUnmock("../../src/db/connection.js");
  vi.resetModules();
});

describe("startOperatorServer background worker startup", () => {
  it("logs worker startup failures and still serves HTTP", async () => {
    const startBackgroundWorkers = vi
      .fn()
      .mockRejectedValue(new Error("worker boom"));
    vi.doMock("../../src/app/background-workers.js", () => ({
      startBackgroundWorkers,
    }));

    const { startOperatorServer } = await import("../../src/app/server.js");
    const logger = buildLogger();
    const server = startOperatorServer({
      config: buildTestConfig(),
      registry: {} as ToolRegistry,
      logger,
      bearerTokens: [],
      dependencyProbes: {},
      backgroundQueueMetrics: null,
      oauthProtectedResource: null,
      oauthTokenVerifier: null,
    });
    servers.push(server);

    if (!server.address()) {
      await once(server, "listening");
    }

    await vi.waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: "background_workers.start_failed" }),
        "failed to start background workers; continuing without them",
      ),
    );

    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
    expect(response.status).toBe(200);
    expect(startBackgroundWorkers).toHaveBeenCalledOnce();
  });

  it("awaits in-flight worker startup and cleanup during operator shutdown", async () => {
    let resolveWorkerStartup!: (handle: BackgroundWorkersHandle) => void;
    let resolveWorkerStop!: () => void;
    let resolveProbeEnd!: () => void;
    const stopWorkers = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveWorkerStop = resolve;
        }),
    );
    const probeEnd = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveProbeEnd = resolve;
        }),
    );
    const startBackgroundWorkers = vi.fn(
      () =>
        new Promise<BackgroundWorkersHandle>((resolve) => {
          resolveWorkerStartup = resolve;
        }),
    );
    const createPgPool = vi.fn(() => ({
      end: probeEnd,
    }));

    vi.doMock("../../src/app/background-workers.js", () => ({
      startBackgroundWorkers,
    }));
    vi.doMock("../../src/db/connection.js", () => ({
      createPgPool,
    }));

    const { closeOperatorServer, startOperatorServer } = await import(
      "../../src/app/server.js"
    );
    const server = startOperatorServer({
      config: buildTestConfig(),
      registry: {} as ToolRegistry,
      logger: buildLogger(),
      bearerTokens: [],
      dependencyProbes: {},
      backgroundQueueMetrics: null,
      oauthProtectedResource: null,
      oauthTokenVerifier: null,
    });
    servers.push(server);

    if (!server.address()) {
      await once(server, "listening");
    }
    expect(startBackgroundWorkers).toHaveBeenCalledOnce();

    let shutdownResolved = false;
    const shutdown = closeOperatorServer(server).then(() => {
      shutdownResolved = true;
    });
    await flushTasks();

    expect(probeEnd).toHaveBeenCalledOnce();
    expect(stopWorkers).not.toHaveBeenCalled();
    expect(shutdownResolved).toBe(false);

    resolveWorkerStartup({
      startedWorkers: ["compaction"],
      stop: stopWorkers,
    });
    await vi.waitFor(() => expect(stopWorkers).toHaveBeenCalledOnce());
    expect(shutdownResolved).toBe(false);

    resolveWorkerStop();
    resolveProbeEnd();
    await shutdown;
    expect(shutdownResolved).toBe(true);

    await closeOperatorServer(server);
    expect(probeEnd).toHaveBeenCalledOnce();
    expect(stopWorkers).toHaveBeenCalledOnce();
    servers.pop();
  });

  it("cleans probe pool without starting workers when HTTP bind fails", async () => {
    const blocker = http.createServer();
    await new Promise<void>((resolve) =>
      blocker.listen(0, "127.0.0.1", () => resolve()),
    );
    servers.push(blocker);
    const blockerAddress = blocker.address() as AddressInfo;

    const probeEnd = vi.fn().mockResolvedValue(undefined);
    const createPgPool = vi.fn(() => ({
      end: probeEnd,
    }));
    const startBackgroundWorkers = vi.fn();

    vi.doMock("../../src/app/background-workers.js", () => ({
      startBackgroundWorkers,
    }));
    vi.doMock("../../src/db/connection.js", () => ({
      createPgPool,
    }));

    const { closeOperatorServer, startOperatorServer } = await import(
      "../../src/app/server.js"
    );
    const logger = buildLogger();
    const server = startOperatorServer({
      config: {
        ...buildTestConfig(),
        port: blockerAddress.port,
      },
      registry: {} as ToolRegistry,
      logger,
      bearerTokens: [],
      dependencyProbes: {},
      backgroundQueueMetrics: null,
      oauthProtectedResource: null,
      oauthTokenVerifier: null,
    });

    await once(server, "error");
    await vi.waitFor(() => expect(probeEnd).toHaveBeenCalledOnce());

    expect(startBackgroundWorkers).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "http.listen_failed" }),
      "HTTP server failed; cleaning up resources",
    );

    await closeOperatorServer(server);
    expect(probeEnd).toHaveBeenCalledOnce();
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
    servers.splice(servers.indexOf(blocker), 1);
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

function buildLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => buildLogger()),
  } as unknown as Logger;
}

function flushTasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
