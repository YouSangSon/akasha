import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Logger } from "../logger.js";
import { createMcpServer } from "../mcp/server.js";
import type { ToolRegistry } from "../mcp/types.js";
import {
  matchBearerFromRequest,
  type BearerToken,
} from "./middleware/bearer-auth.js";
import type { RateLimiter } from "./middleware/rate-limit.js";

export type HandleMcpHttpRequestOptions = {
  req: IncomingMessage;
  res: ServerResponse;
  registry: ToolRegistry;
  bearerTokens: readonly BearerToken[];
  rateLimiter: RateLimiter | null;
  logger: Logger;
};

export async function handleMcpHttpRequest(
  options: HandleMcpHttpRequestOptions,
): Promise<void> {
  const { req, res, registry, bearerTokens, rateLimiter, logger } = options;

  if (req.method !== "POST" && req.method !== "GET" && req.method !== "DELETE") {
    sendJsonRpcError(res, 405, -32000, "Method not allowed");
    return;
  }

  if (!isAllowedOrigin(req.headers.origin)) {
    sendJsonRpcError(res, 403, -32000, "Forbidden origin");
    return;
  }

  let matchedToken: BearerToken | null = null;
  if (bearerTokens.length > 0) {
    matchedToken = matchBearerFromRequest(req, bearerTokens);
    if (!matchedToken) {
      sendJsonRpcError(res, 401, -32001, "Unauthorized");
      return;
    }
  }

  if (rateLimiter) {
    const key = matchedToken?.token ?? "anonymous";
    const decision = rateLimiter.check(key);
    if (!decision.allowed) {
      res.setHeader(
        "Retry-After",
        Math.ceil(decision.retryAfterMs / 1000).toString(),
      );
      sendJsonRpcError(res, 429, -32002, "Rate limit exceeded");
      return;
    }
  }

  const server = createMcpServer({
    registry,
    defaultActor: "mcp-http",
  });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
    res.on("close", () => {
      void transport.close().catch(() => undefined);
      void server.close().catch(() => undefined);
    });
  } catch (error: unknown) {
    logger.error({ event: "mcp_http.error", err: error }, "MCP HTTP request failed");
    if (!res.headersSent) {
      sendJsonRpcError(res, 500, -32603, "Internal server error");
    }
  }
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1"
    );
  } catch {
    return false;
  }
}

function sendJsonRpcError(
  res: ServerResponse,
  status: number,
  code: number,
  message: string,
): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
}
