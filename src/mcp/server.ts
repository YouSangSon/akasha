import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import * as z from "zod/v4";
import { TOOL_DESCRIPTORS } from "./tool-schemas.js";
import { createToolRegistry } from "./tool-registry.js";
import type { CreateMcpServerOptions, ToolRegistry } from "./types.js";

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
  ListAuditLogToolInput,
  ListAuditLogToolResult,
  ReindexMemoryToolInput,
  ReindexMemoryToolResult,
  RetrieveMemoryServiceInput,
  RetrieveMemoryService,
  SearchMemoryToolInput,
  SearchMemoryToolResult,
  ToolRegistry,
  UnarchiveMemoryToolInput,
  UnarchiveMemoryToolResult,
} from "./types.js";

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

  for (const descriptor of TOOL_DESCRIPTORS) {
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
        content: z.string().min(1),
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
