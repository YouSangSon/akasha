import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  tokens: ReadonlyArray<string>,
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
});
