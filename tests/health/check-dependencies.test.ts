import { describe, expect, it, vi } from "vitest";
import {
  buildOpenAiProbe,
  buildPostgresProbe,
  buildQdrantProbe,
  checkDependencies,
} from "../../src/health/check-dependencies.js";

describe("checkDependencies", () => {
  it("returns ok when every probe resolves", async () => {
    const report = await checkDependencies({
      postgres: vi.fn().mockResolvedValue(undefined),
      qdrant: vi.fn().mockResolvedValue(undefined),
      openai: vi.fn().mockResolvedValue(undefined),
    });

    expect(report.status).toBe("ok");
    expect(report.checks.map((c) => c.name).sort()).toEqual([
      "openai",
      "postgres",
      "qdrant",
    ]);
    expect(report.checks.every((c) => c.status === "ok")).toBe(true);
  });

  it("returns fail when any probe rejects, with message preserved", async () => {
    const report = await checkDependencies({
      postgres: vi.fn().mockResolvedValue(undefined),
      qdrant: vi.fn().mockRejectedValue(new Error("connection refused")),
    });

    expect(report.status).toBe("fail");
    const qdrantCheck = report.checks.find((c) => c.name === "qdrant");
    expect(qdrantCheck?.status).toBe("fail");
    expect(qdrantCheck?.message).toContain("connection refused");
    expect(report.checks.find((c) => c.name === "postgres")?.status).toBe("ok");
  });

  it("skips probes that are undefined", async () => {
    const report = await checkDependencies({
      postgres: vi.fn().mockResolvedValue(undefined),
    });

    expect(report.checks.map((c) => c.name)).toEqual(["postgres"]);
  });
});

describe("buildPostgresProbe", () => {
  it("calls SELECT 1 and resolves on success", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const probe = buildPostgresProbe(pool);
    await expect(probe()).resolves.toBeUndefined();
    expect(pool.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("rejects when the pool throws", async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error("pg down")) };
    const probe = buildPostgresProbe(pool);
    await expect(probe()).rejects.toThrow(/pg down/);
  });
});

describe("buildQdrantProbe", () => {
  it("hits /healthz with api-key header and resolves on 200", async () => {
    const fakeFetch = vi.fn(async () =>
      new Response("ok", { status: 200 }),
    ) as unknown as typeof fetch;
    const probe = buildQdrantProbe({
      url: "http://qdrant.local:6333",
      apiKey: "key-aaa",
      fetch: fakeFetch,
    });
    await expect(probe()).resolves.toBeUndefined();
    expect(fakeFetch).toHaveBeenCalledWith(
      "http://qdrant.local:6333/healthz",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "api-key": "key-aaa" }),
      }),
    );
  });

  it("rejects on non-2xx response", async () => {
    const fakeFetch = vi.fn(async () => new Response("nope", { status: 503 }));
    const probe = buildQdrantProbe({
      url: "http://qdrant.local:6333",
      apiKey: "key-aaa",
      fetch: fakeFetch as unknown as typeof fetch,
    });
    await expect(probe()).rejects.toThrow(/503/);
  });
});

describe("buildOpenAiProbe", () => {
  it("hits /v1/models and resolves on 200", async () => {
    const fakeFetch = vi.fn(async () =>
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    const probe = buildOpenAiProbe({
      apiKey: "sk-test-aaa",
      fetch: fakeFetch as unknown as typeof fetch,
    });
    await expect(probe()).resolves.toBeUndefined();
    expect(fakeFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          authorization: "Bearer sk-test-aaa",
        }),
      }),
    );
  });

  it("rejects on 401 (auth failure)", async () => {
    const fakeFetch = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    const probe = buildOpenAiProbe({
      apiKey: "sk-bad",
      fetch: fakeFetch as unknown as typeof fetch,
    });
    await expect(probe()).rejects.toThrow(/401/);
  });
});
