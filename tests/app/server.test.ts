import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import {
  assertSafeAuthConfig,
  createOperatorServer,
  isLoopbackHost,
  selectDependencyProbes,
} from "../../src/app/server.js";
import {
  createTokenBucketLimiter,
  type RateLimiter,
} from "../../src/app/middleware/rate-limit.js";
import type { OAuthProtectedResourceConfig } from "../../src/app/oauth-protected-resource.js";
import type { OAuthTokenVerifier } from "../../src/app/middleware/bearer-auth.js";
import type { ToolRegistry } from "../../src/mcp/types.js";
import { goalRunRegistryStubs } from "../fixtures/goal-run-stubs.js";
import type { Logger } from "../../src/logger.js";
import type { PgPool } from "../../src/db/connection.js";
import type { DependencyProbes } from "../../src/health/check-dependencies.js";

type ServerHandle = {
  baseUrl: string;
  close: () => Promise<void>;
};

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

function buildLogger(): Logger {
  const childLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  return {
    child: vi.fn(() => childLogger),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger;
}

async function startTestServer(
  registry: ToolRegistry,
  bearerTokens: ReadonlyArray<string | { token: string; organizationId?: string }>,
  oauthProtectedResource: OAuthProtectedResourceConfig | null = null,
  rateLimiter?: RateLimiter,
  oauthTokenVerifier?: OAuthTokenVerifier | null,
): Promise<ServerHandle> {
  const server = createOperatorServer({
    registry,
    bearerTokens,
    oauthProtectedResource,
    rateLimiter,
    ...(oauthTokenVerifier !== undefined ? { oauthTokenVerifier } : {}),
  });
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

  it("serves GET /admin/memory as a static shell without bearer", async () => {
    const res = await fetch(`${handle.baseUrl}/admin/memory`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");

    const html = await res.text();
    expect(html).toContain("Akasha Memory Admin");
    expect(html).toContain("/v1/memory/list");
    expect(html).toContain("/v1/memory/update");
    expect(html).toContain("/v1/memory/delete");
    expect(html).toContain("/v1/memory/tag");
    expect(html).not.toContain('<option value="archived">');
    expect(html).toContain("if (!form.elements.durability.disabled)");
    expect(html).not.toContain("localStorage");
    expect(html).not.toContain("sessionStorage");
    expect(html).not.toContain(tokens[0]);
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

  it("rejects invalid HTTP input with the shared tool schema before dispatch", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        projectKey: "p",
        query: "anything",
        limit: "5",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("invalid request body for search_memory");
    expect(registry.search_memory).not.toHaveBeenCalled();
  });

  it("treats whitespace-only body organizationId as absent before validation", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        organizationId: " \n\t ",
        projectKey: "p",
        query: "anything",
      }),
    });

    expect(res.status).toBe(200);
    expect(registry.search_memory).toHaveBeenCalledWith({
      projectKey: "p",
      query: "anything",
    });
  });

  it("rejects non-string body organizationId before write dispatch", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        organizationId: 123,
        projectKey: "p",
        kind: "decision",
        content: "first decision",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("organizationId");
    expect(registry.add_memory).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only search and context-pack text before dispatch", async () => {
    const search = await fetch(`${handle.baseUrl}/v1/memory/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        projectKey: "p",
        query: " \n\t ",
      }),
    });

    expect(search.status).toBe(400);
    const searchBody = (await search.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(searchBody.success).toBe(false);
    expect(searchBody.error.message).toContain("non-whitespace text");
    expect(registry.search_memory).not.toHaveBeenCalled();

    const contextPack = await fetch(`${handle.baseUrl}/v1/memory/context-pack`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        projectKey: "p",
        task: " \n\t ",
      }),
    });

    expect(contextPack.status).toBe(400);
    const contextPackBody = (await contextPack.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(contextPackBody.success).toBe(false);
    expect(contextPackBody.error.message).toContain("non-whitespace text");
    expect(registry.build_context_pack).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only scope identifiers before dispatch", async () => {
    const search = await fetch(`${handle.baseUrl}/v1/memory/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        projectKey: " \n\t ",
        query: "Postgres",
      }),
    });

    expect(search.status).toBe(400);
    const searchBody = (await search.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(searchBody.success).toBe(false);
    expect(searchBody.error.message).toContain("non-whitespace text");
    expect(registry.search_memory).not.toHaveBeenCalled();

    const contextPack = await fetch(`${handle.baseUrl}/v1/memory/context-pack`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        projectKey: "p",
        userScopeId: " \n\t ",
        task: "continue work",
      }),
    });

    expect(contextPack.status).toBe(400);
    const contextPackBody = (await contextPack.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(contextPackBody.success).toBe(false);
    expect(contextPackBody.error.message).toContain("non-whitespace text");
    expect(registry.build_context_pack).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only memory content before dispatch", async () => {
    const add = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        projectKey: "p",
        kind: "decision",
        content: " \n\t ",
      }),
    });

    expect(add.status).toBe(400);
    const addBody = (await add.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(addBody.success).toBe(false);
    expect(addBody.error.message).toContain("non-whitespace text");
    expect(registry.add_memory).not.toHaveBeenCalled();

    const update = await fetch(`${handle.baseUrl}/v1/memory/update`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        memoryId: 42,
        content: "   ",
      }),
    });

    expect(update.status).toBe(400);
    const updateBody = (await update.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(updateBody.success).toBe(false);
    expect(updateBody.error.message).toContain("non-whitespace text");
    expect(registry.update_memory).not.toHaveBeenCalled();
  });

  it("rejects add_memory default/project-scope payloads without projectKey before dispatch", async () => {
    const defaultScope = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        kind: "decision",
        content: "missing project",
      }),
    });
    expect(defaultScope.status).toBe(400);
    expect(registry.add_memory).not.toHaveBeenCalled();

    const projectScope = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        scope: "project",
        kind: "decision",
        content: "missing project",
      }),
    });
    expect(projectScope.status).toBe(400);
    const body = (await projectScope.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("projectKey");
    expect(registry.add_memory).not.toHaveBeenCalled();
  });

  it("rejects unsupported add_memory kind before dispatch", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        projectKey: "p",
        kind: "note",
        content: "unsupported kind",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("kind");
    expect(registry.add_memory).not.toHaveBeenCalled();
  });

  it("allows add_memory user-scope payloads without projectKey before dispatch", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        scope: "user",
        kind: "fact",
        content: "user scoped fact",
      }),
    });

    expect(res.status).toBe(200);
    expect(registry.add_memory).toHaveBeenCalledWith({
      scope: "user",
      kind: "fact",
      content: "user scoped fact",
    });
  });

  it("rejects goal-run default/project-scope payloads without projectKey before dispatch", async () => {
    const startDefaultScope = await fetch(`${handle.baseUrl}/v1/goal-run/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({ goal: "missing project" }),
    });
    expect(startDefaultScope.status).toBe(400);
    expect(registry.start_goal_run).not.toHaveBeenCalled();

    const listProjectScope = await fetch(`${handle.baseUrl}/v1/goal-run/list`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({ scope: "project", status: "active" }),
    });
    expect(listProjectScope.status).toBe(400);
    const body = (await listProjectScope.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("projectKey");
    expect(registry.list_goal_runs).not.toHaveBeenCalled();
  });

  it("allows goal-run user-scope payloads without projectKey before dispatch", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/goal-run/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        scope: "user",
        goal: "user scoped goal",
      }),
    });

    expect(res.status).toBe(200);
    expect(registry.start_goal_run).toHaveBeenCalledWith({
      scope: "user",
      goal: "user scoped goal",
    });
  });

  it("rejects whitespace-only goal-run text before dispatch", async () => {
    const start = await fetch(`${handle.baseUrl}/v1/goal-run/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        projectKey: "p",
        goal: " \n\t ",
      }),
    });
    expect(start.status).toBe(400);
    expect(((await start.json()) as { error: { message: string } }).error.message)
      .toContain("non-whitespace text");
    expect(registry.start_goal_run).not.toHaveBeenCalled();

    const iteration = await fetch(`${handle.baseUrl}/v1/goal-run/iteration`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        goalRunId: 7,
        attempt: " \n\t ",
        outcome: "failure",
      }),
    });
    expect(iteration.status).toBe(400);
    expect(((await iteration.json()) as { error: { message: string } }).error.message)
      .toContain("non-whitespace text");
    expect(registry.record_iteration).not.toHaveBeenCalled();

    const repeat = await fetch(`${handle.baseUrl}/v1/goal-run/check-repeat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        goalRunId: 7,
        attempt: " \n\t ",
      }),
    });
    expect(repeat.status).toBe(400);
    expect(((await repeat.json()) as { error: { message: string } }).error.message)
      .toContain("non-whitespace text");
    expect(registry.check_repeat_attempt).not.toHaveBeenCalled();
  });

  it("validates the token-resolved organizationId through the shared schema", async () => {
    await handle.close();
    registry = buildRegistry();
    handle = await startTestServer(registry, [
      { token: "bound-token", organizationId: "org-a" },
    ]);

    const res = await fetch(`${handle.baseUrl}/v1/memory/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer bound-token",
      },
      body: JSON.stringify({
        projectKey: "p",
        query: "anything",
      }),
    });

    expect(res.status).toBe(200);
    expect(registry.search_memory).toHaveBeenCalledWith({
      projectKey: "p",
      query: "anything",
      organizationId: "org-a",
    });
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

  it("rejects compact_memory default/project-scope payloads without projectKey before dispatch", async () => {
    const defaultScope = await fetch(`${handle.baseUrl}/v1/memory/compact`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({ dryRun: true }),
    });
    expect(defaultScope.status).toBe(400);
    expect(registry.compact_memory).not.toHaveBeenCalled();

    const projectScope = await fetch(`${handle.baseUrl}/v1/memory/compact`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({ scope: "project", dryRun: true }),
    });
    expect(projectScope.status).toBe(400);
    const body = (await projectScope.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("projectKey");
    expect(registry.compact_memory).not.toHaveBeenCalled();
  });

  it("allows compact_memory user-scope payloads without projectKey before dispatch", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory/compact`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        scope: "user",
        userScopeId: "alice",
        dryRun: true,
      }),
    });

    expect(res.status).toBe(200);
    expect(registry.compact_memory).toHaveBeenCalledWith({
      scope: "user",
      userScopeId: "alice",
      dryRun: true,
    });
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
      body: JSON.stringify({ organizationId: "org-a", projectKey: "p" }),
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

  it("routes memory governance endpoints through descriptor-backed handlers", async () => {
    const list = await fetch(`${handle.baseUrl}/v1/memory/list`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        organizationId: "org-a",
        projectKey: "p",
        includeArchived: true,
        tag: "ops",
      }),
    });
    expect(list.status).toBe(200);
    expect(registry.list_memory).toHaveBeenCalledWith({
      organizationId: "org-a",
      projectKey: "p",
      includeArchived: true,
      tag: "ops",
    });

    const graph = await fetch(`${handle.baseUrl}/v1/memory/graph`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        organizationId: "org-a",
        projectKey: "p",
        kind: "code_symbol",
        query: "QDRANT",
        relationshipLimit: 10,
      }),
    });
    expect(graph.status).toBe(200);
    expect(registry.inspect_memory_graph).toHaveBeenCalledWith({
      organizationId: "org-a",
      projectKey: "p",
      kind: "code_symbol",
      query: "QDRANT",
      relationshipLimit: 10,
    });

    const update = await fetch(`${handle.baseUrl}/v1/memory/update`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        organizationId: "org-a",
        memoryId: 42,
        content: "updated content",
        tags: ["ops"],
      }),
    });
    expect(update.status).toBe(200);
    expect(registry.update_memory).toHaveBeenCalledWith({
      organizationId: "org-a",
      memoryId: 42,
      content: "updated content",
      tags: ["ops"],
    });

    const deleteResponse = await fetch(`${handle.baseUrl}/v1/memory/delete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        organizationId: "org-a",
        memoryId: 42,
      }),
    });
    expect(deleteResponse.status).toBe(200);
    expect(registry.delete_memory).toHaveBeenCalledWith({
      organizationId: "org-a",
      memoryId: 42,
    });

    const tag = await fetch(`${handle.baseUrl}/v1/memory/tag`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        organizationId: "org-a",
        memoryId: 42,
        tags: ["security", "ops"],
      }),
    });
    expect(tag.status).toBe(200);
    expect(registry.tag_memory).toHaveBeenCalledWith({
      organizationId: "org-a",
      memoryId: 42,
      tags: ["security", "ops"],
    });

    const clearTags = await fetch(`${handle.baseUrl}/v1/memory/tag`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        organizationId: "org-a",
        memoryId: 42,
        tags: [],
      }),
    });
    expect(clearTags.status).toBe(200);
    expect(registry.tag_memory).toHaveBeenLastCalledWith({
      organizationId: "org-a",
      memoryId: 42,
      tags: [],
    });
  });

  it("rejects whitespace-only governance filters before dispatch", async () => {
    const list = await fetch(`${handle.baseUrl}/v1/memory/list`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        projectKey: "p",
        tag: " \n\t ",
      }),
    });
    expect(list.status).toBe(400);
    expect(((await list.json()) as { error: { message: string } }).error.message)
      .toContain("non-whitespace text");
    expect(registry.list_memory).not.toHaveBeenCalled();

    const graph = await fetch(`${handle.baseUrl}/v1/memory/graph`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        projectKey: "p",
        query: " \n\t ",
      }),
    });
    expect(graph.status).toBe(400);
    expect(((await graph.json()) as { error: { message: string } }).error.message)
      .toContain("non-whitespace text");
    expect(registry.inspect_memory_graph).not.toHaveBeenCalled();

    const update = await fetch(`${handle.baseUrl}/v1/memory/update`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        memoryId: 42,
        tags: ["ops", " \n\t "],
      }),
    });
    expect(update.status).toBe(400);
    expect(((await update.json()) as { error: { message: string } }).error.message)
      .toContain("non-whitespace text");
    expect(registry.update_memory).not.toHaveBeenCalled();

    const tag = await fetch(`${handle.baseUrl}/v1/memory/tag`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({
        memoryId: 42,
        tags: [" \n\t "],
      }),
    });
    expect(tag.status).toBe(400);
    expect(((await tag.json()) as { error: { message: string } }).error.message)
      .toContain("non-whitespace text");
    expect(registry.tag_memory).not.toHaveBeenCalled();
  });

  it("rejects list_memory default/project-scope payloads without projectKey before dispatch", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory/list`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({ includeArchived: true }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("projectKey");
    expect(registry.list_memory).not.toHaveBeenCalled();
  });

  it("rejects inspect_memory_graph default/project-scope payloads without projectKey before dispatch", async () => {
    const res = await fetch(`${handle.baseUrl}/v1/memory/graph`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens[0]}`,
      },
      body: JSON.stringify({ kind: "path" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("projectKey");
    expect(registry.inspect_memory_graph).not.toHaveBeenCalled();
  });

  it("builds the default registry with lazy audit wiring when no registry is injected", async () => {
    vi.resetModules();
    const defaultRegistry = buildRegistry();
    const createToolRegistryMock = vi.fn(() => defaultRegistry);
    vi.doMock("../../src/mcp/server.js", () => ({
      createToolRegistry: createToolRegistryMock,
    }));

    const logger = buildLogger();
    try {
      const { createOperatorServer: createOperatorServerWithMock } = await import(
        "../../src/app/server.js"
      );
      createOperatorServerWithMock({
        bearerTokens: [],
        logger,
        oauthProtectedResource: null,
      });
    } finally {
      vi.doUnmock("../../src/mcp/server.js");
      vi.resetModules();
    }

    expect(createToolRegistryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        logger,
        defaultActor: expect.any(String),
        auditLog: expect.objectContaining({
          record: expect.any(Function),
          listByOrganization: expect.any(Function),
        }),
        withCanonicalServices: expect.any(Function),
      }),
    );
  });
});

