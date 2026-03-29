import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type Database from "better-sqlite3";
import { pathToFileURL } from "node:url";
import * as z from "zod/v4";
import {
  buildContextPack,
  type ContextPackSections,
} from "../context-pack/build-context-pack.js";
import { resolveProjectPaths } from "../config.js";
import { createMemoryDb } from "../db/connection.js";
import { runMigrations } from "../db/migrate.js";
import { createMemoryRepository } from "../store/memory-repository.js";
import type {
  AddMemoryInput,
  MemoryRepository,
  SearchMemoryInput,
  SearchMemoryResult,
} from "../types.js";

const SCOPE_TYPES = ["user", "project"] as const;
const MEMORY_TYPES = ["decision", "fact", "summary"] as const;
const SOURCE_TYPES = ["decision", "document", "conversation"] as const;

export type BuildContextPackToolInput = {
  projectKey: string;
  task: string;
  limit?: number;
};

export type BuildContextPackToolResult = {
  ok: true;
  projectKey: string;
  packMarkdown: string;
  selectedMemoryIds: string[];
  sections: ContextPackSections;
};

export type CompactMemoryToolInput = {
  projectKey: string;
  dryRun?: boolean;
};

export type CompactMemoryToolResult = {
  ok: true;
  projectKey: string;
  dryRun: boolean;
  archivedIds: string[];
  mergedIds: string[];
  promotionCandidates: string[];
  summary: string;
};

export type ToolRegistry = {
  add_memory(input: AddMemoryInput): SearchMemoryResult;
  search_memory(input: SearchMemoryInput): SearchMemoryResult[];
  build_context_pack(input: BuildContextPackToolInput): BuildContextPackToolResult;
  compact_memory(input: CompactMemoryToolInput): CompactMemoryToolResult;
};

export type CreateToolRegistryOptions = {
  repository?: MemoryRepository;
};

export type ProjectRuntime = {
  db: Database.Database;
  repository: MemoryRepository;
  close(): void;
};

export type ProjectRuntimeInput = {
  cwd: string;
  projectKey: string;
};

export type CreateMcpServerOptions = CreateToolRegistryOptions & {
  registry?: ToolRegistry;
};

export function createProjectRuntime(
  input: ProjectRuntimeInput,
): ProjectRuntime {
  const paths = resolveProjectPaths(input);
  const db = createMemoryDb(paths.dbPath);
  runMigrations(db);

  return {
    db,
    repository: createMemoryRepository(db),
    close() {
      db.close();
    },
  };
}

export function createToolRegistry(
  options: CreateToolRegistryOptions = {},
): ToolRegistry {
  const repository = options.repository;

  function requireRepository(): MemoryRepository {
    if (!repository) {
      throw new Error("Memory repository not configured");
    }

    return repository;
  }

  return {
    add_memory(input) {
      return requireRepository().addMemory(input);
    },

    search_memory(input) {
      return requireRepository().searchMemory(input);
    },

    build_context_pack(input) {
      const records = requireRepository().searchMemory({
        query: input.task,
        scopes: [
          {
            scopeType: "project",
            scopeId: input.projectKey,
          },
        ],
        limit: input.limit,
      });
      const pack = buildContextPack({ records });

      return {
        ok: true,
        projectKey: input.projectKey,
        packMarkdown: renderContextPackMarkdown(input.task, pack.markdown),
        selectedMemoryIds: records.map((record) => String(record.id)),
        sections: pack.sections,
      };
    },

    compact_memory(input) {
      const dryRun = input.dryRun ?? true;
      const records = requireRepository().searchMemory({
        query: input.projectKey,
        scopes: [
          {
            scopeType: "project",
            scopeId: input.projectKey,
          },
        ],
        limit: 100,
      });

      return {
        ok: true,
        projectKey: input.projectKey,
        dryRun,
        archivedIds: [],
        mergedIds: [],
        promotionCandidates: records
          .filter((record) => shouldPromoteRecord(record))
          .map((record) => String(record.id)),
        summary: `${dryRun ? "Dry run" : "Applied"} compaction for ${input.projectKey}`,
      };
    },
  };
}

export function createMcpServer(
  options: CreateMcpServerOptions = {},
): McpServer {
  const registry =
    options.registry ?? createToolRegistry({ repository: options.repository });

  const server = new McpServer({
    name: "developer-memory-os",
    version: "0.1.0",
  });

  server.registerTool(
    "add_memory",
    {
      description: "Persist a memory record for a project or user scope.",
      inputSchema: {
        scopeType: z.enum(SCOPE_TYPES),
        scopeId: z.string().min(1),
        memoryType: z.enum(MEMORY_TYPES),
        content: z.string().min(1),
        source: z.object({
          scopeType: z.enum(SCOPE_TYPES),
          scopeId: z.string().min(1),
          sourceType: z.enum(SOURCE_TYPES),
          externalId: z.string().min(1),
          title: z.string().optional(),
          uri: z.string().optional(),
        }),
      },
    },
    (input) => toToolResult(registry.add_memory(input)),
  );

  server.registerTool(
    "search_memory",
    {
      description: "Search persisted memory records across one or more scopes.",
      inputSchema: {
        query: z.string().min(1),
        scopes: z.array(scopeRefSchema()).min(1),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    (input) => toToolResult(registry.search_memory(input)),
  );

  server.registerTool(
    "build_context_pack",
    {
      description: "Search memory and assemble a markdown context pack.",
      inputSchema: {
        projectKey: z.string().min(1),
        task: z.string().min(1),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    (input) => toToolResult(registry.build_context_pack(input)),
  );

  server.registerTool(
    "compact_memory",
    {
      description: "Preview or apply conservative memory compaction heuristics.",
      inputSchema: {
        projectKey: z.string().min(1),
        dryRun: z.boolean().optional(),
      },
    },
    (input) => toToolResult(registry.compact_memory(input)),
  );

  return server;
}

export async function startStdioServer(options: CreateMcpServerOptions = {}) {
  const server = createMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}

function scopeRefSchema() {
  return z.object({
    scopeType: z.enum(SCOPE_TYPES),
    scopeId: z.string().min(1),
  });
}

function toToolResult(result: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

function renderContextPackMarkdown(task: string, body: string): string {
  return ["# Context Pack", "", `Task: ${task}`, "", body].join("\n");
}

function shouldPromoteRecord(record: SearchMemoryResult): boolean {
  return (
    record.memoryType === "decision" ||
    record.source.sourceType === "decision" ||
    /^\s*(decision|constraint):/i.test(record.content)
  );
}

function runtimeFromEnv(): ProjectRuntime | undefined {
  const projectKey = process.env.DMO_PROJECT_KEY;

  if (!projectKey) {
    return undefined;
  }

  return createProjectRuntime({
    cwd: process.env.DMO_CWD ?? process.cwd(),
    projectKey,
  });
}

async function main() {
  const runtime = runtimeFromEnv();

  try {
    await startStdioServer({
      repository: runtime?.repository,
    });
  } finally {
    runtime?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
