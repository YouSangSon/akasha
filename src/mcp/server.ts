import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import { pathToFileURL } from "node:url";
import * as z from "zod/v4";
import {
  buildContextPack,
  type ContextPackSections,
} from "../context-pack/build-context-pack.js";
import {
  resolveProjectPaths,
  resolveServiceConfig,
  resolveUserPaths,
} from "../config.js";
import { createMemoryDb, createPgPool } from "../db/connection.js";
import { createOpenAiEmbeddingClient } from "../embedding/openai-embeddings.js";
import { rankResults } from "../search/rank-results.js";
import { retrieveMemory as retrieveMemoryFromQdrant } from "../search/retrieve-memory.js";
import { runMigrations } from "../db/migrate.js";
import { createQdrantClient } from "../qdrant/client.js";
import { createMemoryRepository } from "../store/memory-repository.js";
import type {
  AddMemoryInput,
  CanonicalMemoryRepository,
  MemoryRepository,
  ScopeType,
  SearchMemoryResult,
} from "../types.js";

type MaybePromise<T> = T | Promise<T>;

export type AddMemoryToolInput = {
  projectKey?: string;
  scope?: ScopeType;
  userScopeId?: string;
  kind: string;
  content: string;
};

export type AddMemoryToolResult = {
  ok: true;
  memoryId: string;
  summary: string;
};

export type SearchMemoryToolInput = {
  projectKey: string;
  query: string;
  userScopeId?: string;
  includeUser?: boolean;
  limit?: number;
};

export type SearchMemoryToolResult = {
  ok: true;
  projectKey: string;
  query: string;
  results: SearchMemoryResult[];
};

export type BuildContextPackToolInput = {
  projectKey: string;
  task: string;
  userScopeId?: string;
  includeUser?: boolean;
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
  projectKey?: string;
  scope?: ScopeType;
  userScopeId?: string;
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
  add_memory(input: AddMemoryToolInput): Promise<AddMemoryToolResult>;
  search_memory(input: SearchMemoryToolInput): Promise<SearchMemoryToolResult>;
  build_context_pack(
    input: BuildContextPackToolInput,
  ): Promise<BuildContextPackToolResult>;
  compact_memory(input: CompactMemoryToolInput): Promise<CompactMemoryToolResult>;
};

export type ScopedRepositories = {
  projectRepository?: MemoryRepository;
  userRepository?: MemoryRepository;
  close(): void;
};

export type ScopedRepositoriesInput = {
  cwd: string;
  projectKey?: string;
  userScopeId?: string;
};

export type CreateToolRegistryOptions = {
  cwd?: string;
  repository?: MemoryRepository;
  projectRepository?: MemoryRepository;
  userRepository?: MemoryRepository;
  resolveRepository?: (projectKey: string) => MemoryRepository | ProjectRuntime;
  resolveRepositories?: (input: ScopedRepositoriesInput) => ScopedRepositories;
  defaultUserScopeId?: string;
  retrieveMemory?: RetrieveMemoryService;
};

export type RetrieveMemoryServiceInput = {
  projectKey: string;
  userScopeId?: string;
  query: string;
  limit: number;
};

export type RetrieveMemoryService = (
  input: RetrieveMemoryServiceInput,
) => Promise<SearchMemoryResult[]>;

export type ProjectRuntime = {
  db: Database.Database;
  repository: MemoryRepository;
  close(): void;
};

export type ProjectRuntimeInput = {
  cwd: string;
  projectKey: string;
};

