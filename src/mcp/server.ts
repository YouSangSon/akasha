import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ElicitRequestFormParams } from "@modelcontextprotocol/sdk/types.js";
import { pathToFileURL } from "node:url";
import * as z from "zod/v4";
import {
  MCP_CONTEXT_TOOL_DESCRIPTORS,
  SERVICE_TOOL_DESCRIPTORS,
  nonBlankTextInputSchema,
} from "./tool-schemas.js";
import { createToolRegistry } from "./tool-registry.js";
import { SUPPORTED_MEMORY_KINDS } from "./tool-utils.js";
import type {
  AddMemoryInteractiveToolInput,
  ClassifyMemoryCandidateToolInput,
  CreateMcpServerOptions,
  McpToolAuthorizer,
  ToolRegistry,
} from "./types.js";

export { createToolRegistry } from "./tool-registry.js";
export type {
  AddMemoryToolInput,
  AddMemoryToolResult,
  AuditLogEntryView,
  BuildContextPackToolInput,
  BuildContextPackToolResult,
  CanonicalServices,
  CompactMemoryToolInput,
  CompactMemoryToolResult,
  CreateMcpServerOptions,
  CreateToolRegistryOptions,
  DeleteMemoryToolInput,
  DeleteMemoryToolResult,
  ListMemoryToolInput,
  ListMemoryToolResult,
  ListAuditLogToolInput,
  ListAuditLogToolResult,
  ReindexMemoryToolInput,
  ReindexMemoryToolResult,
  RetrieveMemoryServiceInput,
  RetrieveMemoryService,
  SearchMemoryToolInput,
  SearchMemoryToolResult,
  TagMemoryToolInput,
  TagMemoryToolResult,
  ToolRegistry,
  UnarchiveMemoryToolInput,
  UnarchiveMemoryToolResult,
  UpdateMemoryToolInput,
  UpdateMemoryToolResult,
} from "./types.js";

const ELICITED_MEMORY_SCHEMA = z.object({
  projectKey: z.string().min(1).optional(),
  kind: z.enum(SUPPORTED_MEMORY_KINDS).optional(),
  content: nonBlankTextInputSchema,
});

const MEMORY_CLASSIFICATION_SCHEMA = z.object({
  kind: z.enum(SUPPORTED_MEMORY_KINDS),
  summary: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
});

export function createMcpServer(
  options: CreateMcpServerOptions = {},
): McpServer {
  const registry =
    options.registry ??
    createToolRegistry({
      cwd: options.cwd,
      repository: options.repository,
      projectRepository: options.projectRepository,
      userRepository: options.userRepository,
      resolveRepository: options.resolveRepository,
      resolveCanonicalServices: options.resolveCanonicalServices,
      withCanonicalServices: options.withCanonicalServices,
      defaultUserScopeId: options.defaultUserScopeId,
      retrieveMemory: options.retrieveMemory,
      logger: options.logger,
      auditLog: options.auditLog,
      defaultActor: options.defaultActor,
    });

  const server = new McpServer({
    name: "developer-memory-os",
    version: "0.1.0",
  });

  for (const descriptor of SERVICE_TOOL_DESCRIPTORS) {
    server.registerTool(
      descriptor.name,
      {
        description: descriptor.description,
        inputSchema: descriptor.inputSchema,
        outputSchema: descriptor.outputSchema,
      },
      async (input: Record<string, unknown>) => {
        const handler = registry[descriptor.name] as (
          toolInput: typeof input,
        ) => Promise<unknown>;
        return toToolResult(await handler(input));
      },
    );
  }

  registerMcpContextTools(server, registry, options.authorizeTool);
  registerAkashaResources(server, registry);
  registerAkashaPrompts(server, registry);

  return server;
}

export async function startStdioServer(options: CreateMcpServerOptions = {}) {
  const server = createMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}

function toToolResult(result: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
    structuredContent: result as Record<string, unknown>,
  };
}

