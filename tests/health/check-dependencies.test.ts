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

  it.each([
    {
      input: null,
      message: "dependency probes must be an object",
    },
    {
      input: { postgres: "connected" },
      message: "dependencyProbes.postgres must be a function",
    },
    {
      input: {
        postgres: vi.fn().mockResolvedValue(undefined),
        redis: vi.fn().mockResolvedValue(undefined),
      },
      message: 'dependency probe "redis" is not supported',
    },
  ])("rejects malformed direct probe inputs", async ({ input, message }) => {
    await expect(checkDependencies(input as never)).rejects.toThrow(message);
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

  it.each([
    {
      input: null,
      message: "postgres probe pool must be an object",
    },
    {
      input: { query: "SELECT 1" },
      message: "postgres probe pool.query must be a function",
    },
  ])("rejects malformed direct pool inputs", ({ input, message }) => {
    expect(() => buildPostgresProbe(input as never)).toThrow(message);
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

  it.each([
    {
      input: null,
      message: "qdrant probe input must be an object",
    },
    {
      input: { url: " \n\t ", apiKey: "key-aaa" },
      message: "qdrant probe input.url must be a non-empty string",
    },
    {
      input: { url: "http://qdrant.local:6333", apiKey: "" },
      message: "qdrant probe input.apiKey must be a non-empty string",
    },
    {
      input: {
        url: "http://qdrant.local:6333",
        apiKey: "key-aaa",
        fetch: {},
      },
      message: "qdrant probe input.fetch must be a function",
    },
    {
      input: {
        url: "http://qdrant.local:6333",
        apiKey: "key-aaa",
        timeoutMs: Number.NaN,
      },
      message: "qdrant probe input.timeoutMs must be a positive finite number",
    },
  ])("rejects malformed direct inputs", ({ input, message }) => {
    expect(() => buildQdrantProbe(input as never)).toThrow(message);
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

  it.each([
    {
      input: null,
      message: "openai probe input must be an object",
    },
    {
      input: { apiKey: " \n\t " },
      message: "openai probe input.apiKey must be a non-empty string",
    },
    {
      input: { apiKey: "sk-test-aaa", fetch: "fetch" },
      message: "openai probe input.fetch must be a function",
    },
    {
      input: { apiKey: "sk-test-aaa", timeoutMs: 0 },
      message: "openai probe input.timeoutMs must be a positive finite number",
    },
  ])("rejects malformed direct inputs", ({ input, message }) => {
    expect(() => buildOpenAiProbe(input as never)).toThrow(message);
  });
});
