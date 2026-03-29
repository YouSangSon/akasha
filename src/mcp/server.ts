import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import { pathToFileURL } from "node:url";
import * as z from "zod/v4";
import {
  buildContextPack,
  type ContextPackSections,
} from "../context-pack/build-context-pack.js";
import { resolveServiceConfig, type ServiceConfig } from "../config.js";
import { createPgPool } from "../db/connection.js";
import { createOpenAiEmbeddingClient } from "../embedding/openai-embeddings.js";
import { createIngestJobRepository } from "../jobs/ingest-job-repository.js";
import { rankResults } from "../search/rank-results.js";
import { retrieveMemory as retrieveMemoryFromQdrant } from "../search/retrieve-memory.js";
import { runMigrations } from "../db/migrate.js";
import { createQdrantClient } from "../qdrant/client.js";
import { createMemoryRepository } from "../store/memory-repository.js";
import {
  createMemoryChunkRepository,
  reindexCanonicalMemory,
  writeCanonicalMemory,
  type EmbeddingClient,
  type MemoryChunkRepository,
  type QdrantUpsertClient,
} from "../store/canonical-indexing.js";
import type {
  AddMemoryInput,
  CanonicalMemoryRepository,
  IngestJobRepository,
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

export type ReindexMemoryToolInput = {
  projectKey: string;
  userScopeId?: string;
};

export type ReindexMemoryToolResult = {
  ok: true;
  projectKey: string;
  scopes: string[];
  chunkCount: number;
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
  reindex_memory(
    input: ReindexMemoryToolInput,
  ): Promise<ReindexMemoryToolResult>;
  compact_memory(input: CompactMemoryToolInput): Promise<CompactMemoryToolResult>;
};

export type CreateToolRegistryOptions = {
  cwd?: string;
  repository?: MemoryRepository;
  projectRepository?: MemoryRepository;
  userRepository?: MemoryRepository;
  resolveRepository?: (projectKey: string) => MemoryRepository;
  resolveCanonicalServices?: () => MaybePromise<CanonicalServices>;
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

export type CreateMcpServerOptions = CreateToolRegistryOptions & {
  registry?: ToolRegistry;
};

type CanonicalQdrantQueryClient = {
  query(
    collectionName: string,
    args: {
      query: number[];
      limit: number;
      filter: {
        must: Array<{
          key: string;
          match: { value: string };
        }>;
      };
    },
  ): Promise<{
    points: Array<{
      payload?: {
        memory_record_id?: number;
      };
    }>;
  }>;
};

export type CanonicalServices = {
  config: {
    qdrant: Pick<ServiceConfig["qdrant"], "collectionName">;
    embedding: ServiceConfig["embedding"];
  };
  repository: CanonicalMemoryRepository;
  chunkRepository: MemoryChunkRepository;
  ingestJobs: IngestJobRepository;
  embeddings: EmbeddingClient;
  qdrantClient: QdrantUpsertClient & CanonicalQdrantQueryClient;
  close?: () => MaybePromise<void>;
};

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

    if (options.projectRepository || options.userRepository) {
      return await callback({
        projectRepository: options.projectRepository,
        userRepository: input.includeUser === false ? undefined : options.userRepository,
        userScopeId,
      });
    }

    if (options.resolveRepository && input.projectKey) {
      const resolved = options.resolveRepository(input.projectKey);

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
    return withCanonicalServices((services) => callback(services.repository));
  }

  async function withCanonicalServices<T>(
    callback: (services: CanonicalServices) => Promise<T>,
  ): Promise<T> {
    if (options.resolveCanonicalServices) {
      const services = await options.resolveCanonicalServices();

      try {
        return await callback(services);
      } finally {
        await services.close?.();
      }
    }

    const config = resolveServiceConfig();
    const pool = createPgPool({
      connectionString: config.databaseUrl,
    });

    try {
      await runMigrations(pool);
      const qdrantClient = createQdrantClient({
        url: config.qdrant.url,
        apiKey: config.qdrant.apiKey,
      });

      return await callback({
        config: {
          qdrant: {
            collectionName: config.qdrant.collectionName,
          },
          embedding: config.embedding,
        },
        repository: createMemoryRepository(pool),
        chunkRepository: createMemoryChunkRepository(pool),
        ingestJobs: createIngestJobRepository(pool),
        embeddings: createOpenAiEmbeddingClient({
          apiKey: config.openai.apiKey,
          model: config.embedding.model,
        }),
        qdrantClient: {
          upsert(collectionName, input) {
            return qdrantClient.upsert(collectionName, input);
          },
          async query(collectionName, args) {
            const response = await qdrantClient.query(collectionName, args);

            return {
              points: response.points.map((point) => {
                const payload =
                  point.payload && typeof point.payload === "object"
                    ? point.payload
                    : undefined;
                const memoryRecordId =
                  typeof payload?.memory_record_id === "number"
                    ? payload.memory_record_id
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
      });
    } finally {
      await pool.end();
    }
  }

  async function retrieveRecordsWithCanonicalServices(
    services: CanonicalServices,
    input: RetrieveMemoryServiceInput,
  ): Promise<SearchMemoryResult[]> {
    const vector = await services.embeddings.embed(input.query);

    return retrieveMemoryFromQdrant({
      qdrantClient: services.qdrantClient,
      repository: services.repository,
      collectionName: services.config.qdrant.collectionName,
      vector,
      projectKey: input.projectKey,
      userScopeId: input.userScopeId,
      limit: input.limit,
    });
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

    return withCanonicalServices((services) =>
      retrieveRecordsWithCanonicalServices(services, {
        projectKey: input.projectKey,
        query: input.query,
        userScopeId,
        limit,
      }),
    );
  }

  return {
    async add_memory(input) {
      const scope = input.scope ?? "project";
      const userScopeId = resolveUserScopeId({
        cwd,
        explicitUserScopeId: input.userScopeId,
        defaultUserScopeId: options.defaultUserScopeId,
      });

      const createdRecord = hasRepositoryOverrides(options)
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
        : await withCanonicalServices((services) =>
            writeCanonicalMemory({
              repository: services.repository,
              chunkRepository: services.chunkRepository,
              ingestJobs: services.ingestJobs,
              embeddings: services.embeddings,
              qdrantClient: services.qdrantClient,
              collectionName: services.config.qdrant.collectionName,
              embedding: {
                provider: services.config.embedding.provider,
                model: services.config.embedding.model,
                dimensions: services.config.embedding.dimensions,
                version: services.config.embedding.version,
                targetTokens: services.config.embedding.chunkTargetTokens,
                overlapTokens: services.config.embedding.chunkOverlapTokens,
              },
              memory: toRepositoryAddMemoryInput({
                ...input,
                scope,
                userScopeId,
              }),
            }),
          );

      return {
        ok: true,
        memoryId: String(createdRecord.id),
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
      const useServiceBackedPack =
        !hasRepositoryOverrides(options) && !options.retrieveMemory;
      const builtPack = useServiceBackedPack
        ? await withCanonicalServices(async (services) => {
            const records = await retrieveRecordsWithCanonicalServices(services, {
              projectKey: input.projectKey,
              query: input.task,
              userScopeId:
                input.includeUser === false
                  ? undefined
                  : resolveUserScopeId({
                      cwd,
                      explicitUserScopeId: input.userScopeId,
                      defaultUserScopeId: options.defaultUserScopeId,
                    }),
              limit: normalizeLimit(input.limit),
            });
            const pack = buildContextPack({ records });
            const packMarkdown = renderContextPackMarkdown(input.task, pack.markdown);
            const selectedMemoryIds = records.map((record) =>
              formatMemoryIdentifier(record)
            );

            await services.chunkRepository.createContextPackRun({
              projectKey: input.projectKey,
              task: input.task,
              selectedMemoryIds,
              packMarkdown,
            });

            return {
              pack,
              packMarkdown,
              selectedMemoryIds,
            };
          })
        : await (async () => {
            const records = await resolveRecords({
              projectKey: input.projectKey,
              query: input.task,
              userScopeId: input.userScopeId,
              includeUser: input.includeUser,
              limit: input.limit,
            });
            const pack = buildContextPack({ records });

            return {
              pack,
              packMarkdown: renderContextPackMarkdown(input.task, pack.markdown),
              selectedMemoryIds: records.map((record) =>
                formatMemoryIdentifier(record)
              ),
            };
          })();

      return {
        ok: true,
        projectKey: input.projectKey,
        packMarkdown: builtPack.packMarkdown,
        selectedMemoryIds: builtPack.selectedMemoryIds,
        sections: builtPack.pack.sections,
      };
    },

    async reindex_memory(input) {
      const userScopeId = resolveUserScopeId({
        cwd,
        explicitUserScopeId: input.userScopeId,
        defaultUserScopeId: options.defaultUserScopeId,
      });
      const scopes = [
        {
          scopeType: "project" as const,
          scopeId: input.projectKey,
        },
        ...(userScopeId
          ? [
              {
                scopeType: "user" as const,
                scopeId: userScopeId,
              },
            ]
          : []),
      ];

      const result = await withCanonicalServices((services) =>
        reindexCanonicalMemory({
          chunkRepository: services.chunkRepository,
          embeddings: services.embeddings,
          qdrantClient: services.qdrantClient,
          collectionName: services.config.qdrant.collectionName,
          scopes,
        }),
      );

      return {
        ok: true,
        projectKey: input.projectKey,
        scopes: scopes.map((scope) => `${scope.scopeType}:${scope.scopeId}`),
        chunkCount: result.chunkCount,
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
      resolveCanonicalServices: options.resolveCanonicalServices,
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
    projectKey: scope === "project" ? scopeId : undefined,
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
      options.resolveRepository,
  );
}

function normalizeLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(limit ?? 10, 100));
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