export type UserRuntimeInput = {
  userScopeId: string;
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

export function createUserRuntime(input: UserRuntimeInput): ProjectRuntime {
  const paths = resolveUserPaths(input);
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

export function createScopedRepositories(
  input: ScopedRepositoriesInput,
): ScopedRepositories {
  const runtimes: ProjectRuntime[] = [];

  const projectRuntime = input.projectKey
    ? createProjectRuntime({
        cwd: input.cwd,
        projectKey: input.projectKey,
      })
    : undefined;

  if (projectRuntime) {
    runtimes.push(projectRuntime);
  }

  const userRuntime = input.userScopeId
    ? createUserRuntime({
        userScopeId: input.userScopeId,
      })
    : undefined;

  if (userRuntime) {
    runtimes.push(userRuntime);
  }

  return {
    projectRepository: projectRuntime?.repository,
    userRepository: userRuntime?.repository,
    close() {
      for (const runtime of runtimes) {
        runtime.close();
      }
    },
  };
}

export function createToolRegistry(
  options: CreateToolRegistryOptions = {},
): ToolRegistry {
  const cwd = options.cwd ?? process.cwd();

  async function withRepositories<T>(
    input: {
      projectKey?: string;
      userScopeId?: string;
      includeUser?: boolean;
    },
    callback: (repositories: {
      projectRepository?: MemoryRepository;
      userRepository?: MemoryRepository;
      userScopeId?: string;
    }) => MaybePromise<T>,
  ): Promise<T> {
    const userScopeId = resolveUserScopeId({
      cwd,
      explicitUserScopeId: input.userScopeId,
      defaultUserScopeId: options.defaultUserScopeId,
    });

    if (options.resolveRepositories) {
      const resolved = options.resolveRepositories({
        cwd,
        projectKey: input.projectKey,
        userScopeId: input.includeUser === false ? undefined : userScopeId,
      });

      try {
        return await callback({
          projectRepository: resolved.projectRepository,
          userRepository: resolved.userRepository,
          userScopeId,
        });
      } finally {
        resolved.close();
      }
    }

    if (options.projectRepository || options.userRepository) {
      return await callback({
        projectRepository: options.projectRepository,
        userRepository: input.includeUser === false ? undefined : options.userRepository,
        userScopeId,
      });
    }

    if (options.resolveRepository && input.projectKey) {
      const resolved = options.resolveRepository(input.projectKey);

      if ("repository" in resolved) {
        try {
          return await callback({
            projectRepository: resolved.repository,
            userScopeId,
          });
        } finally {
          resolved.close();
        }
      }

      return await callback({
        projectRepository: resolved,
        userScopeId,
      });
    }

    if (options.repository) {
      return await callback({
        projectRepository: options.repository,
        userScopeId,
      });
    }

    throw new Error("repository fallback not configured");
  }

  async function withCanonicalRepository<T>(
    callback: (repository: CanonicalMemoryRepository) => Promise<T>,
  ): Promise<T> {
    const config = resolveServiceConfig();
    const pool = createPgPool({
      connectionString: config.databaseUrl,
    });

    try {
      await runMigrations(pool);
      const repository = createMemoryRepository(pool);
      return await callback(repository);
    } finally {
      await pool.end();
    }
  }

  async function resolveRecords(
    input: {
      projectKey: string;
      query: string;
      userScopeId?: string;
      includeUser?: boolean;
      limit?: number;
    },
  ): Promise<SearchMemoryResult[]> {
    const limit = normalizeLimit(input.limit);
    const userScopeId = input.includeUser === false
      ? undefined
      : resolveUserScopeId({
          cwd,
          explicitUserScopeId: input.userScopeId,
          defaultUserScopeId: options.defaultUserScopeId,
        });

    if (options.retrieveMemory) {
      return options.retrieveMemory({
        projectKey: input.projectKey,
        userScopeId,
        query: input.query,
        limit,
      });
    }

    if (hasRepositoryOverrides(options)) {
      return withRepositories(
        {
          projectKey: input.projectKey,
          userScopeId,
          includeUser: input.includeUser,
        },
        ({ projectRepository, userRepository }) =>
          collectRecords({
            query: input.query,
            limit,
            projectKey: input.projectKey,
            projectRepository,
            userScopeId,
            userRepository:
              input.includeUser === false ? undefined : userRepository,
          }),
      );
    }

    return retrieveRecordsFromService({
      projectKey: input.projectKey,
      query: input.query,
      userScopeId,
      limit,
    });
  }

  return {
    async add_memory(input) {
      const scope = input.scope ?? "project";
      const userScopeId = resolveUserScopeId({
        cwd,
        explicitUserScopeId: input.userScopeId,
        defaultUserScopeId: options.defaultUserScopeId,
      });

      const created = hasRepositoryOverrides(options)
        ? await withRepositories(
            {
              projectKey: input.projectKey,
              userScopeId,
              includeUser: scope === "user",
            },
            ({ projectRepository, userRepository }) => {
              const repository =
                scope === "user" ? userRepository : projectRepository;

              if (!repository) {
                throw new Error(`${scope} memory repository not configured`);
              }

              return repository.addMemory(
                toRepositoryAddMemoryInput({
                  ...input,
                  scope,
                  userScopeId,
                }),
              );
            },
          )
        : await withCanonicalRepository((repository) =>
            repository.addMemory(
              toRepositoryAddMemoryInput({
                ...input,
                scope,
                userScopeId,
              }),
            ),
          );

      return {
        ok: true,
        memoryId: String(created.id),
        summary: input.content.slice(0, 80),
      };
    },

    async search_memory(input) {
      const results = await resolveRecords({
        projectKey: input.projectKey,
        query: input.query,
        userScopeId: input.userScopeId,
        includeUser: input.includeUser,
        limit: input.limit,
      });

      return {
        ok: true,
        projectKey: input.projectKey,
        query: input.query,
        results,
      };
    },

    async build_context_pack(input) {
      const records = await resolveRecords({
        projectKey: input.projectKey,
        query: input.task,
        userScopeId: input.userScopeId,
        includeUser: input.includeUser,
        limit: input.limit,
      });
      const pack = buildContextPack({ records });

      return {
        ok: true,
        projectKey: input.projectKey,
        packMarkdown: renderContextPackMarkdown(input.task, pack.markdown),
        selectedMemoryIds: records.map((record) => formatMemoryIdentifier(record)),
        sections: pack.sections,
      };
    },

    async compact_memory(input) {
      const scope = input.scope ?? "project";
      const dryRun = input.dryRun ?? true;
      const userScopeId = resolveUserScopeId({
        cwd,
        explicitUserScopeId: input.userScopeId,
        defaultUserScopeId: options.defaultUserScopeId,
      });
      const scopeRef =
        scope === "user"
          ? {
              scopeType: "user" as const,
              scopeId: requireUserScopeId(userScopeId),
            }
          : {
              scopeType: "project" as const,
              scopeId: requireProjectKey(input.projectKey, scope),
            };
      const records = hasRepositoryOverrides(options)
        ? await withRepositories(
            {
              projectKey: input.projectKey,
              userScopeId,
              includeUser: scope === "user",
            },
            ({ projectRepository, userRepository }) => {
              const repository =
                scope === "user" ? userRepository : projectRepository;

              if (!repository) {
                throw new Error(`${scope} memory repository not configured`);
              }

              return repository.listMemory(scopeRef);
            },
          )
        : await withCanonicalRepository((repository) =>
            repository.listMemory(scopeRef),
          );
      const targetLabel =
        scope === "user"
          ? requireUserScopeId(userScopeId)
          : requireProjectKey(input.projectKey, scope);

      return {
        ok: true,
        projectKey: input.projectKey ?? targetLabel,
        dryRun,
        archivedIds: [],
        mergedIds: [],
        promotionCandidates: records
          .filter((record) => shouldPromoteRecord(record))
          .map((record) => String(record.id)),
        summary: `${dryRun ? "Dry run" : "Applied"} compaction for ${scope} scope ${targetLabel}`,
      };
    },
  };
}

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
      resolveRepositories: options.resolveRepositories,
      defaultUserScopeId: options.defaultUserScopeId,
      retrieveMemory: options.retrieveMemory,
    });

  const server = new McpServer({
    name: "developer-memory-os",
    version: "0.1.0",
  });

  server.registerTool(
    "add_memory",
    {
      description: "Persist a memory record for a project or user scope.",
      inputSchema: {
        projectKey: z.string().min(1).optional(),
        scope: z.enum(["project", "user"]).optional(),
        userScopeId: z.string().min(1).optional(),
        kind: z.string().min(1),
        content: z.string().min(1),
      },
    },
    async (input) => toToolResult(await registry.add_memory(input)),
  );

  server.registerTool(
    "search_memory",
    {
      description: "Search persisted memory records across one or more scopes.",
      inputSchema: {
        projectKey: z.string().min(1),
        query: z.string().min(1),
        userScopeId: z.string().min(1).optional(),
        includeUser: z.boolean().optional(),
        limit: z.number().int().positive().optional(),
      },
    },
    async (input) => toToolResult(await registry.search_memory(input)),
  );

  server.registerTool(
    "build_context_pack",
    {
      description: "Search memory and assemble a markdown context pack.",
      inputSchema: {
        projectKey: z.string().min(1),
        task: z.string().min(1),
        userScopeId: z.string().min(1).optional(),
        includeUser: z.boolean().optional(),
        limit: z.number().int().positive().optional(),
      },
    },
    async (input) => toToolResult(await registry.build_context_pack(input)),
  );

  server.registerTool(
    "compact_memory",
    {
      description: "Preview or apply conservative memory compaction heuristics.",
      inputSchema: {
        projectKey: z.string().min(1).optional(),
        scope: z.enum(["project", "user"]).optional(),
        userScopeId: z.string().min(1).optional(),
        dryRun: z.boolean().optional(),
      },
    },
    async (input) => toToolResult(await registry.compact_memory(input)),
  );

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
  };
}