function registerMcpContextTools(
  server: McpServer,
  registry: ToolRegistry,
  authorizeTool?: McpToolAuthorizer,
): void {
  const listRootsDescriptor = descriptorByName("list_workspace_roots");
  server.registerTool(
    listRootsDescriptor.name,
    {
      description: listRootsDescriptor.description,
      inputSchema: listRootsDescriptor.inputSchema,
      outputSchema: listRootsDescriptor.outputSchema,
    },
    async (input: Record<string, unknown>) => {
      await authorizeTool?.({
        toolName: "list_workspace_roots",
        input,
      });

      if (!server.server.getClientCapabilities()?.roots) {
        return toToolResult({
          ok: true,
          supported: false,
          roots: [],
          message: "Connected MCP client did not advertise roots support.",
        });
      }

      const result = await server.server.listRoots();
      return toToolResult({
        ok: true,
        supported: true,
        roots: result.roots.map((root) => ({
          uri: root.uri,
          ...(root.name ? { name: root.name } : {}),
        })),
      });
    },
  );

  const interactiveDescriptor = descriptorByName("add_memory_interactive");
  server.registerTool(
    interactiveDescriptor.name,
    {
      description: interactiveDescriptor.description,
      inputSchema: interactiveDescriptor.inputSchema,
      outputSchema: interactiveDescriptor.outputSchema,
    },
    async (input: AddMemoryInteractiveToolInput & Record<string, unknown>) => {
      await authorizeTool?.({
        toolName: "add_memory_interactive",
        input,
      });

      if (!server.server.getClientCapabilities()?.elicitation) {
        return toToolResult({
          ok: true,
          action: "unsupported",
          stored: false,
          message:
            "Connected MCP client did not advertise elicitation support.",
        });
      }

      const elicited = await server.server.elicitInput({
        mode: "form",
        message:
          input.message ??
          "Provide the memory Akasha should store for future agent sessions.",
        requestedSchema: buildMemoryElicitationSchema(input),
      });

      if (elicited.action !== "accept") {
        return toToolResult({
          ok: true,
          action: elicited.action,
          stored: false,
        });
      }

      const parsed = ELICITED_MEMORY_SCHEMA.parse(elicited.content ?? {});
      const projectKey = input.projectKey ?? parsed.projectKey;
      const kind = input.kind ?? parsed.kind;
      if (input.scope !== "user" && !projectKey) {
        throw new Error("projectKey is required to store project memory.");
      }
      if (!kind) {
        throw new Error("kind is required to store memory.");
      }

      const stored = await registry.add_memory({
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        ...(projectKey ? { projectKey } : {}),
        ...(input.scope ? { scope: input.scope } : {}),
        ...(input.userScopeId ? { userScopeId: input.userScopeId } : {}),
        kind,
        content: parsed.content,
      });

      return toToolResult({
        ok: true,
        action: "accept",
        stored: true,
        memoryId: stored.memoryId,
        summary: stored.summary,
        collected: {
          ...(projectKey ? { projectKey } : {}),
          kind,
          content: parsed.content,
        },
      });
    },
  );

  const classifyDescriptor = descriptorByName("classify_memory_candidate");
  server.registerTool(
    classifyDescriptor.name,
    {
      description: classifyDescriptor.description,
      inputSchema: classifyDescriptor.inputSchema,
      outputSchema: classifyDescriptor.outputSchema,
    },
    async (input: ClassifyMemoryCandidateToolInput & Record<string, unknown>) => {
      await authorizeTool?.({
        toolName: "classify_memory_candidate",
        input,
      });

      if (!server.server.getClientCapabilities()?.sampling) {
        return toToolResult({
          ok: true,
          supported: false,
          message: "Connected MCP client did not advertise sampling support.",
        });
      }

      const response = await server.server.createMessage({
        systemPrompt:
          "You classify candidate Akasha memory. Return only compact JSON.",
        includeContext: "none",
        maxTokens: input.maxTokens ?? 300,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: buildMemoryClassificationPrompt(input),
            },
          },
        ],
      });
      const rawText = extractTextContent(response.content);
      const classification = MEMORY_CLASSIFICATION_SCHEMA.parse(
        parseJsonObjectFromText(rawText),
      );

      return toToolResult({
        ok: true,
        supported: true,
        classification,
        model: response.model,
        rawText,
      });
    },
  );
}

