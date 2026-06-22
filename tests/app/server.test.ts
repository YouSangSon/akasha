import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import {
  assertSafeAuthConfig,
  createOperatorServer,
  isLoopbackHost,
  selectDependencyProbes,
} from "../../src/app/server.js";
import type { ToolRegistry } from "../../src/mcp/types.js";
import type { PgPool } from "../../src/db/connection.js";
import type { DependencyProbes } from "../../src/health/check-dependencies.js";

type ServerHandle = {
  baseUrl: string;
  close: () => Promise<void>;
};

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
      promotionCandidates: [],
      summary: "noop",
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

async function startTestServer(
  registry: ToolRegistry,
  bearerTokens: ReadonlyArray<string | { token: string; organizationId?: string }>,
): Promise<ServerHandle> {
  const server = createOperatorServer({ registry, bearerTokens });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("createOperatorServer", () => {
  let handle: ServerHandle;
  let registry: ToolRegistry;
  const tokens = ["token-aaa", "token-bbb"];

  beforeEach(async () => {
    registry = buildRegistry();
    handle = await startTestServer(registry, tokens);
  });

  afterEach(async () => {
    await handle.close();
  });

  it("GET /healthz returns 200 with envelope without bearer", async () => {
    const res = await fetch(`${handle.baseUrl}/healthz`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: unknown };
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ ok: true });
  });

  it("rejects POST /v1/memory without Authorization header", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectKey: "p",
        kind: "decision",
        content: "x",
      }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("unauthorized");
    expect(registry.add_memory).not.toHaveBeenCalled();
  });

  it("rejects POST /v1/memory with wrong bearer", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer wrong-token",
      },
      body: JSON.stringify({
        projectKey: "p",
        kind: "decision",
        content: "x",
      }),
    });
    expect(res.status).toBe(401);
    expect(registry.add_memory).not.toHaveBeenCalled();
  });

  it("accepts POST /v1/memory with valid bearer and routes through registry", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        projectKey: "p",
        kind: "decision",
        content: "first decision",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: unknown };
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      ok: true,
      memoryId: "project:p:1",
    });
    expect(registry.add_memory).toHaveBeenCalledWith({
      projectKey: "p",
      kind: "decision",
      content: "first decision",
    });
  });

  it("accepts the second token in MEMORY_API_TOKENS (rotation support)", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[1]}`,
      },
      body: JSON.stringify({ projectKey: "p", query: "anything" }),
    });
    expect(res.status).toBe(200);
    expect(registry.search_memory).toHaveBeenCalledOnce();
  });

  it("returns 400 on invalid JSON body", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: "{ this is not json",
    });
    expect(res.status).toBe(400);
    expect(registry.add_memory).not.toHaveBeenCalled();
  });

  it("returns 400 when body is JSON but not an object", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify(["not", "an", "object"]),
    });
    expect(res.status).toBe(400);
    expect(registry.add_memory).not.toHaveBeenCalled();
  });

  it("returns 404 on unknown route", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/unknown`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokens[0]}` },
    });
    expect(res.status).toBe(404);
  });

  it("returns 500 with a static message when the tool throws (no internal leak)", async () => {
    (
      registry.add_memory as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("repository down"));

    const res = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        projectKey: "p",
        kind: "decision",
        content: "x",
      }),
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("internal server error");
    expect(body.error.message).not.toContain("repository down");
  });

  it("returns 429 when the tool throws CompactionRateLimitError", async () => {
    const { CompactionRateLimitError } = await import(
      "../../src/compact/apply-compaction.js"
    );
    (
      registry.compact_memory as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new CompactionRateLimitError(90_000));

    const res = await fetch(`${handle.baseUrl}/v1/memory/compact`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({ projectKey: "p" }),
    });
    expect(res.status).toBe(429);
    const body = (await res.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.message).not.toContain("repository");
    expect(res.headers.get("retry-after")).toBe("90");
  });

  it("routes /v1/memory/context-pack to build_context_pack", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory/context-pack`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({ projectKey: "p", task: "do thing" }),
    });
    expect(res.status).toBe(200);
    expect(registry.build_context_pack).toHaveBeenCalledWith({
      projectKey: "p",
      task: "do thing",
    });
  });

  it("rejects POST /v1/memory/compact when dryRun is not a strict boolean", async () => {
    const stringRes = await fetch(`${handle.baseUrl}/v1/memory/compact`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({ projectKey: "p", dryRun: "false" }),
    });
    expect(stringRes.status).toBe(400);
    const stringBody = (await stringRes.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(stringBody.success).toBe(false);
    expect(stringBody.error.message).toContain("dryRun");
    expect(registry.compact_memory).not.toHaveBeenCalled();

    const numberRes = await fetch(`${handle.baseUrl}/v1/memory/compact`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({ projectKey: "p", dryRun: 0 }),
    });
    expect(numberRes.status).toBe(400);
    expect(registry.compact_memory).not.toHaveBeenCalled();
  });

  it("accepts POST /v1/memory/compact when dryRun is omitted (defaults to dry-run)", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory/compact`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({ projectKey: "p" }),
    });
    expect(res.status).toBe(200);
    expect(registry.compact_memory).toHaveBeenCalledOnce();
  });

  it("routes /v1/memory/reindex and /v1/memory/compact", async () => {
    const reindex = await fetch(`${handle.baseUrl}/v1/memory/reindex`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({ projectKey: "p" }),
    });
    expect(reindex.status).toBe(200);
    expect(registry.reindex_memory).toHaveBeenCalledOnce();

    const compact = await fetch(`${handle.baseUrl}/v1/memory/compact`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({ projectKey: "p" }),
    });
    expect(compact.status).toBe(200);
    expect(registry.compact_memory).toHaveBeenCalledOnce();
  });
});

describe("createOperatorServer (token-org binding)", () => {
  let handle: ServerHandle;
  let registry: ToolRegistry;
  const tokens = [
    { token: "dev-token", organizationId: "dev-team" },
    { token: "fin-token", organizationId: "finance-team" },
    { token: "free-token" }, // legacy, no binding
  ];

  beforeEach(async () => {
    registry = buildRegistry();
    handle = await startTestServer(registry, tokens);
  });

  afterEach(async () => {
    await handle.close();
  });

  it("auto-injects the bound organizationId from the token", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer dev-token",
      },
      body: JSON.stringify({
        projectKey: "p",
        kind: "decision",
        content: "x",
      }),
    });
    expect(res.status).toBe(200);
    expect(registry.add_memory).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "dev-team" }),
    );
  });

  it("rejects 403 when the bound token's org disagrees with body.organizationId", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer dev-token",
      },
      body: JSON.stringify({
        projectKey: "p",
        kind: "decision",
        content: "x",
        organizationId: "finance-team",
      }),
    });
    expect(res.status).toBe(403);
    expect(registry.add_memory).not.toHaveBeenCalled();
  });

  it("rejects 403 when the bound token's org disagrees with x-organization-id header", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer fin-token",
        "x-organization-id": "dev-team",
      },
      body: JSON.stringify({
        projectKey: "p",
        kind: "decision",
        content: "x",
      }),
    });
    expect(res.status).toBe(403);
    expect(registry.add_memory).not.toHaveBeenCalled();
  });

  it("uses x-organization-id header when token has no binding (legacy token)", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer free-token",
        "x-organization-id": "ops-team",
      },
      body: JSON.stringify({
        projectKey: "p",
        kind: "decision",
        content: "x",
      }),
    });
    expect(res.status).toBe(200);
    expect(registry.add_memory).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "ops-team" }),
    );
  });

  it("prefers x-organization-id header over body.organizationId when no binding", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer free-token",
        "x-organization-id": "header-org",
      },
      body: JSON.stringify({
        projectKey: "p",
        kind: "decision",
        content: "x",
        organizationId: "body-org",
      }),
    });
    expect(res.status).toBe(200);
    expect(registry.add_memory).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "header-org" }),
    );
  });
});

describe("isLoopbackHost", () => {
  it("recognizes IPv4 / IPv6 / hostname loopback variants", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("::ffff:127.0.0.1")).toBe(true);
  });

  it("rejects wildcard, public, and private non-loopback hosts", () => {
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("10.0.0.1")).toBe(false);
    expect(isLoopbackHost("192.168.1.1")).toBe(false);
    expect(isLoopbackHost("example.com")).toBe(false);
    expect(isLoopbackHost("")).toBe(false);
  });
});

describe("assertSafeAuthConfig", () => {
  it("permits non-loopback when tokens are configured", () => {
    expect(() =>
      assertSafeAuthConfig({ tokenCount: 1, host: "0.0.0.0" }),
    ).not.toThrow();
  });

  it("permits loopback even when tokens are absent (local dev)", () => {
    expect(() =>
      assertSafeAuthConfig({ tokenCount: 0, host: "127.0.0.1" }),
    ).not.toThrow();
    expect(() =>
      assertSafeAuthConfig({ tokenCount: 0, host: "localhost" }),
    ).not.toThrow();
  });

  it("throws when binding non-loopback with no tokens (production fail-closed)", () => {
    expect(() =>
      assertSafeAuthConfig({ tokenCount: 0, host: "0.0.0.0" }),
    ).toThrow(/MEMORY_API_TOKENS/);
    expect(() =>
      assertSafeAuthConfig({ tokenCount: 0, host: "memory.internal" }),
    ).toThrow(/non-loopback/);
  });
});

describe("createOperatorServer (auth disabled)", () => {
  let handle: ServerHandle;
  let registry: ToolRegistry;

  beforeEach(async () => {
    registry = buildRegistry();
    handle = await startTestServer(registry, []);
  });

  afterEach(async () => {
    await handle.close();
  });

  it("permits POST /v1/memory without bearer when no tokens configured", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectKey: "p",
        kind: "decision",
        content: "no auth required here",
      }),
    });
    expect(res.status).toBe(200);
    expect(registry.add_memory).toHaveBeenCalledOnce();
  });
});

describe("createOperatorServer (/readyz with injected probes)", () => {
  async function startWithProbes(probes: DependencyProbes | undefined): Promise<ServerHandle> {
    const server = createOperatorServer({
      registry: buildRegistry(),
      bearerTokens: [],
      dependencyProbes: probes,
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    );
    const address = server.address() as AddressInfo;
    return {
      baseUrl: `http://127.0.0.1:${address.port}`,
      close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
  }

  it("returns 200 when all injected probes pass", async () => {
    const handle = await startWithProbes({
      postgres: vi.fn().mockResolvedValue(undefined),
      qdrant: vi.fn().mockResolvedValue(undefined),
    });
    try {
      const res = await fetch(`${handle.baseUrl}/readyz`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; data: { status: string; checks: unknown[] } };
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("ok");
    } finally {
      await handle.close();
    }
  });

  it("returns 503 when any injected probe fails", async () => {
    const handle = await startWithProbes({
      postgres: vi.fn().mockResolvedValue(undefined),
      qdrant: vi.fn().mockRejectedValue(new Error("qdrant unreachable")),
    });
    try {
      const res = await fetch(`${handle.baseUrl}/readyz`);
      expect(res.status).toBe(503);
      const body = (await res.json()) as { success: boolean; data: { status: string } };
      expect(body.success).toBe(false);
      expect(body.data.status).toBe("fail");
    } finally {
      await handle.close();
    }
  });

  it("returns 200 with empty checks and message when no probes configured", async () => {
    const handle = await startWithProbes(undefined);
    try {
      const res = await fetch(`${handle.baseUrl}/readyz`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; data: { message: string; checks: unknown[] } };
      expect(body.success).toBe(true);
      expect(body.data.message).toBe("no probes configured");
    } finally {
      await handle.close();
    }
  });
});

