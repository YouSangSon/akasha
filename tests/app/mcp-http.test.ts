import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BearerToken } from "../../src/app/middleware/bearer-auth.js";
import type { OAuthTokenVerifier } from "../../src/app/middleware/bearer-auth.js";
import {
  createTokenBucketLimiter,
  type RateLimiter,
} from "../../src/app/middleware/rate-limit.js";
import type { OAuthProtectedResourceConfig } from "../../src/app/oauth-protected-resource.js";
import { createOperatorServer } from "../../src/app/server.js";
import type { ToolRegistry } from "../../src/mcp/types.js";

type ServerHandle = { baseUrl: string; close: () => Promise<void> };

const oauthProtectedResource: OAuthProtectedResourceConfig = {
  metadataUrl:
    "https://akasha.example.com/.well-known/oauth-protected-resource/mcp",
  metadata: {
    resource: "https://akasha.example.com/mcp",
    authorization_servers: ["https://auth.example.com/"],
    bearer_methods_supported: ["header"],
    scopes_supported: ["akasha:memory"],
  },
};

function buildRegistry(): ToolRegistry {
  return {
    add_memory: vi.fn().mockResolvedValue({
      ok: true,
      memoryId: "1",
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
      organizationId: "org-a",
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

async function startServer(
  tokens: ReadonlyArray<string | BearerToken>,
  registry = buildRegistry(),
  oauthProtectedResource: OAuthProtectedResourceConfig | null = null,
  rateLimiter?: RateLimiter,
  oauthTokenVerifier?: OAuthTokenVerifier | null,
): Promise<ServerHandle & { registry: ToolRegistry }> {
  const server = createOperatorServer({
    registry,
    bearerTokens: tokens,
    oauthProtectedResource,
    rateLimiter,
    ...(oauthTokenVerifier !== undefined ? { oauthTokenVerifier } : {}),
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address() as AddressInfo;
  return {
    registry,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function connectMcp(baseUrl: string, token?: string): Promise<Client> {
  const client = new Client({ name: "akasha-http-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`${baseUrl}/mcp`),
    {
      requestInit: token
        ? { headers: { authorization: `Bearer ${token}` } }
        : undefined,
    },
  );
  await client.connect(transport);
  return client;
}

describe("Streamable HTTP /mcp", () => {
  let handle: (ServerHandle & { registry: ToolRegistry }) | undefined;

  afterEach(async () => {
    await handle?.close();
  });

  it("requires bearer auth when tokens are configured", async () => {
    handle = await startServer(["token-a"]);
    const res = await fetch(`${handle.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      }),
    });
    expect(res.status).toBe(401);
  });

  it("adds OAuth protected-resource discovery to /mcp 401 JSON-RPC responses", async () => {
    handle = await startServer(["token-a"], buildRegistry(), oauthProtectedResource);

    const res = await fetch(`${handle.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      }),
    });

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://akasha.example.com/.well-known/oauth-protected-resource/mcp", scope="akasha:memory"',
    );
    const body = (await res.json()) as {
      jsonrpc: string;
      error: { code: number; message: string };
      id: null;
    };
    expect(body.error).toEqual({ code: -32001, message: "Unauthorized" });
  });

  it("keeps rate limiting active for /mcp requests when OAuth discovery is configured", async () => {
    const rateLimiter = createTokenBucketLimiter({
      capacity: 1,
      windowMs: 60_000,
      now: () => 0,
    });
    handle = await startServer(
      ["token-a"],
      buildRegistry(),
      oauthProtectedResource,
      rateLimiter,
    );

    const first = await fetch(`${handle.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer token-a",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: "{",
    });
    expect(first.status).toBe(400);

    const second = await fetch(`${handle.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer token-a",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: "{",
    });

    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("60");
    const body = (await second.json()) as {
      jsonrpc: string;
      error: { code: number; message: string };
      id: null;
    };
    expect(body.error).toEqual({ code: -32002, message: "Rate limit exceeded" });
  });

  it("serves MCP tools over Streamable HTTP with structuredContent", async () => {
    handle = await startServer(["token-a"]);
    const client = await connectMcp(handle.baseUrl, "token-a");

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("search_memory");

    const result = await client.callTool({
      name: "search_memory",
      arguments: { organizationId: "org-a", projectKey: "p", query: "q" },
    });
    expect(result.structuredContent).toEqual({
      ok: true,
      projectKey: "p",
      query: "q",
      results: [],
    });

    await client.close();
  });

  it("serves MCP resources and prompts over Streamable HTTP", async () => {
    handle = await startServer(["token-a"]);
    const client = await connectMcp(handle.baseUrl, "token-a");

    const resources = await client.listResourceTemplates();
    expect(resources.resourceTemplates.map((resource) => resource.name)).toEqual(
      expect.arrayContaining(["recent-project-memory", "context-pack"]),
    );

    const resource = await client.readResource({
      uri: "akasha://memory/recent/p?query=q",
    });
    expect(resource.contents[0]).toEqual(
      expect.objectContaining({
        uri: "akasha://memory/recent/p?query=q",
        mimeType: "application/json",
      }),
    );

    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((prompt) => prompt.name)).toEqual(
      expect.arrayContaining(["akasha_session_start", "akasha_store_memory"]),
    );

    const prompt = await client.getPrompt({
      name: "akasha_store_memory",
      arguments: {
        projectKey: "p",
        kind: "decision",
        content: "Decision: keep MCP resources read-only.",
      },
    });
    expect(prompt.messages[0]?.content).toEqual(
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("keep MCP resources read-only"),
      }),
    );

    await client.close();
  });

  it("rejects non-loopback browser origins", async () => {
    handle = await startServer(["token-a"]);
    const res = await fetch(`${handle.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer token-a",
        origin: "https://evil.example",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      }),
    });

    expect(res.status).toBe(403);
  });

  it("returns a failed MCP tool result when a bound token org disagrees with the call", async () => {
    handle = await startServer([
      { token: "bound-token", organizationId: "org-a" },
    ]);
    const client = await connectMcp(handle.baseUrl, "bound-token");

    const result = await client.callTool({
      name: "search_memory",
      arguments: {
        organizationId: "org-b",
        projectKey: "p",
        query: "q",
      },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: "text",
        text: "organizationId mismatch: token is bound to a different organization",
      },
    ]);
    expect(handle.registry.search_memory).not.toHaveBeenCalled();

    await client.close();
  });

  it("injects the bound token org into MCP tool calls that omit organizationId", async () => {
    handle = await startServer([
      { token: "bound-token", organizationId: "org-a" },
    ]);
    const client = await connectMcp(handle.baseUrl, "bound-token");

    const result = await client.callTool({
      name: "search_memory",
      arguments: {
        projectKey: "p",
        query: "q",
      },
    });

    expect(result.isError).not.toBe(true);
    expect(handle.registry.search_memory).toHaveBeenCalledWith({
      organizationId: "org-a",
      projectKey: "p",
      query: "q",
    });

    await client.close();
  });

  it("accepts OAuth tokens for MCP tool calls and enforces scopes", async () => {
    const oauthVerifier: OAuthTokenVerifier = {
      verify: vi.fn().mockResolvedValue({
        token: "oauth-read",
        authType: "oauth",
        scopes: ["akasha:read"],
        organizationId: "org-oauth",
      }),
    };
    handle = await startServer(
      [],
      buildRegistry(),
      oauthProtectedResource,
      undefined,
      oauthVerifier,
    );
    const client = await connectMcp(handle.baseUrl, "oauth-read");

    const search = await client.callTool({
      name: "search_memory",
      arguments: { projectKey: "p", query: "q" },
    });
    expect(search.isError).not.toBe(true);
    expect(handle.registry.search_memory).toHaveBeenCalledWith({
      organizationId: "org-oauth",
      projectKey: "p",
      query: "q",
    });

    const list = await client.callTool({
      name: "list_memory",
      arguments: { projectKey: "p" },
    });
    expect(list.isError).not.toBe(true);
    expect(handle.registry.list_memory).toHaveBeenCalledWith({
      organizationId: "org-oauth",
      projectKey: "p",
    });

    const add = await client.callTool({
      name: "add_memory",
      arguments: {
        projectKey: "p",
        kind: "decision",
        content: "write attempt",
      },
    });
    expect(add.isError).toBe(true);
    expect(add.content).toEqual([
      { type: "text", text: "insufficient_scope" },
    ]);
    expect(handle.registry.add_memory).not.toHaveBeenCalled();

    const update = await client.callTool({
      name: "update_memory",
      arguments: {
        memoryId: 42,
        title: "New title",
      },
    });
    expect(update.isError).toBe(true);
    expect(update.content).toEqual([
      { type: "text", text: "insufficient_scope" },
    ]);
    expect(handle.registry.update_memory).not.toHaveBeenCalled();

    await client.close();
  });

  it("enforces OAuth scopes for MCP-only context tools", async () => {
    const oauthVerifier: OAuthTokenVerifier = {
      verify: vi.fn().mockResolvedValue({
        token: "oauth-read",
        authType: "oauth",
        scopes: ["akasha:read"],
        organizationId: "org-oauth",
      }),
    };
    handle = await startServer(
      [],
      buildRegistry(),
      oauthProtectedResource,
      undefined,
      oauthVerifier,
    );
    const client = await connectMcp(handle.baseUrl, "oauth-read");

    const roots = await client.callTool({
      name: "list_workspace_roots",
      arguments: {},
    });
    expect(roots.isError).not.toBe(true);

    const interactive = await client.callTool({
      name: "add_memory_interactive",
      arguments: { projectKey: "p", kind: "fact" },
    });
    expect(interactive.isError).toBe(true);
    expect(interactive.content).toEqual([
      { type: "text", text: "insufficient_scope" },
    ]);
    expect(handle.registry.add_memory).not.toHaveBeenCalled();

    await client.close();
  });

  it("accepts IPv6 loopback origins", async () => {
    handle = await startServer(["token-a"]);
    const res = await fetch(`${handle.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer token-a",
        origin: "http://[::1]:4317",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "ipv6-test", version: "1.0.0" },
        },
      }),
    });

    expect(res.status).not.toBe(403);
  });

  it("rejects oversized POST bodies", async () => {
    handle = await startServer(["token-a"]);
    const oversizedBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        payload: "x".repeat(1_000_100),
      },
    });

    const res = await fetch(`${handle.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer token-a",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: oversizedBody,
    });

    expect(res.status).toBe(413);
  });

  it("closes the per-request MCP server and transport when POST JSON is invalid", async () => {
    const serverCloseSpy = vi.spyOn(McpServer.prototype, "close");
    const transportCloseSpy = vi.spyOn(StreamableHTTPServerTransport.prototype, "close");
    handle = await startServer(["token-a"]);

    const res = await fetch(`${handle.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer token-a",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: "{",
    });

    expect(res.status).toBe(400);
    expect(serverCloseSpy).toHaveBeenCalled();
    expect(transportCloseSpy).toHaveBeenCalled();
  });

  it("closes the per-request MCP server and transport when POST body exceeds the size cap", async () => {
    const serverCloseSpy = vi.spyOn(McpServer.prototype, "close");
    const transportCloseSpy = vi.spyOn(StreamableHTTPServerTransport.prototype, "close");
    handle = await startServer(["token-a"]);
    const oversizedBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        payload: "x".repeat(1_000_100),
      },
    });

    const res = await fetch(`${handle.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer token-a",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: oversizedBody,
    });

    expect(res.status).toBe(413);
    expect(serverCloseSpy).toHaveBeenCalled();
    expect(transportCloseSpy).toHaveBeenCalled();
  });

  it("closes the per-request MCP server and transport when request handling throws", async () => {
    const serverCloseSpy = vi.spyOn(McpServer.prototype, "close");
    const transportCloseSpy = vi.spyOn(StreamableHTTPServerTransport.prototype, "close");
    const handleRequestSpy = vi
      .spyOn(StreamableHTTPServerTransport.prototype, "handleRequest")
      .mockRejectedValueOnce(new Error("boom"));
    handle = await startServer(["token-a"]);

    const res = await fetch(`${handle.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer token-a",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {},
      }),
    });

    expect(res.status).toBe(500);
    expect(handleRequestSpy).toHaveBeenCalled();
    expect(serverCloseSpy).toHaveBeenCalled();
    expect(transportCloseSpy).toHaveBeenCalled();
  });
});