function toRepositoryAddMemoryInput(input: AddMemoryToolInput): AddMemoryInput {
  const scope = input.scope ?? "project";
  const scopeId =
    scope === "user"
      ? requireUserScopeId(input.userScopeId)
      : requireProjectKey(input.projectKey, scope);

  return {
    scopeType: scope,
    scopeId,
    memoryType: toMemoryType(input.kind),
    content: input.content,
    source: {
      scopeType: scope,
      scopeId,
      sourceType: "conversation",
      externalId: `${input.kind}:manual`,
      title: `${input.kind} manual entry`,
    },
  };
}

function toMemoryType(kind: string): AddMemoryInput["memoryType"] {
  switch (kind) {
    case "decision":
    case "summary":
    case "fact":
      return kind;
    default:
      throw new Error(`Unsupported memory kind: ${kind}`);
  }
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

function collectRecords(input: {
  query: string;
  projectKey: string;
  limit?: number;
  projectRepository?: MemoryRepository;
  userRepository?: MemoryRepository;
  userScopeId?: string;
}): SearchMemoryResult[] {
  const perScopeLimit = Math.max(1, Math.min(input.limit ?? 10, 100));
  const results: SearchMemoryResult[] = [];

  if (input.projectRepository) {
    results.push(
      ...input.projectRepository.searchMemory({
        query: input.query,
        limit: perScopeLimit,
        scopes: [
          {
            scopeType: "project",
            scopeId: input.projectKey,
          },
        ],
      }),
    );
  }

  if (input.userRepository && input.userScopeId) {
    results.push(
      ...input.userRepository.searchMemory({
        query: input.query,
        limit: perScopeLimit,
        scopes: [
          {
            scopeType: "user",
            scopeId: input.userScopeId,
          },
        ],
      }),
    );
  }

  return rankResults(results).slice(0, perScopeLimit);
}

function hasRepositoryOverrides(
  options: CreateToolRegistryOptions,
): boolean {
  return Boolean(
    options.repository ||
      options.projectRepository ||
      options.userRepository ||
      options.resolveRepository ||
      options.resolveRepositories,
  );
}

function normalizeLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(limit ?? 10, 100));
}