function descriptorByName(
  name:
    | "list_workspace_roots"
    | "add_memory_interactive"
    | "classify_memory_candidate",
) {
  const descriptor = MCP_CONTEXT_TOOL_DESCRIPTORS.find(
    (candidate) => candidate.name === name,
  );
  if (!descriptor) {
    throw new Error(`Missing MCP context tool descriptor: ${name}`);
  }
  return descriptor;
}

function buildMemoryClassificationPrompt(
  input: ClassifyMemoryCandidateToolInput,
): string {
  return [
    "Classify the candidate memory for a persistent coding-agent memory store.",
    "Return JSON only, with this shape:",
    '{"kind":"decision|summary|fact","summary":"one concise sentence","confidence":0.0}',
    "Rules:",
    "- kind must be exactly one of decision, summary, fact.",
    "- summary must preserve operational identifiers, file paths, env vars, and dates.",
    "- confidence is optional but, if present, must be between 0 and 1.",
    input.instruction ? `Additional instruction: ${input.instruction}` : "",
    "",
    "Candidate memory:",
    input.content,
  ].filter(Boolean).join("\n");
}

function extractTextContent(content: unknown): string {
  if (
    typeof content === "object" &&
    content !== null &&
    "type" in content &&
    content.type === "text" &&
    "text" in content &&
    typeof content.text === "string"
  ) {
    return content.text;
  }

  throw new Error("sampling response did not contain text content");
}

function parseJsonObjectFromText(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]);
    }

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("sampling response did not contain a valid JSON object");
  }
}

function buildMemoryElicitationSchema(
  input: AddMemoryInteractiveToolInput,
): ElicitRequestFormParams["requestedSchema"] {
  const properties: ElicitRequestFormParams["requestedSchema"]["properties"] = {
    content: {
      type: "string",
      title: "Memory",
      description: "Durable memory content to store in Akasha.",
      minLength: 1,
    },
  };
  const required = ["content"];

  if (input.scope !== "user" && !input.projectKey) {
    properties.projectKey = {
      type: "string",
      title: "Project key",
      description: "Project scope where this memory should be stored.",
      minLength: 1,
    };
    required.push("projectKey");
  }

  if (!input.kind) {
    properties.kind = {
      type: "string",
      title: "Memory kind",
      description: "Type of memory to store.",
      enum: [...SUPPORTED_MEMORY_KINDS],
      default: "fact",
    };
    required.push("kind");
  }

  return {
    type: "object",
    properties,
    required,
  };
}

