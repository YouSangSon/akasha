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
    title: z.string().nullable().optional(),
    content: z.string(),
    summary: z.string().nullable().optional(),
    durability: z.string().optional(),
    importance: z.number().optional(),
    tags: z.array(z.string()).optional(),
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

const contextPackSelectionRationaleOutputSchema = z.object({
  memoryId: z.string(),
  recordId: z.number(),
  section: z.enum([
    "project_summary",
    "recent_decisions",
    "constraints",
    "open_questions",
    "relevant_notes",
  ]),
  reason: z.enum([
    "project-summary",
    "decision-memory-or-source",
    "constraint-prefix",
    "open-question-prefix",
    "fallback-relevant-note",
  ]),
  inputRank: z.number(),
  scopeType: z.enum(["project", "user"]),
  scopeId: z.string(),
  sourceType: z.enum(["decision", "document", "conversation"]),
  sourceTitle: z.string().nullable(),
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

const entityKindInputSchema = z.enum([
  "code_symbol",
  "path",
  "url",
  "date",
  "proper_noun",
]);

const memoryGraphEntityRefOutputSchema = z.object({
  id: z.number(),
  kind: entityKindInputSchema,
  normalized: z.string(),
  displayText: z.string(),
});

const memoryGraphEntityOutputSchema = memoryGraphEntityRefOutputSchema.extend({
  organizationId: z.string().optional(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  mentionCount: z.number(),
  memoryIds: z.array(z.number()),
});

const memoryGraphRelationshipOutputSchema = z.object({
  id: z.number(),
  organizationId: z.string().optional(),
  fromEntityId: z.number(),
  toEntityId: z.number(),
  fromEntity: memoryGraphEntityRefOutputSchema,
  toEntity: memoryGraphEntityRefOutputSchema,
  relationType: z.string(),
  evidenceMemoryRecordId: z.number(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  confidence: z.number(),
  createdAt: z.string(),
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

const durabilityInputSchema = z.enum(["ephemeral", "durable", "archived"]);

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
      selectionRationale: z.array(contextPackSelectionRationaleOutputSchema),
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
    name: "list_memory",
    description:
      "List memory records for governance review with optional tag and archived filters.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      projectKey: z.string().min(1).optional(),
      scope: z.enum(["project", "user"]).optional(),
      userScopeId: z.string().min(1).optional(),
      includeArchived: z.boolean().optional(),
      tag: z.string().min(1).optional(),
      limit: z.number().int().positive().max(5000).optional(),
    },
    outputSchema: {
      ok: z.literal(true),
      scopeType: z.enum(["project", "user"]),
      scopeId: z.string(),
      memories: z.array(memoryRecordOutputSchema),
    },
  },
  {
    name: "inspect_memory_graph",
    description:
      "Inspect persisted entity mentions and relationships for one scoped memory graph.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      projectKey: z.string().min(1).optional(),
      scope: z.enum(["project", "user"]).optional(),
      userScopeId: z.string().min(1).optional(),
      kind: entityKindInputSchema.optional(),
      query: z.string().min(1).optional(),
      includeArchived: z.boolean().optional(),
      limit: z.number().int().positive().max(5000).optional(),
      relationshipLimit: z.number().int().positive().max(5000).optional(),
    },
    outputSchema: {
      ok: z.literal(true),
      scopeType: z.enum(["project", "user"]),
      scopeId: z.string(),
      entities: z.array(memoryGraphEntityOutputSchema),
      relationships: z.array(memoryGraphRelationshipOutputSchema),
    },
  },
  {
    name: "update_memory",
    description:
      "Update one memory record through governance controls and refresh its vector index state.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      memoryId: z.number().int().positive(),
      kind: z.enum(SUPPORTED_MEMORY_KINDS).optional(),
      title: z.string().nullable().optional(),
      content: z.string().min(1).optional(),
      summary: z.string().nullable().optional(),
      importance: z.number().int().optional(),
      durability: durabilityInputSchema.optional(),
      tags: z.array(z.string()).optional(),
    },
    outputSchema: {
      ok: z.literal(true),
      updated: z.boolean(),
      memory: memoryRecordOutputSchema.optional(),
    },
  },
  {
    name: "delete_memory",
    description:
      "Archive one memory record for governance deletion and remove its vector points.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      memoryId: z.number().int().positive(),
    },
    outputSchema: {
      ok: z.literal(true),
      archived: z.boolean(),
      qdrantPointsDeleted: z.number().int().nonnegative(),
      qdrantPointsPending: z.number().int().nonnegative(),
    },
  },
  {
    name: "tag_memory",
    description:
      "Replace normalized governance tags on one memory record and refresh its vector index state.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      memoryId: z.number().int().positive(),
      tags: z.array(z.string()),
    },
    outputSchema: {
      ok: z.literal(true),
      updated: z.boolean(),
      memory: memoryRecordOutputSchema.optional(),
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
  {
    name: "start_goal_run",
    description:
      "Start a goal run: a persistent objective plus termination criteria the agent iterates toward.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      scope: z.enum(["project", "user"]).optional(),
      projectKey: z.string().min(1).optional(),
      userScopeId: z.string().min(1).optional(),
      goal: z.string().min(1),
      terminationCriteria: z.string().nullable().optional(),
    },
    outputSchema: {
      ok: z.literal(true),
      goalRun: z.object({}).passthrough(),
    },
  },
  {
    name: "record_iteration",
    description:
      "Record one iteration of a goal run (attempt + outcome) and optionally link memories to the run.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      goalRunId: z.number().int().positive(),
      attempt: z.string().min(1),
      outcome: z.enum(["success", "failure", "partial"]),
      summary: z.string().nullable().optional(),
      error: z.string().nullable().optional(),
      memoryIds: z.array(z.number().int().positive()).optional(),
    },
    outputSchema: {
      ok: z.literal(true),
      iteration: z.object({}).passthrough(),
    },
  },
  {
    name: "get_goal_run",
    description:
      "Fetch a goal run with its ordered iterations, for continuity and termination evidence.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      goalRunId: z.number().int().positive(),
    },
    outputSchema: {
      ok: z.literal(true),
      goalRun: z.object({}).passthrough().nullable(),
    },
  },
  {
    name: "list_goal_runs",
    description: "List goal runs for a scope, optionally filtered by status.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      scope: z.enum(["project", "user"]).optional(),
      projectKey: z.string().min(1).optional(),
      userScopeId: z.string().min(1).optional(),
      status: z.enum(["active", "completed", "abandoned"]).optional(),
    },
    outputSchema: {
      ok: z.literal(true),
      goalRuns: z.array(z.object({}).passthrough()),
    },
  },
  {
    name: "complete_goal_run",
    description:
      "Mark a goal run completed; its memories become eligible for compaction again.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      goalRunId: z.number().int().positive(),
      resolution: z.string().nullable().optional(),
    },
    outputSchema: {
      ok: z.literal(true),
      goalRun: z.object({}).passthrough(),
    },
  },
  {
    name: "abandon_goal_run",
    description:
      "Mark a goal run abandoned; its memories become eligible for compaction again.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      goalRunId: z.number().int().positive(),
      reason: z.string().nullable().optional(),
    },
    outputSchema: {
      ok: z.literal(true),
      goalRun: z.object({}).passthrough(),
    },
  },
  {
    name: "build_goal_context",
    description:
      "Build a compact, goal-oriented context pack for one goal run: goal, termination criteria, recent iterations, last error, and scope constraints/notes.",
    inputSchema: {
      organizationId: z.string().min(1).optional(),
      goalRunId: z.number().int().positive(),
      limit: z.number().int().positive().max(200).optional(),
    },
    outputSchema: {
      ok: z.literal(true),
      found: z.boolean(),
      goalRunId: z.number(),
      packMarkdown: z.string(),
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
  { name: "list_memory", method: "POST", path: "/v1/memory/list" },
  { name: "inspect_memory_graph", method: "POST", path: "/v1/memory/graph" },
  { name: "update_memory", method: "POST", path: "/v1/memory/update" },
  { name: "delete_memory", method: "POST", path: "/v1/memory/delete" },
  { name: "tag_memory", method: "POST", path: "/v1/memory/tag" },
  { name: "list_audit_log", method: "POST", path: "/v1/audit/list" },
  { name: "unarchive_memory", method: "POST", path: "/v1/memory/unarchive" },
  { name: "start_goal_run", method: "POST", path: "/v1/goal-run/start" },
  { name: "record_iteration", method: "POST", path: "/v1/goal-run/iteration" },
  { name: "get_goal_run", method: "POST", path: "/v1/goal-run/get" },
  { name: "list_goal_runs", method: "POST", path: "/v1/goal-run/list" },
  { name: "complete_goal_run", method: "POST", path: "/v1/goal-run/complete" },
  { name: "abandon_goal_run", method: "POST", path: "/v1/goal-run/abandon" },
  { name: "build_goal_context", method: "POST", path: "/v1/goal-run/context" },
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

  if (
    toolName === "add_memory" ||
    toolName === "compact_memory" ||
    toolName === "list_memory" ||
    toolName === "inspect_memory_graph"
  ) {
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
