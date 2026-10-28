import type { IncomingMessage, ServerResponse } from "node:http";
import { CompactionRateLimitError } from "../../compact/apply-compaction.js";
import { ContextPackBudgetError } from "../../mcp/context-pack-result.js";
import { EmbeddingInputTooLongError } from "../../embedding/transformers-embedding.js";
import {
  type ServiceToolName,
  validateToolInput,
} from "../../mcp/tool-schemas.js";
import { SecretDetectedError } from "../../store/secret-scrub.js";
import type { BearerToken } from "../middleware/bearer-auth.js";
import { sendError, sendOk } from "../middleware/envelope.js";
import { JsonBodyError, readJsonBody } from "../middleware/json-body.js";
import { checkOAuthScopes } from "../middleware/oauth-token-auth.js";
import {
  normalizeUnresolvedOrganizationId,
  resolveOrganizationId,
} from "../middleware/organization-resolution.js";
import { setOAuthInsufficientScopeHeader } from "../oauth-protected-resource.js";
import type { RouteContext } from "./types.js";

export function buildToolRouteHandler<K extends ServiceToolName>(
  toolName: K,
  ctx: RouteContext,
) {
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
      const resolved = resolveOrganizationId(
        req,
        bodyRecord.organizationId,
        auth,
      );

      if (resolved.validationError) {
        sendError(res, 400, resolved.validationError);
        return;
      }

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
          : normalizeUnresolvedOrganizationId(bodyRecord);

      const scopeCheck = checkOAuthScopes(
        auth,
        toolName,
        enrichedInput,
        ctx.oauthProtectedResource ?? null,
      );
      if (!scopeCheck.ok) {
        setOAuthInsufficientScopeHeader(
          res,
          ctx.oauthProtectedResource ?? null,
          scopeCheck.challengeScope,
        );
        sendError(res, 403, "insufficient_scope");
        return;
      }

      const validation = validateToolInput(toolName, enrichedInput);
      if (!validation.ok) {
        sendError(res, 400, validation.message);
        return;
      }

      const handler = ctx.registry[toolName] as (
        input: Record<string, unknown>,
      ) => Promise<unknown>;
      const result = await handler(validation.data);
      sendOk(res, 200, result);
    } catch (error: unknown) {
      if (error instanceof SecretDetectedError || error instanceof ContextPackBudgetError || error instanceof EmbeddingInputTooLongError) {
        sendError(res, 400, error.message);
        return;
      }
      if (error instanceof JsonBodyError) {
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
