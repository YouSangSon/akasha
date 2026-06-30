import type { IncomingMessage } from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { Logger } from "../../src/logger.js";
import {
  TOOL_ROUTES,
  type ServiceToolName,
} from "../../src/mcp/tool-schemas.js";
import type { ToolRegistry } from "../../src/mcp/types.js";
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

describe("createMemoryRoutes boundary validation", () => {
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
