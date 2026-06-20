import type { IncomingMessage, ServerResponse } from "node:http";
import type { Logger } from "../../logger.js";
import { CompactionRateLimitError } from "../../compact/apply-compaction.js";
import type { ToolRegistry } from "../../mcp/types.js";
import { SecretDetectedError } from "../../store/secret-scrub.js";
import type { BearerToken } from "../middleware/bearer-auth.js";
import { sendError, sendOk } from "../middleware/envelope.js";

export type RouteContext = {
  registry: ToolRegistry;
  logger: Logger;
};

export type Route = {
  method: "GET" | "POST";
  path: string;
  handle(
    req: IncomingMessage,
    res: ServerResponse,
    auth?: BearerToken | null,
  ): Promise<void>;
};

const MAX_BODY_BYTES = 1_000_000; // 1 MB safety cap

class BadRequestError extends Error {
  readonly status = 400;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new BadRequestError("request body exceeds 1 MB");
    }
    chunks.push(buf);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequestError("invalid JSON body");
  }
}

type ToolName =
  | "add_memory"
  | "search_memory"
  | "build_context_pack"
  | "reindex_memory"
  | "compact_memory"
  | "list_audit_log"
  | "unarchive_memory";

// Per-tool body validators run AFTER JSON parse but BEFORE the registry call.
// Their job is to reject inputs that would coerce the registry into a
// surprising state (e.g., `dryRun: "false"` is a truthy string but would
// trigger the destructive branch once compaction-apply ships in P17). The
// gate here is intentionally minimal — full schema validation lives in P17.
type BodyValidator = (body: Record<string, unknown>) => string | null;

function validateCompactBody(body: Record<string, unknown>): string | null {
  if ("dryRun" in body && typeof body.dryRun !== "boolean") {
    return "dryRun must be a boolean";
  }
  return null;
}

const TOOL_VALIDATORS: Partial<Record<ToolName, BodyValidator>> = {
  compact_memory: validateCompactBody,
};

// Resolution order for the request's organizationId:
//   1. token binding (server-enforced, takes precedence — caller cannot escape)
//   2. x-organization-id header
//   3. body.organizationId
// If a token has a binding AND header/body specify a different org, reject 403.
export function resolveOrganizationId(
  req: IncomingMessage,
  bodyOrgRaw: unknown,
  auth: BearerToken | null | undefined,
): { organizationId: string | undefined; conflict: boolean } {
  const headerValue = req.headers["x-organization-id"];
  const headerOrg = typeof headerValue === "string" ? headerValue.trim() : "";
  const bodyOrg =
    typeof bodyOrgRaw === "string" && bodyOrgRaw.trim().length > 0
      ? bodyOrgRaw.trim()
      : undefined;
  const callerOrg = headerOrg.length > 0 ? headerOrg : bodyOrg;

  if (auth?.organizationId) {
    if (callerOrg !== undefined && callerOrg !== auth.organizationId) {
      return { organizationId: auth.organizationId, conflict: true };
    }
    return { organizationId: auth.organizationId, conflict: false };
  }

  return { organizationId: callerOrg, conflict: false };
}

function buildHandler<K extends ToolName>(toolName: K, ctx: RouteContext) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    auth?: BearerToken | null,
  ): Promise<void> => {
    try {
      const body = await readJsonBody(req);
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        sendError(res, 400, "request body must be a JSON object");
        return;
      }

      const bodyRecord = body as Record<string, unknown>;

      const validator = TOOL_VALIDATORS[toolName];
      if (validator) {
        const validationError = validator(bodyRecord);
        if (validationError !== null) {
          sendError(res, 400, validationError);
          return;
        }
      }

      const resolved = resolveOrganizationId(
        req,
        bodyRecord.organizationId,
        auth,
      );

      if (resolved.conflict) {
        sendError(
          res,
          403,
          "organizationId mismatch: token is bound to a different organization",
        );
        return;
      }

      const enrichedInput =
        resolved.organizationId !== undefined
          ? { ...bodyRecord, organizationId: resolved.organizationId }
          : bodyRecord;

      // The registry method accepts a typed input but the request body is
      // unvalidated JSON — a system boundary cast is required here.
      const handler = ctx.registry[toolName] as (
        input: Record<string, unknown>,
      ) => Promise<unknown>;
      const result = await handler(enrichedInput);
      sendOk(res, 200, result);
    } catch (error: unknown) {
      if (error instanceof SecretDetectedError) {
        sendError(res, 400, error.message);
        return;
      }
      if (error instanceof BadRequestError) {
        sendError(res, error.status, error.message);
        return;
      }
      if (error instanceof CompactionRateLimitError) {
        const retryAfterSeconds = Math.ceil(error.retryAfterMs / 1000);
        res.setHeader("Retry-After", String(retryAfterSeconds));
        sendError(res, 429, "compaction rate limit exceeded; retry later");
        return;
      }

      ctx.logger.error(
        { event: "http.tool_error", tool: toolName, err: error },
        "tool handler failed",
      );
      sendError(res, 500, "internal server error");
    }
  };
}

export function createMemoryRoutes(ctx: RouteContext): Route[] {
  return [
    { method: "POST", path: "/v1/memory", handle: buildHandler("add_memory", ctx) },
    {
      method: "POST",
      path: "/v1/memory/search",
      handle: buildHandler("search_memory", ctx),
    },
    {
      method: "POST",
      path: "/v1/memory/context-pack",
      handle: buildHandler("build_context_pack", ctx),
    },
    {
      method: "POST",
      path: "/v1/memory/reindex",
      handle: buildHandler("reindex_memory", ctx),
    },
    {
      method: "POST",
      path: "/v1/memory/compact",
      handle: buildHandler("compact_memory", ctx),
    },
    {
      method: "POST",
      path: "/v1/audit/list",
      handle: buildHandler("list_audit_log", ctx),
    },
    {
      method: "POST",
      path: "/v1/memory/unarchive",
      handle: buildHandler("unarchive_memory", ctx),
    },
  ];
}
