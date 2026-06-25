import * as z from "zod/v4";
import type { ToolRegistry } from "./types.js";
import { SUPPORTED_MEMORY_KINDS } from "./tool-utils.js";

export type ToolName = keyof ToolRegistry;

export type ToolRoute = {
  readonly name: ToolName;
  readonly method: "POST";
  readonly path: string;
};

export type ToolDescriptor = {
  readonly name: ToolName;
  readonly description: string;
  readonly inputSchema: Record<string, z.ZodTypeAny>;
};

export type ToolInputValidation =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; message: string };

export const TOOL_DESCRIPTORS = [
  {
    name: "add_memory",
    description: "Persist a memory record for a project or user scope.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      projectKey: z.string().min(1).optional(),
      scope: z.enum(["project", "user"]).optional(),
      userScopeId: z.string().min(1).optional(),
      kind: z.enum(SUPPORTED_MEMORY_KINDS),
      content: z.string().min(1),
    },
  },
  {
    name: "search_memory",
    description: "Search persisted memory records across one or more scopes.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      projectKey: z.string().min(1),
      query: z.string().min(1),
      userScopeId: z.string().min(1).optional(),
      includeUser: z.boolean().optional(),
      limit: z.number().int().positive().optional(),
    },
  },
  {
    name: "build_context_pack",
    description: "Search memory and assemble a markdown context pack.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      projectKey: z.string().min(1),
      task: z.string().min(1),
      userScopeId: z.string().min(1).optional(),
      includeUser: z.boolean().optional(),
      limit: z.number().int().positive().optional(),
    },
  },
  {
    name: "reindex_memory",
    description: "Reindex all memory chunks for a project and optional user scope into the active vector backend.",
    inputSchema: {
      organizationId: z.string().min(1),
      projectKey: z.string().min(1),
      userScopeId: z.string().min(1).optional(),
    },
  },
  {
    name: "compact_memory",
    description: "Preview or apply conservative memory compaction heuristics.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      projectKey: z.string().min(1).optional(),
      scope: z.enum(["project", "user"]).optional(),
      userScopeId: z.string().min(1).optional(),
      dryRun: z.boolean().optional(),
      limit: z.number().int().positive().max(5000).optional(),
      decayThreshold: z.number().nonnegative().optional(),
      halfLifeDays: z.number().positive().optional(),
      semanticDedupThreshold: z.number().positive().max(1).optional(),
    },
  },
  {
    name: "unarchive_memory",
    description: "Restore one or more archived memory records back to active canonical storage.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      archiveIds: z.array(z.number().int()),
    },
  },
  {
    name: "list_audit_log",
    description: "Return recent audit log entries scoped to a single organization.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      limit: z.number().int().positive().max(1000).optional(),
    },
  },
] as const satisfies readonly ToolDescriptor[];

export const TOOL_ROUTES = [
  { name: "add_memory", method: "POST", path: "/v1/memory" },
  { name: "search_memory", method: "POST", path: "/v1/memory/search" },
  { name: "build_context_pack", method: "POST", path: "/v1/memory/context-pack" },
  { name: "reindex_memory", method: "POST", path: "/v1/memory/reindex" },
  { name: "compact_memory", method: "POST", path: "/v1/memory/compact" },
  { name: "list_audit_log", method: "POST", path: "/v1/audit/list" },
  { name: "unarchive_memory", method: "POST", path: "/v1/memory/unarchive" },
] as const satisfies readonly ToolRoute[];

export function descriptorForTool(name: ToolName): ToolDescriptor {
  const descriptor = TOOL_DESCRIPTORS.find((entry) => entry.name === name);
  if (!descriptor) {
    throw new Error(`No tool descriptor registered for ${name}`);
  }
  return descriptor;
}

function addProjectKeyRequiredIssue(ctx: z.RefinementCtx, toolName: ToolName): void {
  ctx.addIssue({
    code: "custom",
    path: ["projectKey"],
    message: `projectKey is required for default/project-scope ${toolName}`,
  });
}

function scopeRequiresProjectKey(input: {
  readonly scope?: unknown;
  readonly projectKey?: unknown;
}): boolean {
  return input.scope !== "user" && typeof input.projectKey !== "string";
}

function validationSchemaForTool(toolName: ToolName): z.ZodType<Record<string, unknown>> {
  const schema = z.object(descriptorForTool(toolName).inputSchema);

  if (toolName === "add_memory" || toolName === "compact_memory") {
    return schema.superRefine((input, ctx) => {
      if (scopeRequiresProjectKey(input)) {
        addProjectKeyRequiredIssue(ctx, toolName);
      }
    }) as z.ZodType<Record<string, unknown>>;
  }

  return schema as z.ZodType<Record<string, unknown>>;
}

export function validateToolInput(
  toolName: ToolName,
  input: Record<string, unknown>,
): ToolInputValidation {
  const schema = validationSchemaForTool(toolName);
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return { ok: true, data: parsed.data as Record<string, unknown> };
  }

  const issue = parsed.error.issues[0];
  const path = issue?.path.length ? issue.path.join(".") : "body";
  const reason = issue?.message ?? "invalid value";
  return {
    ok: false,
    message: `invalid request body for ${toolName}: ${path}: ${reason}`,
  };
}
