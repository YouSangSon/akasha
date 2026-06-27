import { applyCompaction } from "../compact/apply-compaction.js";
import { buildCompactionPlan } from "../compact/compact-memory.js";
import { unarchiveCompaction } from "../compact/unarchive-compaction.js";
import { buildContextPack } from "../context-pack/build-context-pack.js";
import { rootLogger } from "../logger.js";
import { rankResults } from "../search/rank-results.js";
import { retrieveMemory as retrieveMemoryFromQdrant } from "../search/retrieve-memory.js";
import { createServiceBackedAuditLog } from "./canonical-services.js";
import {
  refreshCanonicalMemoryIndex,
  reindexCanonicalMemory,
  writeCanonicalMemory,
} from "../store/canonical-indexing.js";
import type {
  AddMemoryInput,
  CanonicalMemoryRepository,
  MemoryRepository,
  SearchMemoryResult,
} from "../types.js";
import type {
  AddMemoryToolInput,
  CanonicalServices,
  CreateToolRegistryOptions,
  MaybePromise,
  RetrieveMemoryServiceInput,
  ToolRegistry,
  WithCanonicalServices,
} from "./types.js";
import {
  normalizeLimit,
  requireProjectKey,
  requireUserScopeId,
  resolveUserScopeId,
  summarize,
  toMemoryType,
} from "./tool-utils.js";