describe("createOperatorServer (OAuth protected-resource discovery)", () => {
  let handle: ServerHandle;
  let registry: ToolRegistry;
  const oauthProtectedResource: OAuthProtectedResourceConfig = {
    metadataUrl:
      "https://akasha.example.com/.well-known/oauth-protected-resource/mcp",
    metadata: {
      resource: "https://akasha.example.com/mcp",
      authorization_servers: ["https://auth.example.com/"],
      bearer_methods_supported: ["header"],
      scopes_supported: ["akasha:memory", "akasha:write"],
      resource_name: "Akasha Memory",
      resource_documentation: "https://docs.example.com/akasha",
    },
  };

  beforeEach(async () => {
    registry = buildRegistry();
    handle = await startTestServer(registry, ["token-aaa"], oauthProtectedResource);
  });

  afterEach(async () => {
    await handle.close();
  });

  it("serves OAuth protected-resource metadata without bearer auth", async () => {
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ]) {
      const res = await fetch(`${handle.baseUrl}${path}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = await res.json();
      expect(body).toEqual(oauthProtectedResource.metadata);
    }
  });

  it("adds WWW-Authenticate metadata and scope hints to /v1 401 responses", async () => {
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
    expect(res.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://akasha.example.com/.well-known/oauth-protected-resource/mcp", scope="akasha:memory akasha:write"',
    );
    const body = (await res.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("unauthorized");
    expect(registry.add_memory).not.toHaveBeenCalled();
  });

  it("does not add OAuth challenges to unauthenticated health probes", async () => {
    const res = await fetch(`${handle.baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get("www-authenticate")).toBeNull();
  });

  it("keeps rate limiting active for /v1 requests when OAuth discovery is configured", async () => {
    await handle.close();
    registry = buildRegistry();
    const rateLimiter = createTokenBucketLimiter({
      capacity: 1,
      windowMs: 60_000,
      now: () => 0,
    });
    handle = await startTestServer(
      registry,
      ["token-aaa"],
      oauthProtectedResource,
      rateLimiter,
    );

    const first = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token-aaa",
      },
      body: JSON.stringify({
        projectKey: "p",
        kind: "decision",
        content: "x",
      }),
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token-aaa",
      },
      body: JSON.stringify({
        projectKey: "p",
        kind: "decision",
        content: "x",
      }),
    });

    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("60");
    const body = (await second.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("rate limit exceeded");
    expect(registry.add_memory).toHaveBeenCalledOnce();
  });

  it("accepts a verified OAuth token and injects its organization claim", async () => {
    await handle.close();
    registry = buildRegistry();
    const oauthVerifier: OAuthTokenVerifier = {
      verify: vi.fn().mockResolvedValue({
        token: "oauth-read",
        authType: "oauth",
        scopes: ["akasha:read"],
        organizationId: "org-oauth",
        subject: "user-1",
        issuer: "https://auth.example.com",
        audience: "https://akasha.example.com/mcp",
      }),
    };
    handle = await startTestServer(
      registry,
      [],
      oauthProtectedResource,
      undefined,
      oauthVerifier,
    );

    const res = await fetch(`${handle.baseUrl}/v1/memory/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer oauth-read",
      },
      body: JSON.stringify({ projectKey: "p", query: "q" }),
    });

    expect(res.status).toBe(200);
    expect(oauthVerifier.verify).toHaveBeenCalledWith("oauth-read");
    expect(registry.search_memory).toHaveBeenCalledWith({
      projectKey: "p",
      query: "q",
      organizationId: "org-oauth",
    });
  });

  it("returns insufficient_scope when an OAuth token lacks the route scope", async () => {
    await handle.close();
    registry = buildRegistry();
    const oauthVerifier: OAuthTokenVerifier = {
      verify: vi.fn().mockResolvedValue({
        token: "oauth-read",
        authType: "oauth",
        scopes: ["akasha:read"],
        organizationId: "org-oauth",
      }),
    };
    handle = await startTestServer(
      registry,
      [],
      oauthProtectedResource,
      undefined,
      oauthVerifier,
    );

    const res = await fetch(`${handle.baseUrl}/v1/memory`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer oauth-read",
      },
      body: JSON.stringify({
        projectKey: "p",
        kind: "decision",
        content: "write attempt",
      }),
    });

    expect(res.status).toBe(403);
    expect(res.headers.get("www-authenticate")).toBe(
      'Bearer error="insufficient_scope", resource_metadata="https://akasha.example.com/.well-known/oauth-protected-resource/mcp", scope="akasha:write"',
    );
    const body = (await res.json()) as {
      success: boolean;
      error: { message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.message).toBe("insufficient_scope");
    expect(registry.add_memory).not.toHaveBeenCalled();
  });

  it("allows OAuth read scope for list_memory and rejects admin governance writes", async () => {
    await handle.close();
    registry = buildRegistry();
    const oauthVerifier: OAuthTokenVerifier = {
      verify: vi.fn().mockResolvedValue({
        token: "oauth-read",
        authType: "oauth",
        scopes: ["akasha:read"],
        organizationId: "org-oauth",
      }),
    };
    handle = await startTestServer(
      registry,
      [],
      oauthProtectedResource,
      undefined,
      oauthVerifier,
    );

    const list = await fetch(`${handle.baseUrl}/v1/memory/list`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer oauth-read",
      },
      body: JSON.stringify({ projectKey: "p" }),
    });
    expect(list.status).toBe(200);
    expect(registry.list_memory).toHaveBeenCalledWith({
      projectKey: "p",
      organizationId: "org-oauth",
    });

    const update = await fetch(`${handle.baseUrl}/v1/memory/update`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer oauth-read",
      },
      body: JSON.stringify({ memoryId: 42, title: "New title" }),
    });

    expect(update.status).toBe(403);
    expect(update.headers.get("www-authenticate")).toBe(
      'Bearer error="insufficient_scope", resource_metadata="https://akasha.example.com/.well-known/oauth-protected-resource/mcp", scope="akasha:memory"',
    );
    expect(registry.update_memory).not.toHaveBeenCalled();
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

  it("rejects non-string body organizationId before bound-token injection", async () => {
    for (const organizationId of [123, null]) {
      const res = await fetch(`${handle.baseUrl}/v1/memory`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer dev-token",
        },
        body: JSON.stringify({
          organizationId,
          projectKey: "p",
          kind: "decision",
          content: "x",
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        success: boolean;
        error: { message: string };
      };
      expect(body.success).toBe(false);
      expect(body.error.message).toContain("organizationId");
    }

    expect(registry.add_memory).not.toHaveBeenCalled();
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
      oauthProtectedResource: null,
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
