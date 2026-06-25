import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BearerToken } from "../../src/app/middleware/bearer-auth.js";
import { createOperatorServer } from "../../src/app/server.js";
import type { ToolRegistry } from "../../src/mcp/types.js";

type ServerHandle = { baseUrl: string; close: () => Promise<void> };

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
      duplicateGroups: [],
      decayCandidates: [],
      promotionCandidates: [],
      summary: "noop",
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
): Promise<ServerHandle & { registry: ToolRegistry }> {
  const server = createOperatorServer({ registry, bearerTokens: tokens });
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

    expect(res.ok).toBe(false);
  });
});