export function createToolHandlers(input: {
  options: CreateToolRegistryOptions;
  cwd: string;
  withCanonicalServices: WithCanonicalServices;
}): ToolRegistry {
  const { options, cwd, withCanonicalServices } = input;
  const baseLogger = options.logger ?? rootLogger;
  const hasOverrides = hasRepositoryOverrides(options);
  const hasGovernanceOverrides = hasOverrides || Boolean(options.retrieveMemory);
  const serviceBackedAuditLog =
    !hasOverrides && !options.retrieveMemory
      ? createServiceBackedAuditLog(withCanonicalServices)
      : undefined;
  const auditLogForListing = options.auditLog ?? serviceBackedAuditLog;

  async function withRepositories<T>(
    repositoryInput: {
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
      explicitUserScopeId: repositoryInput.userScopeId,
      defaultUserScopeId: options.defaultUserScopeId,
    });

    if (options.projectRepository || options.userRepository) {
      return await callback({
        projectRepository: options.projectRepository,
        userRepository:
          repositoryInput.includeUser === false ? undefined : options.userRepository,
        userScopeId,
      });
    }

    if (options.resolveRepository && repositoryInput.projectKey) {
      const resolved = options.resolveRepository(repositoryInput.projectKey);

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

  async function retrieveRecordsWithCanonicalServices(
    services: CanonicalServices,
    serviceInput: RetrieveMemoryServiceInput,
  ): Promise<SearchMemoryResult[]> {
    const vector = await services.embeddings.embed(serviceInput.query);

    return retrieveMemoryFromQdrant({
      vectorIndex: services.vectorIndex,
      repository: services.repository,
      vector,
      query: serviceInput.query,
      organizationId: serviceInput.organizationId,
      // Default-strict: undefined organizationId throws unless the operator
      // explicitly opted into the legacy single-tenant org-blind read by
      // setting LEGACY_ANONYMOUS_SEARCH=true. Resolved from process.env at
      // call time so runtime config flips take effect without a restart.
      allowLegacyAnonymous: process.env.LEGACY_ANONYMOUS_SEARCH === "true",
      projectKey: serviceInput.projectKey,
      userScopeId: serviceInput.userScopeId,
      limit: serviceInput.limit,
    });
  }

  async function resolveRecords(input: {
    organizationId?: string;
    projectKey: string;
    query: string;
    userScopeId?: string;
    includeUser?: boolean;
    limit?: number;
  }): Promise<SearchMemoryResult[]> {
    const limit = normalizeLimit(input.limit);
    const userScopeId =
      input.includeUser === false
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

    if (hasOverrides) {
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

  return {
    async add_memory(toolInput) {
      const scope = toolInput.scope ?? "project";
      const userScopeId = resolveUserScopeId({
        cwd,
        explicitUserScopeId: toolInput.userScopeId,
        defaultUserScopeId: options.defaultUserScopeId,
      });

      const createdRecord = hasOverrides
        ? await withRepositories(
            {
              projectKey: toolInput.projectKey,
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
                  ...toolInput,
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
                ...toolInput,
                scope,
                userScopeId,
              }),
            }),
          );

      return {
        ok: true,
        memoryId: String(createdRecord.id),
        summary: summarize(toolInput.content),
      };
    },

    async search_memory(toolInput) {
      const results = await resolveRecords({
        organizationId: toolInput.organizationId,
        projectKey: toolInput.projectKey,
        query: toolInput.query,
        userScopeId: toolInput.userScopeId,
        includeUser: toolInput.includeUser,
        limit: toolInput.limit,
      });

      return {
        ok: true,
        projectKey: toolInput.projectKey,
        query: toolInput.query,
        results,
      };
    },

    async build_context_pack(toolInput) {
      const useServiceBackedPack =
        !hasOverrides && !options.retrieveMemory;
      const builtPack = useServiceBackedPack
        ? await withCanonicalServices(async (services) => {
            const records = await retrieveRecordsWithCanonicalServices(services, {
              organizationId: toolInput.organizationId,
              projectKey: toolInput.projectKey,
              query: toolInput.task,
              userScopeId:
                toolInput.includeUser === false
                  ? undefined
                  : resolveUserScopeId({
                      cwd,
                      explicitUserScopeId: toolInput.userScopeId,
                      defaultUserScopeId: options.defaultUserScopeId,
                    }),
              limit: normalizeLimit(toolInput.limit),
            });
            const pack = buildContextPack({ records });
            const packMarkdown = renderContextPackMarkdown(
              toolInput.task,
              pack.markdown,
            );
            const selectedMemoryIds = pack.selectionRationale.map(
              (entry) => entry.memoryId,
            );

            await services.chunkRepository.createContextPackRun({
              organizationId: toolInput.organizationId ?? "default",
              projectKey: toolInput.projectKey,
              task: toolInput.task,
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
              organizationId: toolInput.organizationId,
              projectKey: toolInput.projectKey,
              query: toolInput.task,
              userScopeId: toolInput.userScopeId,
              includeUser: toolInput.includeUser,
              limit: toolInput.limit,
            });
            const pack = buildContextPack({ records });

            return {
              pack,
              packMarkdown: renderContextPackMarkdown(
                toolInput.task,
                pack.markdown,
              ),
              selectedMemoryIds: pack.selectionRationale.map(
                (entry) => entry.memoryId,
              ),
            };
          })();

      return {
        ok: true,
        projectKey: toolInput.projectKey,
        packMarkdown: builtPack.packMarkdown,
        selectedMemoryIds: builtPack.selectedMemoryIds,
        sections: builtPack.pack.sections,
        selectionRationale: builtPack.pack.selectionRationale,
      };
    },

    async reindex_memory(toolInput) {
      if (!toolInput.organizationId) {
        throw new Error(
          "reindex_memory requires organizationId: omitting it would reindex chunks " +
            "across all tenants sharing the same scope, violating data isolation. " +
            "Pass the caller's organization identifier.",
        );
      }
      const organizationId: string = toolInput.organizationId;
      const userScopeId = resolveUserScopeId({
        cwd,
        explicitUserScopeId: toolInput.userScopeId,
        defaultUserScopeId: options.defaultUserScopeId,
      });
      const scopes = [
        {
          scopeType: "project" as const,
          scopeId: toolInput.projectKey,
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
        projectKey: toolInput.projectKey,
        scopes: scopes.map((scope) => `${scope.scopeType}:${scope.scopeId}`),
        chunkCount: result.chunkCount,
      };
    },

    async compact_memory(toolInput) {
      const scope = toolInput.scope ?? "project";
      const dryRun = toolInput.dryRun ?? true;
      const userScopeId = resolveUserScopeId({
        cwd,
        explicitUserScopeId: toolInput.userScopeId,
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
              scopeId: requireProjectKey(toolInput.projectKey, scope),
            };
      const records = hasOverrides
        ? await withRepositories(
            {
              projectKey: toolInput.projectKey,
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
                limit: toolInput.limit,
                organizationId: toolInput.organizationId,
                allowLegacyAnonymous: process.env.LEGACY_ANONYMOUS_SEARCH === "true",
                excludePinnedGoalRuns: true,
              });
            },
          )
        : await withCanonicalRepository((repository) =>
            repository.listMemory(scopeRef, {
              limit: toolInput.limit,
              organizationId: toolInput.organizationId,
              allowLegacyAnonymous: process.env.LEGACY_ANONYMOUS_SEARCH === "true",
              excludePinnedGoalRuns: true,
            }),
          );
      const targetLabel =
        scope === "user"
          ? requireUserScopeId(userScopeId)
          : requireProjectKey(toolInput.projectKey, scope);

      // Legacy override mode (in-process MemoryRepository, no Postgres):
      // dry-run only; no semantic dedup; no apply path.
      if (hasOverrides) {
        if (!dryRun) {
          throw new Error(
            "compact_memory apply path requires canonical services (Postgres + Qdrant); " +
              "legacy repository overrides are read-only. Use dryRun=true.",
          );
        }
        if (toolInput.semanticDedupThreshold !== undefined) {
          throw new Error(
            "compact_memory semantic dedup requires canonical services (embedding client). " +
              "Legacy repository overrides do not provide one.",
          );
        }
        return buildCompactionPlan({
          records,
          scope,
          scopeLabel: targetLabel,
          projectKey: toolInput.projectKey,
          dryRun: true,
          decayThreshold: toolInput.decayThreshold,
          halfLifeDays: toolInput.halfLifeDays,
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
            projectKey: toolInput.projectKey,
            dryRun,
            decayThreshold: toolInput.decayThreshold,
            halfLifeDays: toolInput.halfLifeDays,
            semanticDedupThreshold: toolInput.semanticDedupThreshold,
            organizationId: toolInput.organizationId ?? "default",
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

    async list_memory(toolInput) {
      ensureGovernanceCanonicalMode(hasGovernanceOverrides);
      const scope = toolInput.scope ?? "project";
      const userScopeId = resolveUserScopeId({
        cwd,
        explicitUserScopeId: toolInput.userScopeId,
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
              scopeId: requireProjectKey(toolInput.projectKey, scope),
            };
      const organizationId = toolInput.organizationId ?? "default";

      const memories = await withCanonicalRepository((repository) =>
        repository.listMemoryForGovernance(scopeRef, {
          organizationId,
          includeArchived: toolInput.includeArchived,
          tag: toolInput.tag,
          limit: toolInput.limit,
        }),
      );

      return {
        ok: true,
        scopeType: scopeRef.scopeType,
        scopeId: scopeRef.scopeId,
        memories,
      };
    },

    async inspect_memory_graph(toolInput) {
      ensureGovernanceCanonicalMode(hasGovernanceOverrides);
      const scope = toolInput.scope ?? "project";
      const userScopeId = resolveUserScopeId({
        cwd,
        explicitUserScopeId: toolInput.userScopeId,
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
              scopeId: requireProjectKey(toolInput.projectKey, scope),
            };
      const organizationId = toolInput.organizationId ?? "default";

      const graph = await withCanonicalRepository((repository) =>
        repository.inspectMemoryGraph(scopeRef, {
          organizationId,
          kind: toolInput.kind,
          query: toolInput.query,
          includeArchived: toolInput.includeArchived,
          limit: toolInput.limit,
          relationshipLimit: toolInput.relationshipLimit,
        }),
      );

      return {
        ok: true,
        scopeType: scopeRef.scopeType,
        scopeId: scopeRef.scopeId,
        entities: graph.entities,
        relationships: graph.relationships,
      };
    },

    async update_memory(toolInput) {
      ensureGovernanceCanonicalMode(hasGovernanceOverrides);
      return await withCanonicalServices(async (services) => {
        const organizationId = toolInput.organizationId ?? "default";
        const memory = await services.repository.updateMemoryRecord({
          id: toolInput.memoryId,
          organizationId,
          kind: toolInput.kind,
          title: toolInput.title,
          content: toolInput.content,
          summary: toolInput.summary,
          importance: toolInput.importance,
          durability: toolInput.durability,
          tags: toolInput.tags,
        });

        if (!memory) {
          return {
            ok: true,
            updated: false,
          };
        }

        if (shouldRefreshMemoryIndex(toolInput)) {
          await refreshCanonicalMemoryIndex({
            chunkRepository: services.chunkRepository,
            ingestJobs: services.ingestJobs,
            embeddings: services.embeddings,
            vectorIndex: services.vectorIndex,
            embedding: canonicalEmbeddingConfig(services),
            record: memory,
          });
        }

        return {
          ok: true,
          updated: true,
          memory,
        };
      });
    },

    async delete_memory(toolInput) {
      ensureGovernanceCanonicalMode(hasGovernanceOverrides);
      return await withCanonicalServices(async (services) => {
        const organizationId = toolInput.organizationId ?? "default";
        const archived = await services.repository.archiveMemoryRecord({
          id: toolInput.memoryId,
          organizationId,
        });

        if (archived.qdrantPointIds.length === 0) {
          return {
            ok: true,
            archived: archived.archived,
            qdrantPointsDeleted: 0,
            qdrantPointsPending: 0,
          };
        }

        try {
          await services.vectorIndex.delete(archived.qdrantPointIds, {
            organizationId,
          });
          return {
            ok: true,
            archived: archived.archived,
            qdrantPointsDeleted: archived.qdrantPointIds.length,
            qdrantPointsPending: 0,
          };
        } catch (error: unknown) {
          baseLogger.warn(
            {
              event: "memory.delete_vector_cleanup_failed",
              memoryId: toolInput.memoryId,
              organizationId,
              qdrantPointCount: archived.qdrantPointIds.length,
              err: error,
            },
            "delete_memory archived the record but vector cleanup remains pending",
          );
          return {
            ok: true,
            archived: archived.archived,
            qdrantPointsDeleted: 0,
            qdrantPointsPending: archived.qdrantPointIds.length,
          };
        }
      });
    },

    async tag_memory(toolInput) {
      ensureGovernanceCanonicalMode(hasGovernanceOverrides);
      return await withCanonicalServices(async (services) => {
        const organizationId = toolInput.organizationId ?? "default";
        const memory = await services.repository.updateMemoryRecord({
          id: toolInput.memoryId,
          organizationId,
          tags: toolInput.tags,
        });

        if (!memory) {
          return {
            ok: true,
            updated: false,
          };
        }

        await refreshCanonicalMemoryIndex({
          chunkRepository: services.chunkRepository,
          ingestJobs: services.ingestJobs,
          embeddings: services.embeddings,
          vectorIndex: services.vectorIndex,
          embedding: canonicalEmbeddingConfig(services),
          record: memory,
        });

        return {
          ok: true,
          updated: true,
          memory,
        };
      });
    },

    async list_audit_log(toolInput) {
      if (!auditLogForListing) {
        throw new Error(
          "audit log not configured: pass options.auditLog to enable list_audit_log",
        );
      }
      const organizationId = toolInput.organizationId ?? "default";
      const entries = await auditLogForListing.listByOrganization(
        organizationId,
        { limit: toolInput.limit },
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

    async unarchive_memory(toolInput) {
      // Apply path requires canonical services (archiveRepository +
      // chunkRepository + embeddings + qdrantClient). Legacy override mode
      // doesn't have any of those.
      if (hasOverrides) {
        throw new Error(
          "unarchive_memory requires canonical services (Postgres + Qdrant); " +
            "legacy repository overrides are not supported.",
        );
      }
      if (!Array.isArray(toolInput.archiveIds) || toolInput.archiveIds.length === 0) {
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
            archiveIds: toolInput.archiveIds,
            organizationId: toolInput.organizationId ?? "default",
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

function ensureGovernanceCanonicalMode(hasOverrides: boolean): void {
  if (hasOverrides) {
    throw new Error(
      "memory governance tools require canonical services (Postgres + vector index); " +
        "legacy repository or retrieval overrides are not supported.",
    );
  }
}

function shouldRefreshMemoryIndex(input: {
  kind?: unknown;
  content?: unknown;
  summary?: unknown;
  durability?: unknown;
  tags?: unknown;
}): boolean {
  return (
    input.kind !== undefined ||
    input.content !== undefined ||
    input.summary !== undefined ||
    input.durability !== undefined ||
    input.tags !== undefined
  );
}

function canonicalEmbeddingConfig(services: CanonicalServices) {
  return {
    provider: services.config.embedding.provider,
    model: services.config.embedding.model,
    dimensions: services.config.embedding.dimensions,
    version: services.config.embedding.version,
    targetTokens: services.config.embedding.chunkTargetTokens,
    overlapTokens: services.config.embedding.chunkOverlapTokens,
  };
}

function hasRepositoryOverrides(options: CreateToolRegistryOptions): boolean {
  return Boolean(
    options.repository ||
      options.projectRepository ||
      options.userRepository ||
      options.resolveRepository,
  );
}
