import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { Logger } from "../../src/logger.js";
import {
  TOOL_ROUTES,
  type ServiceToolName,
} from "../../src/mcp/tool-schemas.js";
import type { ToolRegistry } from "../../src/mcp/types.js";
import { ContextPackBudgetError } from "../../src/mcp/context-pack-result.js";
import {
  createMemoryRoutes,
  resolveOrganizationId,
  type RouteContext,
} from "../../src/app/routes/memory.js";

function makeRegistry(
  overrides: Partial<Record<ServiceToolName, unknown>> = {},
): ToolRegistry {
  const entries = TOOL_ROUTES.map((route) => [
    route.name,
    vi.fn().mockResolvedValue({ ok: true }),
  ]);
  return {
    ...Object.fromEntries(entries),
    ...overrides,
  } as unknown as ToolRegistry;
}

function makeLogger(): Logger {
  return { error: vi.fn() } as unknown as Logger;
}

function makeContext(overrides: Record<string, unknown> = {}): RouteContext {
  return {
    registry: makeRegistry(),
    logger: makeLogger(),
    ...overrides,
  } as unknown as RouteContext;
}

function makeJsonRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): IncomingMessage {
  const stream = Readable.from([JSON.stringify(body)]);
  return Object.assign(stream, {
    headers,
    rawHeaders: Object.entries(headers).flatMap(([name, value]) => [
      name,
      value,
    ]),
  }) as IncomingMessage;
}

function makeResponse(): ServerResponse & {
  body?: string;
  headers?: Record<string, string>;
  status?: number;
} {
  const res = {
    writeHead(status: number, headers: Record<string, string>) {
      res.status = status;
      res.headers = headers;
      return res;
    },
    end(body: string) {
      res.body = body;
      return res;
    },
  } as ServerResponse & {
    body?: string;
    headers?: Record<string, string>;
    status?: number;
  };
  return res;
}

describe("createMemoryRoutes boundary validation", () => {
  it("forwards the optional context budget with the resolved organization", async () => {
    const build = vi.fn().mockResolvedValue({ ok: true });
    const route = createMemoryRoutes(makeContext({ registry: makeRegistry({ build_context_pack: build }) }))
      .find((candidate) => candidate.path === "/v1/memory/context-pack")!;
    const res = makeResponse();
    await route.handle(makeJsonRequest({ projectKey: "p", task: "continue", maxOutputBytes: 4096 }, { "x-organization-id": "org-a" }), res);
    expect(res.status).toBe(200);
    expect(build).toHaveBeenCalledWith({ projectKey: "p", task: "continue", organizationId: "org-a", maxOutputBytes: 4096 });
  });

  it("returns the existing safe 400 envelope for an insufficient context budget", async () => {
    const logger = makeLogger();
    const build = vi.fn().mockRejectedValue(new ContextPackBudgetError(1, 1024));
    const route = createMemoryRoutes(makeContext({ logger, registry: makeRegistry({ build_context_pack: build }) }))
      .find((candidate) => candidate.path === "/v1/memory/context-pack")!;
    const res = makeResponse();
    await route.handle(makeJsonRequest({ projectKey: "p", task: "continue", maxOutputBytes: 1 }), res);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body!)).toEqual({ success: false, error: { message: new ContextPackBudgetError(1, 1024).message } });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("constructs the configured JSON HTTP routes with a valid context", () => {
    const routes = createMemoryRoutes(makeContext());

    expect(routes.map((route) => route.path)).toEqual(
      TOOL_ROUTES.map((route) => route.path),
    );
  });

  it("does not require every registry handler during route construction", () => {
    const routes = createMemoryRoutes(makeContext({ registry: {} }));

    expect(routes).toHaveLength(TOOL_ROUTES.length);
  });

  it.each([
    {
      input: () => null,
      message: "memory route context must be an object",
    },
    {
      input: () => makeContext({ registry: null }),
      message: "registry must be an object",
    },
    {
      input: () => makeContext({ registry: [] }),
      message: "registry must be an object",
    },
    {
      input: () => makeContext({ logger: null }),
      message: "logger must be an object",
    },
    {
      input: () => makeContext({ logger: {} }),
      message: "logger.error must be a function",
    },
  ])("rejects malformed direct context %#", ({ input, message }) => {
    expect(() => createMemoryRoutes(input() as never)).toThrow(message);
  });

  it("dispatches valid JSON HTTP input through the registry with the response envelope", async () => {
    const searchMemory = vi.fn().mockResolvedValue({
      ok: true,
      memories: [],
    });
    const routes = createMemoryRoutes(
      makeContext({
        registry: makeRegistry({ search_memory: searchMemory }),
      }),
    );
    const route = routes.find(
      (candidate) => candidate.path === "/v1/memory/search",
    );
    expect(route).toBeDefined();
    const res = makeResponse();

    await route?.handle(
      makeJsonRequest(
        {
          organizationId: "body-org",
          projectKey: "p",
          query: "anything",
        },
        { "x-organization-id": "header-org" },
      ),
      res,
    );

    expect(searchMemory).toHaveBeenCalledWith({
      organizationId: "header-org",
      projectKey: "p",
      query: "anything",
    });
    expect(res.status).toBe(200);
    expect(res.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(res.body ?? "")).toEqual({
      success: true,
      data: {
        ok: true,
        memories: [],
      },
    });
  });

  it("rejects invalid JSON HTTP input before registry dispatch", async () => {
    const searchMemory = vi.fn().mockResolvedValue({ ok: true });
    const routes = createMemoryRoutes(
      makeContext({
        registry: makeRegistry({ search_memory: searchMemory }),
      }),
    );
    const route = routes.find(
      (candidate) => candidate.path === "/v1/memory/search",
    );
    expect(route).toBeDefined();
    const res = makeResponse();

    await route?.handle(
      makeJsonRequest({
        projectKey: "p",
        query: "anything",
        limit: "5",
      }),
      res,
    );

    expect(searchMemory).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body ?? "")).toMatchObject({
      success: false,
      error: {
        message: expect.stringContaining("invalid request body for search_memory"),
      },
    });
  });
});

describe("resolveOrganizationId boundary validation", () => {
  it.each([
    {
      input: null,
      message: "req must be an object",
    },
    {
      input: {},
      message: "req.headers must be an object",
    },
    {
      input: { headers: null },
      message: "req.headers must be an object",
    },
    {
      input: { headers: [], rawHeaders: [] },
      message: "req.headers must be an object",
    },
    {
      input: { headers: {}, rawHeaders: null },
      message: "req.rawHeaders must be an array",
    },
    {
      input: { headers: {}, rawHeaders: ["X-Organization-Id", 42] },
      message: "req.rawHeaders[1] must be a string",
    },
    {
      input: { headers: {}, rawHeaders: ["X-Organization-Id"] },
      message: "req.rawHeaders must contain header name/value pairs",
    },
  ])("rejects malformed direct request %#", ({ input, message }) => {
    expect(() =>
      resolveOrganizationId(input as IncomingMessage, undefined, undefined),
    ).toThrow(message);
  });
});
