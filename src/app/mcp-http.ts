import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Logger } from "../logger.js";
import { createMcpServer } from "../mcp/server.js";
import type { ToolName } from "../mcp/tool-schemas.js";
import type { McpToolAuthorizer, ToolRegistry } from "../mcp/types.js";
import {
  authenticateBearer,
  type BearerToken,
  type OAuthTokenVerifier,
} from "./middleware/bearer-auth.js";
import {
  setOAuthInsufficientScopeHeader,
  setOAuthWwwAuthenticateHeader,
  type OAuthProtectedResourceConfig,
} from "./oauth-protected-resource.js";
import type { RateLimiter } from "./middleware/rate-limit.js";
import { checkOAuthScopes } from "./middleware/oauth-token-auth.js";

export type HandleMcpHttpRequestOptions = {
  req: IncomingMessage;
  res: ServerResponse;
  registry: ToolRegistry;
  bearerTokens: readonly BearerToken[];
  oauthTokenVerifier: OAuthTokenVerifier | null;
  rateLimiter: RateLimiter | null;
  logger: Logger;
  oauthProtectedResource?: OAuthProtectedResourceConfig | null;
};

const MAX_BODY_BYTES = 1_000_000; // 1 MB safety cap
const ORGANIZATION_MISMATCH_ERROR =
  "organizationId mismatch: token is bound to a different organization";

export async function handleMcpHttpRequest(
  options: HandleMcpHttpRequestOptions,
): Promise<void> {
  const {
    req,
    res,
    registry,
    bearerTokens,
    oauthTokenVerifier,
    rateLimiter,
    logger,
    oauthProtectedResource = null,
  } = options;

  if (req.method !== "POST" && req.method !== "GET" && req.method !== "DELETE") {
    sendJsonRpcError(res, 405, -32000, "Method not allowed");
    return;
  }

  if (!isAllowedOrigin(req.headers.origin)) {
    sendJsonRpcError(res, 403, -32000, "Forbidden origin");
    return;
  }

  let matchedToken: BearerToken | null = null;
  if (bearerTokens.length > 0 || oauthTokenVerifier) {
    matchedToken = await authenticateBearer(
      typeof req.headers.authorization === "string"
        ? req.headers.authorization
        : undefined,
      bearerTokens,
      oauthTokenVerifier,
    );
    if (!matchedToken) {
      setOAuthWwwAuthenticateHeader(res, oauthProtectedResource);
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

  const guardedRegistry = matchedToken
    ? withAuthenticatedRegistry(registry, matchedToken, oauthProtectedResource, res)
    : registry;

  const server = createMcpServer({
    registry: guardedRegistry,
    defaultActor: "mcp-http",
    ...(matchedToken
      ? {
          authorizeTool: createMcpToolAuthorizer(
            matchedToken,
            oauthProtectedResource,
            res,
          ),
        }
      : {}),
  });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  let cleanupInFinally = true;
  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    await Promise.allSettled([
      transport.close(),
      server.close(),
    ]);
  };
  const cleanupOnClose = () => {
    void cleanup();
  };
  res.once("close", cleanupOnClose);

  try {
    await server.connect(transport);
    const parsedBody = req.method === "POST" ? await readJsonBody(req) : undefined;
    await transport.handleRequest(req, res, parsedBody);
    cleanupInFinally = false;
  } catch (error: unknown) {
    logger.error({ event: "mcp_http.error", err: error }, "MCP HTTP request failed");
    if (!res.headersSent) {
      if (error instanceof BadRequestError) {
        sendJsonRpcError(res, error.status, -32000, error.message);
        return;
      }
      sendJsonRpcError(res, 500, -32603, "Internal server error");
    }
  } finally {
    if (cleanupInFinally) {
      await cleanup();
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
      parsed.hostname === "::1" ||
      parsed.hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

class BadRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new BadRequestError("request body exceeds 1 MB", 413);
    }
    chunks.push(buf);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BadRequestError("invalid JSON body", 400);
  }
}

function withAuthenticatedRegistry(
  registry: ToolRegistry,
  auth: BearerToken,
  oauthProtectedResource: OAuthProtectedResourceConfig | null,
  res: ServerResponse,
): ToolRegistry {
  const wrap =
    <
      TInput extends Record<string, unknown> & { organizationId?: string },
      TResult,
    >(
      toolName: ToolName,
      handler: (input: TInput) => Promise<TResult>,
    ) =>
    async (input: TInput): Promise<TResult> => {
      const scopeCheck = checkOAuthScopes(
        auth,
        toolName,
        input,
        oauthProtectedResource,
      );
      if (!scopeCheck.ok) {
        setOAuthInsufficientScopeHeader(
          res,
          oauthProtectedResource,
          scopeCheck.challengeScope,
        );
        throw new Error("insufficient_scope");
      }

      if (
        auth.organizationId !== undefined &&
        input.organizationId !== undefined &&
        input.organizationId !== auth.organizationId
      ) {
        throw new Error(ORGANIZATION_MISMATCH_ERROR);
      }
      const enriched =
        auth.organizationId !== undefined
          ? { ...input, organizationId: auth.organizationId }
          : input;
      return handler(enriched);
    };

  return {
    add_memory: wrap("add_memory", registry.add_memory),
    search_memory: wrap("search_memory", registry.search_memory),
    build_context_pack: wrap("build_context_pack", registry.build_context_pack),
    reindex_memory: wrap("reindex_memory", registry.reindex_memory),
    compact_memory: wrap("compact_memory", registry.compact_memory),
    list_memory: wrap("list_memory", registry.list_memory),
    inspect_memory_graph: wrap(
      "inspect_memory_graph",
      registry.inspect_memory_graph,
    ),
    update_memory: wrap("update_memory", registry.update_memory),
    delete_memory: wrap("delete_memory", registry.delete_memory),
    tag_memory: wrap("tag_memory", registry.tag_memory),
    list_audit_log: wrap("list_audit_log", registry.list_audit_log),
    unarchive_memory: wrap("unarchive_memory", registry.unarchive_memory),
  };
}

function createMcpToolAuthorizer(
  auth: BearerToken,
  oauthProtectedResource: OAuthProtectedResourceConfig | null,
  res: ServerResponse,
): McpToolAuthorizer {
  return ({ toolName, input }) => {
    const scopeCheck = checkOAuthScopes(
      auth,
      toolName,
      input,
      oauthProtectedResource,
    );
    if (!scopeCheck.ok) {
      setOAuthInsufficientScopeHeader(
        res,
        oauthProtectedResource,
        scopeCheck.challengeScope,
      );
      throw new Error("insufficient_scope");
    }

    if (
      auth.organizationId !== undefined &&
      typeof input.organizationId === "string" &&
      input.organizationId !== auth.organizationId
    ) {
      throw new Error(ORGANIZATION_MISMATCH_ERROR);
    }
  };
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