describe("selectDependencyProbes", () => {
  function fakePool(): PgPool {
    return {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    };
  }

  function baseConfig(
    provider: "openai" | "transformers" | "local",
    vectorBackend: "qdrant" | "pgvector" = "qdrant",
  ) {
    return {
      host: "127.0.0.1",
      port: 8787,
      databaseUrl: "postgres://localhost/test",
      vectorBackend,
      qdrant: { url: "http://qdrant.local:6333", apiKey: "key-aaa", collectionName: "col" },
      openai: { apiKey: provider === "openai" ? "sk-test" : "" },
      embedding: {
        provider,
        model: "test-model",
        dimensions: 384,
        version: "v1" as const,
        chunkTargetTokens: 800 as const,
        chunkOverlapTokens: 120 as const,
      },
      backups: { directory: "/tmp/backups" },
    };
  }

  it("includes postgres and qdrant probes for the qdrant vector backend", () => {
    for (const provider of ["openai", "transformers", "local"] as const) {
      const probes = selectDependencyProbes(baseConfig(provider, "qdrant"), fakePool());
      expect(probes.postgres).toBeDefined();
      expect(probes.qdrant).toBeDefined();
    }
  });

  it("omits the qdrant probe for the pgvector backend", () => {
    for (const provider of ["openai", "transformers", "local"] as const) {
      const probes = selectDependencyProbes(baseConfig(provider, "pgvector"), fakePool());
      expect(probes.postgres).toBeDefined();
      expect(probes.qdrant).toBeUndefined();
    }
  });

  it("includes openai probe only when EMBEDDING_PROVIDER=openai", () => {
    const openaiProbes = selectDependencyProbes(baseConfig("openai"), fakePool());
    expect(openaiProbes.openai).toBeDefined();
  });

  it("omits openai probe when EMBEDDING_PROVIDER=transformers", () => {
    const probes = selectDependencyProbes(baseConfig("transformers"), fakePool());
    expect(probes.openai).toBeUndefined();
  });

  it("omits openai probe when EMBEDDING_PROVIDER=local", () => {
    const probes = selectDependencyProbes(baseConfig("local"), fakePool());
    expect(probes.openai).toBeUndefined();
  });
});
