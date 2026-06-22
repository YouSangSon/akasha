import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import { pathToFileURL } from "node:url";
import * as z from "zod/v4";
import { buildCompactionPlan } from "../compact/compact-memory.js";
import { applyCompaction } from "../compact/apply-compaction.js";
import { unarchiveCompaction } from "../compact/unarchive-compaction.js";
import {
  buildContextPack,
  type ContextPackSections,
} from "../context-pack/build-context-pack.js";
import {
  createRequestLogger,
  rootLogger,
  type Logger,
} from "../logger.js";
import { rankResults } from "../search/rank-results.js";
import { retrieveMemory as retrieveMemoryFromQdrant } from "../search/retrieve-memory.js";
import {
  reindexCanonicalMemory,
  writeCanonicalMemory,
} from "../store/canonical-indexing.js";
import { createCanonicalServicesResolver } from "./canonical-services.js";
import type {
  AddMemoryInput,
  CanonicalMemoryRepository,
  IngestJobRepository,
  MemoryRepository,
  ScopeType,
  SearchMemoryResult,
} from "../types.js";

import type {
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
  MaybePromise,
  ReindexMemoryToolInput,
  ReindexMemoryToolResult,
  RetrieveMemoryServiceInput,
  RetrieveMemoryService,
  SearchMemoryToolInput,
  SearchMemoryToolResult,
  ToolRegistry,
} from "./types.js";

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
} from "./types.js";

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

  const withCanonicalServices = createCanonicalServicesResolver({
    resolveCanonicalServices: options.resolveCanonicalServices,
  });

  async function retrieveRecordsWithCanonicalServices(
    services: CanonicalServices,
    input: RetrieveMemoryServiceInput,
  ): Promise<SearchMemoryResult[]> {
    const vector = await services.embeddings.embed(input.query);

    return retrieveMemoryFromQdrant({
      vectorIndex: services.vectorIndex,
      repository: services.repository,
      vector,
      organizationId: input.organizationId,
      // Default-strict: undefined organizationId throws unless the operator
      // explicitly opted into the legacy single-tenant org-blind read by
      // setting LEGACY_ANONYMOUS_SEARCH=true. Resolved from process.env at
      // call time so runtime config flips take effect without a restart.
      allowLegacyAnonymous: process.env.LEGACY_ANONYMOUS_SEARCH === "true",
      projectKey: input.projectKey,
      userScopeId: input.userScopeId,
      limit: input.limit,
    });
  }

  async function resolveRecords(
    input: {
      organizationId?: string;
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
        organizationId: input.organizationId,
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
            organizationId: input.organizationId,
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
        organizationId: input.organizationId,
        projectKey: input.projectKey,
        query: input.query,
        userScopeId,
        limit,
      }),
    );
  }

  const baseLogger = options.logger ?? rootLogger;
  const defaultActor = options.defaultActor ?? "anonymous";

  async function instrument<T>(
    toolName: string,
    input: {
      organizationId?: string;
      projectKey?: string;
      scope?: string;
    },
    run: () => Promise<T>,
  ): Promise<T> {
    const start = Date.now();
    const requestId = globalThis.crypto.randomUUID();
    const log = baseLogger.child({
      requestId,
      tool: toolName,
      projectKey: input.projectKey,
      scope: input.scope,
    });
    log.info({ event: "tool.start" }, "tool invoked");
    try {
      const result = await run();
      const durationMs = Date.now() - start;
      log.info({ event: "tool.complete", durationMs }, "tool completed");

      // Best-effort audit write — never block or fail the caller.
      void options.auditLog
        ?.record({
          organizationId: input.organizationId ?? "default",
          actor: defaultActor,
          tool: toolName,
          projectKey: input.projectKey ?? null,
          outcome: "ok",
          durationMs,
          requestId,
        })
        .catch(() => undefined);

      return result;
    } catch (error: unknown) {
      const durationMs = Date.now() - start;
      log.error(
        { event: "tool.error", durationMs, err: error },
        "tool failed",
      );

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      void options.auditLog
        ?.record({
          organizationId: input.organizationId ?? "default",
          actor: defaultActor,
          tool: toolName,
          projectKey: input.projectKey ?? null,
          outcome: "error",
          errorMessage,
          durationMs,
          requestId,
        })
        .catch(() => undefined);

      throw error;
    }
  }

  const handlers: ToolRegistry = {
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
              vectorIndex: services.vectorIndex,
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
        organizationId: input.organizationId,
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
              organizationId: input.organizationId,
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
              organizationId: input.organizationId ?? "default",
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
              organizationId: input.organizationId,
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
      if (!input.organizationId) {
        throw new Error(
          "reindex_memory requires organizationId: omitting it would reindex chunks " +
            "across all tenants sharing the same scope, violating data isolation. " +
            "Pass the caller's organization identifier.",
        );
      }
      const organizationId: string = input.organizationId;
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
          vectorIndex: services.vectorIndex,
          organizationId,
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

              return repository.listMemory(scopeRef, {
                limit: input.limit,
                organizationId: input.organizationId,
                allowLegacyAnonymous: process.env.LEGACY_ANONYMOUS_SEARCH === "true",
              });
            },
          )
        : await withCanonicalRepository((repository) =>
            repository.listMemory(scopeRef, {
              limit: input.limit,
              organizationId: input.organizationId,
              allowLegacyAnonymous: process.env.LEGACY_ANONYMOUS_SEARCH === "true",
            }),
          );
      const targetLabel =
        scope === "user"
          ? requireUserScopeId(userScopeId)
          : requireProjectKey(input.projectKey, scope);

      // Legacy override mode (in-process MemoryRepository, no Postgres):
      // dry-run only; no semantic dedup; no apply path.
      if (hasRepositoryOverrides(options)) {
        if (!dryRun) {
          throw new Error(
            "compact_memory apply path requires canonical services (Postgres + Qdrant); " +
              "legacy repository overrides are read-only. Use dryRun=true.",
          );
        }
        if (input.semanticDedupThreshold !== undefined) {
          throw new Error(
            "compact_memory semantic dedup requires canonical services (embedding client). " +
              "Legacy repository overrides do not provide one.",
          );
        }
        return buildCompactionPlan({
          records,
          scope,
          scopeLabel: targetLabel,
          projectKey: input.projectKey,
          dryRun: true,
          decayThreshold: input.decayThreshold,
          halfLifeDays: input.halfLifeDays,
        });
      }

      // Canonical services mode: route through applyCompaction. It handles
      // both dry-run (returns plan + zero stats, no destructive ops) and
      // apply. Semantic dedup runs in either case when threshold is set.
      return await withCanonicalServices(async (services) => {
        const result = await applyCompaction(
          {
            records,
            scope,
            scopeLabel: targetLabel,
            projectKey: input.projectKey,
            dryRun,
            decayThreshold: input.decayThreshold,
            halfLifeDays: input.halfLifeDays,
            semanticDedupThreshold: input.semanticDedupThreshold,
            organizationId: input.organizationId ?? "default",
            actor: "compact_memory",
          },
          {
            archiveRepository: services.archiveRepository,
            vectorIndex: services.vectorIndex,
            embeddings: services.embeddings,
            logger: baseLogger,
          },
        );
        return result;
      });
    },

    async unarchive_memory(input) {
      // Apply path requires canonical services (archiveRepository +
      // chunkRepository + embeddings + qdrantClient). Legacy override mode
      // doesn't have any of those.
      if (hasRepositoryOverrides(options)) {
        throw new Error(
          "unarchive_memory requires canonical services (Postgres + Qdrant); " +
            "legacy repository overrides are not supported.",
        );
      }
      if (!Array.isArray(input.archiveIds) || input.archiveIds.length === 0) {
        return {
          ok: true,
          outcomes: [],
          restoredCount: 0,
          skippedCount: 0,
          failedCount: 0,
        };
      }
      return await withCanonicalServices(async (services) => {
        const result = await unarchiveCompaction(
          {
            archiveIds: input.archiveIds,
            organizationId: input.organizationId ?? "default",
            actor: "unarchive_memory",
          },
          {
            archiveRepository: services.archiveRepository,
            chunkRepository: services.chunkRepository,
            embeddings: services.embeddings,
            vectorIndex: services.vectorIndex,
            embedding: {
              provider: services.config.embedding.provider,
              model: services.config.embedding.model,
              dimensions: services.config.embedding.dimensions,
              version: services.config.embedding.version,
              targetTokens: services.config.embedding.chunkTargetTokens,
              overlapTokens: services.config.embedding.chunkOverlapTokens,
            },
            logger: baseLogger,
          },
        );
        return {
          ok: true,
          outcomes: result.outcomes,
          restoredCount: result.restoredCount,
          skippedCount: result.skippedCount,
          failedCount: result.failedCount,
        };
      });
    },

    async list_audit_log(input) {
      if (!options.auditLog) {
        throw new Error(
          "audit log not configured: pass options.auditLog to enable list_audit_log",
        );
      }
      const organizationId = input.organizationId ?? "default";
      const entries = await options.auditLog.listByOrganization(
        organizationId,
        { limit: input.limit },
      );
      return {
        ok: true,
        organizationId,
        entries: entries.map((entry) => ({
          id: entry.id,
          organizationId: entry.organizationId,
          actor: entry.actor,
          tool: entry.tool,
          projectKey: entry.projectKey ?? null,
          outcome: entry.outcome,
          errorMessage: entry.errorMessage ?? null,
          durationMs: entry.durationMs,
          requestId: entry.requestId ?? null,
          createdAt: entry.createdAt,
        })),
      };
    },
  };

  return {
    add_memory: (input) =>
      instrument("add_memory", input, () => handlers.add_memory(input)),
    search_memory: (input) =>
      instrument("search_memory", input, () => handlers.search_memory(input)),
    build_context_pack: (input) =>
      instrument("build_context_pack", input, () =>
        handlers.build_context_pack(input),
      ),
    reindex_memory: (input) =>
      instrument("reindex_memory", input, () =>
        handlers.reindex_memory(input),
      ),
    compact_memory: (input) =>
      instrument("compact_memory", input, () =>
        handlers.compact_memory(input),
      ),
    list_audit_log: (input) =>
      instrument("list_audit_log", input, () =>
        handlers.list_audit_log(input),
      ),
    unarchive_memory: (input) =>
      instrument("unarchive_memory", input, () =>
        handlers.unarchive_memory(input),
      ),
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
        organizationId: z.string().min(1).optional(),
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
        organizationId: z.string().min(1).optional(),
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
        organizationId: z.string().min(1).optional(),
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
    "reindex_memory",
    {
      description: "Reindex all memory chunks for a project (and user) scope into Qdrant.",
      inputSchema: {
        organizationId: z.string().min(1).optional(),
        projectKey: z.string().min(1),
        userScopeId: z.string().min(1).optional(),
      },
    },
    async (input) => toToolResult(await registry.reindex_memory(input)),
  );

  server.registerTool(
    "compact_memory",
    {
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
    async (input) => toToolResult(await registry.compact_memory(input)),
  );

  server.registerTool(
    "unarchive_memory",
    {
      description: "Restore one or more archived memory records back to active canonical storage.",
      inputSchema: {
        organizationId: z.string().min(1).optional(),
        archiveIds: z.array(z.number().int()),
      },
    },
    async (input) => toToolResult(await registry.unarchive_memory(input)),
  );

  server.registerTool(
    "list_audit_log",
    {
      description: "Return recent audit log entries scoped to a single organization.",
      inputSchema: {
        organizationId: z.string().min(1).optional(),
        limit: z.number().int().positive().max(1000).optional(),
      },
    },
    async (input) => toToolResult(await registry.list_audit_log(input)),
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
    organizationId: input.organizationId,
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
  // Task is placed at the end (after the body and a delimiter) so the stable
  // body content lives at the cache-eligible prefix. Claude prompt caching is
  // a prefix cache; putting volatile content first invalidates everything that
  // follows. Keep this ordering — see plan-perf review for context.
  return ["# Context Pack", "", body, "", "---", `Task: ${task}`].join("\n");
}

function collectRecords(input: {
  query: string;
  organizationId?: string;
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
        organizationId: input.organizationId,
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
        organizationId: input.organizationId,
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
