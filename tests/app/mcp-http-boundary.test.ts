import { describe, expect, it, vi } from "vitest";
import { handleMcpHttpRequest } from "../../src/app/mcp-http.js";
import type { HandleMcpHttpRequestOptions } from "../../src/app/mcp-http.js";

function baseOptions(): HandleMcpHttpRequestOptions {
  return {
    req: {
      method: "GET",
      headers: {},
    } as never,
    res: {
      writeHead: vi.fn(),
      end: vi.fn(),
      setHeader: vi.fn(),
      once: vi.fn(),
    } as never,
    registry: {} as never,
    bearerTokens: [],
    oauthTokenVerifier: null,
    rateLimiter: null,
    logger: {
      error: vi.fn(),
    } as never,
  };
}

describe("handleMcpHttpRequest boundary validation", () => {
  it.each([
    {
      input: null,
      message: "MCP HTTP request options must be an object",
    },
    {
      input: { ...baseOptions(), req: null },
      message: "req must be an object",
    },
    {
      input: { ...baseOptions(), req: { method: "GET", headers: null } },
      message: "req.headers must be an object",
    },
    {
      input: {
        ...baseOptions(),
        res: { writeHead: null, end: vi.fn(), setHeader: vi.fn(), once: vi.fn() },
      },
      message: "res.writeHead must be a function",
    },
    {
      input: { ...baseOptions(), registry: null },
      message: "registry must be an object",
    },
    {
      input: { ...baseOptions(), bearerTokens: null },
      message: "bearerTokens must be an array",
    },
    {
      input: { ...baseOptions(), oauthTokenVerifier: {} },
      message: "oauthTokenVerifier.verify must be a function",
    },
    {
      input: { ...baseOptions(), rateLimiter: {} },
      message: "rateLimiter.check must be a function",
    },
    {
      input: { ...baseOptions(), logger: {} },
      message: "logger.error must be a function",
    },
    {
      input: { ...baseOptions(), oauthProtectedResource: "resource" },
      message: "oauthProtectedResource must be an object",
    },
    {
      input: { ...baseOptions(), allowedHostnames: ["localhost", 42] },
      message: "allowedHostnames[1] must be a string",
    },
  ])("rejects malformed direct options %#", async ({ input, message }) => {
    await expect(handleMcpHttpRequest(input as never)).rejects.toThrow(message);
  });
});