async function retrieveRecordsFromService(
  input: RetrieveMemoryServiceInput,
): Promise<SearchMemoryResult[]> {
  const config = resolveServiceConfig();
  const pool = createPgPool({
    connectionString: config.databaseUrl,
  });

  try {
    await runMigrations(pool);

    const repository = createMemoryRepository(pool);
    const embeddings = createOpenAiEmbeddingClient({
      apiKey: config.openai.apiKey,
      model: config.embedding.model,
    });
    const qdrantClient = createQdrantClient({
      url: config.qdrant.url,
      apiKey: config.qdrant.apiKey,
    });
    const vector = await embeddings.embed(input.query);

    return retrieveMemoryFromQdrant({
      qdrantClient: {
        async query(collectionName, args) {
          const response = await qdrantClient.query(collectionName, args);

          return {
            points: response.points.map((point) => {
              const memoryRecordId =
                point.payload &&
                typeof point.payload === "object" &&
                typeof point.payload.memory_record_id === "number"
                  ? point.payload.memory_record_id
                  : undefined;

              return {
                payload:
                  memoryRecordId === undefined
                    ? undefined
                    : { memory_record_id: memoryRecordId },
              };
            }),
          };
        },
      },
      repository,
      collectionName: config.qdrant.collectionName,
      vector,
      projectKey: input.projectKey,
      userScopeId: input.userScopeId,
      limit: input.limit,
    });
  } finally {
    await pool.end();
  }
}

function requireProjectKey(
  projectKey: string | undefined,
  scope: ScopeType,
): string {
  if (!projectKey) {
    throw new Error(`projectKey is required for ${scope} scope operations`);
  }

  return projectKey;
}

function requireUserScopeId(userScopeId: string | undefined): string {
  if (!userScopeId) {
    throw new Error("userScopeId could not be resolved");
  }

  return userScopeId;
}

function resolveUserScopeId(input: {
  cwd: string;
  explicitUserScopeId?: string;
  defaultUserScopeId?: string;
}): string {
  if (input.explicitUserScopeId) {
    return input.explicitUserScopeId;
  }

  if (input.defaultUserScopeId) {
    return input.defaultUserScopeId;
  }

  const configuredUserId = process.env.DEVELOPER_MEMORY_USER_ID?.trim();

  if (configuredUserId) {
    return configuredUserId;
  }

  const gitEmail = readGitEmail(input.cwd);

  if (gitEmail) {
    return `git-${createHash("sha256").update(gitEmail).digest("hex").slice(0, 12)}`;
  }

  return `local-${sanitizeScopeId(os.userInfo().username)}`;
}

function readGitEmail(cwd: string): string | null {
  try {
    return execFileSync("git", ["config", "user.email"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function sanitizeScopeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function formatMemoryIdentifier(record: SearchMemoryResult): string {
  return `${record.scopeType}:${record.scopeId}:${record.id}`;
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
