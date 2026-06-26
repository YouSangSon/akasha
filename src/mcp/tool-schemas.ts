import * as z from "zod/v4";
import { SUPPORTED_MEMORY_KINDS } from "./tool-utils.js";

export type ToolDescriptor = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, z.ZodTypeAny>;
  readonly outputSchema: Record<string, z.ZodTypeAny>;
};

export type ToolName = (typeof TOOL_DESCRIPTORS)[number]["name"];
export type ServiceToolName = (typeof SERVICE_TOOL_DESCRIPTORS)[number]["name"];

export type ToolRoute = {
  readonly name: ServiceToolName;
  readonly method: "POST";
  readonly path: string;
};

export type ToolInputValidation =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; message: string };

const memoryRecordOutputSchema = z
  .object({
    id: z.number(),
    organizationId: z.string().optional(),
    sourceId: z.number().optional(),
    scopeType: z.string(),
    scopeId: z.string(),
    memoryType: z.string(),
    content: z.string(),
    summary: z.string().nullable().optional(),
    durability: z.string().optional(),
    importance: z.number().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    source: z.object({}).passthrough().optional(),
  })
  .passthrough();

const contextPackSectionsOutputSchema = z.object({
  project_summary: z.array(memoryRecordOutputSchema),
  recent_decisions: z.array(memoryRecordOutputSchema),
  constraints: z.array(memoryRecordOutputSchema),
  open_questions: z.array(memoryRecordOutputSchema),
  relevant_notes: z.array(memoryRecordOutputSchema),
});

const duplicateGroupOutputSchema = z
  .object({
    keepId: z.string(),
    archiveIds: z.array(z.string()),
  })
  .passthrough();

const decayCandidateOutputSchema = z
  .object({
    id: z.string(),
    score: z.number(),
  })
  .passthrough();

const compactionApplyStatsOutputSchema = z.object({
  archived: z.number(),
  skipped: z.number(),
  qdrantPointsDeleted: z.number(),
  qdrantPointsPending: z.number(),
  durationMs: z.number(),
});

const archiveOutcomeOutputSchema = z.union([
  z.object({
    archiveId: z.number(),
    status: z.literal("restored"),
    restoredRecordId: z.number(),
    sourceRecordId: z.number(),
    chunkCount: z.number(),
  }),
  z.object({
    archiveId: z.number(),
    status: z.literal("skipped"),
    reason: z.string(),
  }),
  z.object({
    archiveId: z.number(),
    status: z.literal("failed"),
    error: z.string(),
  }),
]);

const workspaceRootOutputSchema = z
  .object({
    uri: z.string(),
    name: z.string().optional(),
  })
  .passthrough();

const elicitedMemoryOutputSchema = z
  .object({
    projectKey: z.string().optional(),
    kind: z.string().optional(),
    content: z.string().optional(),
  })
  .passthrough();

const sampledMemoryClassificationOutputSchema = z
  .object({
    kind: z.enum(SUPPORTED_MEMORY_KINDS),
    summary: z.string(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .passthrough();

export const SERVICE_TOOL_DESCRIPTORS = [
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
    outputSchema: {
      ok: z.literal(true),
      memoryId: z.string(),
      summary: z.string(),
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
    outputSchema: {
      ok: z.literal(true),
      projectKey: z.string(),
      query: z.string(),
      results: z.array(memoryRecordOutputSchema),
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
    outputSchema: {
      ok: z.literal(true),
      projectKey: z.string(),
      packMarkdown: z.string(),
      selectedMemoryIds: z.array(z.string()),
      sections: contextPackSectionsOutputSchema,
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
    outputSchema: {
      ok: z.literal(true),
      projectKey: z.string(),
      scopes: z.array(z.string()),
      chunkCount: z.number(),
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
    outputSchema: {
      ok: z.literal(true),
      projectKey: z.string(),
      dryRun: z.boolean(),
      archivedIds: z.array(z.string()),
      mergedIds: z.array(z.string()),
      duplicateGroups: z.array(duplicateGroupOutputSchema),
      decayCandidates: z.array(decayCandidateOutputSchema),
      promotionCandidates: z.array(z.string()),
      summary: z.string(),
      compactionRunId: z.string().optional(),
      applyStats: compactionApplyStatsOutputSchema.optional(),
    },
  },
  {
    name: "unarchive_memory",
    description: "Restore one or more archived memory records back to active canonical storage.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      archiveIds: z.array(z.number().int()),
    },
    outputSchema: {
      ok: z.literal(true),
      outcomes: z.array(archiveOutcomeOutputSchema),
      restoredCount: z.number(),
      skippedCount: z.number(),
      failedCount: z.number(),
    },
  },
  {
    name: "list_audit_log",
    description: "Return recent audit log entries scoped to a single organization.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      limit: z.number().int().positive().max(1000).optional(),
    },
    outputSchema: {
      ok: z.literal(true),
      organizationId: z.string(),
      entries: z.array(z.object({}).passthrough()),
    },
  },
] as const satisfies readonly ToolDescriptor[];

export const MCP_CONTEXT_TOOL_DESCRIPTORS = [
  {
    name: "list_workspace_roots",
    description:
      "List workspace roots advertised by the connected MCP client, when supported.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
    },
    outputSchema: {
      ok: z.literal(true),
      supported: z.boolean(),
      roots: z.array(workspaceRootOutputSchema),
      message: z.string().optional(),
    },
  },
  {
    name: "add_memory_interactive",
    description:
      "Use MCP elicitation to ask the user for memory details, then store the accepted memory.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      projectKey: z.string().min(1).optional(),
      scope: z.enum(["project", "user"]).optional(),
      userScopeId: z.string().min(1).optional(),
      kind: z.enum(SUPPORTED_MEMORY_KINDS).optional(),
      message: z.string().min(1).optional(),
    },
    outputSchema: {
      ok: z.literal(true),
      action: z.enum(["accept", "decline", "cancel", "unsupported"]),
      stored: z.boolean(),
      memoryId: z.string().optional(),
      summary: z.string().optional(),
      collected: elicitedMemoryOutputSchema.optional(),
      message: z.string().optional(),
    },
  },
  {
    name: "classify_memory_candidate",
    description:
      "Use MCP sampling to suggest a memory kind and concise summary for candidate memory text.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      content: z.string().min(1),
      instruction: z.string().min(1).optional(),
      maxTokens: z.number().int().positive().max(1000).optional(),
    },
    outputSchema: {
      ok: z.literal(true),
      supported: z.boolean(),
      classification: sampledMemoryClassificationOutputSchema.optional(),
      model: z.string().optional(),
      rawText: z.string().optional(),
      message: z.string().optional(),
    },
  },
] as const satisfies readonly ToolDescriptor[];

export const TOOL_DESCRIPTORS = [
  ...SERVICE_TOOL_DESCRIPTORS,
  ...MCP_CONTEXT_TOOL_DESCRIPTORS,
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