function registerAkashaResources(server: McpServer, registry: ToolRegistry): void {
  server.registerResource(
    "recent-project-memory",
    new ResourceTemplate("akasha://memory/recent/{projectKey}", { list: undefined }),
    {
      title: "Recent Project Memory",
      description:
        "Search recent Akasha memory for a project. Query params: organizationId, query, limit.",
      mimeType: "application/json",
    },
    async (uri) => {
      const resourceUrl = parseResourceUrl(uri);
      const projectKey = getPathSegment(resourceUrl, 1, "projectKey");
      const query = parseRecentMemoryQuery(resourceUrl);
      const organizationId = parseOptionalNonEmptySearchParam(
        resourceUrl,
        "organizationId",
      );
      const limit = parseOptionalPositiveInteger(
        resourceUrl.searchParams.get("limit"),
        "limit",
      );
      const result = await registry.search_memory({
        ...(organizationId ? { organizationId } : {}),
        projectKey,
        query,
        ...(limit === undefined ? {} : { limit }),
      });

      return {
        contents: [
          {
            uri: resourceUrl.href,
            mimeType: "application/json",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "context-pack",
    new ResourceTemplate("akasha://context-pack/{projectKey}/{task}", { list: undefined }),
    {
      title: "Context Pack",
      description: "Build an Akasha context pack. Query params: organizationId, limit.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const resourceUrl = parseResourceUrl(uri);
      const projectKey = getPathSegment(resourceUrl, 0, "projectKey");
      const task = getPathSegment(resourceUrl, 1, "task");
      const organizationId = parseOptionalNonEmptySearchParam(
        resourceUrl,
        "organizationId",
      );
      const limit = parseOptionalPositiveInteger(
        resourceUrl.searchParams.get("limit"),
        "limit",
      );
      const result = await registry.build_context_pack({
        ...(organizationId ? { organizationId } : {}),
        projectKey,
        task,
        ...(limit === undefined ? {} : { limit }),
      });

      return {
        contents: [
          {
            uri: resourceUrl.href,
            mimeType: "text/markdown",
            text: result.packMarkdown,
          },
        ],
      };
    },
  );
}

function parseResourceUrl(uri: URL | { href: string }): URL {
  return uri instanceof URL ? uri : new URL(uri.href);
}

function getPathSegment(resourceUrl: URL, index: number, label: string): string {
  const segments = resourceUrl.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
  const value = segments[index];
  if (!value) {
    throw new Error(`Missing required ${label} resource path segment.`);
  }
  return value;
}

function parseRecentMemoryQuery(resourceUrl: URL): string {
  const query = resourceUrl.searchParams.get("query");
  if (query === null) {
    return "recent decisions constraints open questions";
  }
  if (query.length === 0) {
    throw new Error("Query must be a non-empty string when provided.");
  }
  return query;
}

function parseOptionalNonEmptySearchParam(
  resourceUrl: URL,
  label: string,
): string | undefined {
  const rawValue = resourceUrl.searchParams.get(label);
  if (rawValue === null) {
    return undefined;
  }
  if (rawValue.length === 0) {
    throw new Error(`${label} must be a non-empty string when provided.`);
  }
  return rawValue;
}

function parseOptionalPositiveInteger(
  rawValue: string | null,
  label: string,
): number | undefined {
  if (rawValue === null) {
    return undefined;
  }
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${label} must be a positive integer when provided.`);
  }
  const parsedValue = Number(rawValue);
  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${label} must be a positive integer when provided.`);
  }
  return parsedValue;
}

function registerAkashaPrompts(server: McpServer, registry: ToolRegistry): void {
  server.registerPrompt(
    "akasha_session_start",
    {
      title: "Akasha Session Start",
      description: "Build a project context pack for the start of an agent session.",
      argsSchema: {
        organizationId: z.string().min(1).optional(),
        projectKey: z.string().min(1),
        task: z.string().min(1),
        limit: z.number().int().positive().optional(),
      },
    },
    async ({ organizationId, projectKey, task, limit }) => {
      const pack = await registry.build_context_pack({
        ...(organizationId ? { organizationId } : {}),
        projectKey,
        task,
        ...(limit ? { limit } : {}),
      });

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `${pack.packMarkdown}\n\nUse this Akasha context while working on: ${task}`,
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "akasha_store_memory",
    {
      title: "Akasha Store Memory",
      description: "Template for asking an agent to store durable project memory in Akasha.",
      argsSchema: {
        projectKey: z.string().min(1),
        kind: z.string().min(1),
        content: nonBlankTextInputSchema,
      },
    },
    async ({ projectKey, kind, content }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Store this durable Akasha memory for project "${projectKey}" ` +
              `as kind "${kind}":\n\n${content}`,
          },
        },
      ],
    }),
  );
}

async function main() {
  const cwd = process.env.DMO_CWD ?? process.cwd();
  await startStdioServer({ cwd });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
