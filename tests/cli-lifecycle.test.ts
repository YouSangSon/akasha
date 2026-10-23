import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import { bootstrapCanonicalServices } from "../src/mcp/canonical-services.js";
import type { ToolRegistry } from "../src/mcp/types.js";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), end: vi.fn(), createPool: vi.fn(), migrate: vi.fn(),
  ensureCollection: vi.fn(), embedding: vi.fn(), audit: vi.fn(),
}));
vi.mock("../src/db/connection.js", async (original) => ({
  ...await original<typeof import("../src/db/connection.js")>(),
  createPgPool: mocks.createPool,
}));
vi.mock("../src/db/migrate.js", () => ({ runMigrations: mocks.migrate }));
vi.mock("../src/vector/qdrant-index.js", () => ({
  createQdrantVectorIndex: () => ({ ensureCollection: mocks.ensureCollection }),
}));
vi.mock("../src/vector/pgvector-index.js", () => ({
  createPgVectorIndex: () => ({ ensureCollection: mocks.ensureCollection }),
}));
vi.mock("../src/embedding/embedding-factory.js", () => ({
  createEmbeddingProvider: mocks.embedding,
}));
vi.mock("../src/audit/audit-log-repository.js", () => ({
  createAuditLogRepository: () => ({ record: mocks.audit }),
}));

const command = ["reindex", "--project", "cli-test", "--user", "alice", "--organization-id", "org-cli"];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/unused");
  vi.stubEnv("QDRANT_URL", "http://127.0.0.1:6333");
  vi.stubEnv("QDRANT_API_KEY", "test-only");
  vi.stubEnv("VECTOR_BACKEND", "qdrant");
  vi.stubEnv("EMBEDDING_PROVIDER", "local");
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.end.mockResolvedValue(undefined);
  mocks.createPool.mockReturnValue({ query: mocks.query, end: mocks.end, connect: vi.fn() });
  mocks.migrate.mockResolvedValue(undefined);
  mocks.ensureCollection.mockResolvedValue(undefined);
  mocks.embedding.mockReturnValue({});
  mocks.audit.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("CLI service ownership", () => {
  it.each([false, true])("drains delayed audit before closing (command fails: %s)", async (fails) => {
    const auditStarted = deferred();
    const auditFinished = deferred();
    const error = new Error("query failed");
    if (fails) mocks.query.mockRejectedValue(error);
    mocks.audit.mockImplementation(() => {
      auditStarted.resolve();
      return auditFinished.promise;
    });
    let settled = false;
    const result = runCli(command).then(
      (output) => { settled = true; return output; },
      (failure: unknown) => { settled = true; return failure; },
    );
    await auditStarted.promise;
    await new Promise<void>((resolve) => setImmediate(resolve));
    try {
      expect(settled).toBe(false);
      expect(mocks.end).not.toHaveBeenCalled();
    } finally {
      auditFinished.resolve();
    }
    const output = await result;
    if (fails) expect(output).toBe(error);
    else expect(JSON.parse(output as string)).toMatchObject({ ok: true, chunkCount: 0 });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-cli", tool: "reindex_memory", outcome: fails ? "error" : "ok",
    }));
    expect(mocks.createPool).toHaveBeenCalledTimes(1);
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });

  it("keeps audit failure best-effort and still closes", async () => {
    mocks.audit.mockRejectedValue(new Error("audit unavailable"));
    expect(JSON.parse(await runCli(command))).toMatchObject({ ok: true });
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });

  it("reports cleanup failure after a successful command", async () => {
    const error = new Error("close failed");
    mocks.end.mockRejectedValue(error);
    await expect(runCli(command)).rejects.toMatchObject({
      message: "CLI command completed, but service cleanup failed", cause: error,
    });
  });

  it("preserves command and cleanup failures", async () => {
    const commandError = new Error("query failed");
    const closeError = new Error("close failed");
    mocks.query.mockRejectedValue(commandError);
    mocks.end.mockRejectedValue(closeError);
    await expect(runCli(command)).rejects.toMatchObject({ errors: [commandError, closeError] });
  });

  it("does not take ownership of an injected registry", async () => {
    const close = vi.fn();
    const registry = { reindex_memory: vi.fn().mockResolvedValue({ ok: true }), close };
    await runCli(command, { registry: registry as unknown as ToolRegistry });
    expect(close).not.toHaveBeenCalled();
    expect(mocks.createPool).not.toHaveBeenCalled();
  });

  it("does not bootstrap for filesystem commands or unreadable remember input", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "akasha-cli-lifecycle-"));
    try {
      for (const argv of [["backup-verify"], ["restore-smoke"], ["init", "--project", "cli-test"]]) {
        await runCli(argv, { cwd });
      }
      const remember = ["remember", "--project", "cli-test", "--kind", "decision", "--content-file"];
      await expect(runCli([...remember, "missing.txt"], { cwd })).rejects.toThrow("ENOENT");
      await writeFile(path.join(cwd, "empty.txt"), "");
      await expect(runCli([...remember, "empty.txt"], { cwd })).rejects.toThrow("Content file is empty");
      expect(mocks.createPool).not.toHaveBeenCalled();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("retains the bootstrap error and closes its pool once", async () => {
    const error = new Error("collection unavailable");
    mocks.ensureCollection.mockRejectedValue(error);
    await expect(runCli(command)).rejects.toBe(error);
    expect(mocks.createPool).toHaveBeenCalledTimes(1);
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });
});

describe("canonical bootstrap cleanup", () => {
  it.each(["migration", "qdrant", "pgvector", "embedding"])("closes after %s initialization fails", async (stage) => {
    const error = new Error(`${stage} failed`);
    if (stage === "migration") mocks.migrate.mockRejectedValue(error);
    else if (stage === "embedding") mocks.embedding.mockImplementation(() => { throw error; });
    else {
      vi.stubEnv("VECTOR_BACKEND", stage);
      mocks.ensureCollection.mockRejectedValue(error);
    }
    // A secondary cleanup failure must not replace the startup cause.
    mocks.end.mockRejectedValue(new Error("cleanup failed"));
    await expect(bootstrapCanonicalServices()).rejects.toBe(error);
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });
});
