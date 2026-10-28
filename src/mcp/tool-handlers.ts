import { createAuditToolHandlers } from "../audit/tool-handlers.js";
import { createCompactionToolHandlers } from "../compact/tool-handlers.js";
import { buildContextPackResult } from "./context-pack-result.js";
import { createGoalRunToolHandlers } from "../goal-run/tool-handlers.js";
import { rootLogger } from "../logger.js";
import { embedQuery } from "../embedding/embedding-provider.js";
import { rankResults } from "../search/rank-results.js";
import { retrieveMemory as retrieveMemoryFromQdrant } from "../search/retrieve-memory.js";
import { createServiceBackedAuditLog } from "./canonical-services.js";
import { withMemoryRecordWrite, updateWithIndexIntent } from "./memory-write-services.js";
import {
  refreshCanonicalMemoryIndex,
  writeCanonicalMemory,
} from "../store/canonical-indexing.js";
import { createStoreToolHandlers } from "../store/tool-handlers.js";
import { createPendingIndexJob } from "../store/memory-write-coordinator.js";
import {
  assertNonBlankMemoryContent,
  assertNonBlankText,
} from "../store/memory-content.js";
import { ENTITY_KIND_VALUES } from "../entities/entity-extraction.js";
import type {
  AddMemoryInput,
  IngestJob,
  MemoryRepository,
  SearchMemoryResult,
} from "../types.js";
import type {
  AddMemoryToolInput,
  CanonicalServices,
  CreateToolRegistryOptions,
  RetrieveMemoryServiceInput,
  ToolRegistry,
  WithCanonicalServices,
} from "./types.js";
import { createRepositoryAccess } from "./tool-repository-access.js";
import {
  assertCreateToolRegistryOptions,
  assertFunction,
  assertNonBlankString,
  assertObject,
} from "./tool-registry-validation.js";
import {
  assertAllowedValue,
  assertOptionalAllowedValue,
  assertOptionalPositiveInteger,
  assertOptionalPostgresInteger,
  assertPositiveInteger,
  assertProvidedScopeIdentifiers,
  ensureGovernanceCanonicalMode,
  normalizeLimit,
  optionalNonBlankText,
  requireProjectKey,
  requireUserScopeId,
  resolveUserScopeId,
  SUPPORTED_DURABILITY_VALUES,
  SUPPORTED_MEMORY_KINDS,
  SUPPORTED_SCOPE_TYPES,
  summarize,
  toMemoryType,
} from "./tool-utils.js";

export function createToolHandlers(input: {
  options: CreateToolRegistryOptions;
  cwd: string;
  withCanonicalServices: WithCanonicalServices;
}): ToolRegistry {
  assertCreateToolHandlersInput(input);

  const { options, cwd, withCanonicalServices } = input;
  const baseLogger = options.logger ?? rootLogger;
  const hasOverrides = hasRepositoryOverrides(options);
  const hasGovernanceOverrides = hasOverrides || Boolean(options.retrieveMemory);
  const serviceBackedAuditLog =
    !hasOverrides && !options.retrieveMemory
      ? createServiceBackedAuditLog(withCanonicalServices)
      : undefined;
  const auditLogForListing = options.auditLog ?? serviceBackedAuditLog;
  const { withCanonicalRepository, withRepositories } = createRepositoryAccess({
    cwd,
    options,
    withCanonicalServices,
  });

  async function retrieveRecordsWithCanonicalServices(
    services: CanonicalServices,
    serviceInput: RetrieveMemoryServiceInput,
  ): Promise<SearchMemoryResult[]> {
    const vector = await embedQuery(services.embeddings, serviceInput.query);

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
    assertProvidedScopeIdentifiers(input);
    const limit = normalizeLimit(input.limit);
    const projectKey = requireProjectKey(input.projectKey, "project");
    const organizationId = input.organizationId?.trim();
    const userScopeId =
      input.includeUser === false
        ? undefined
        : requireUserScopeId(
            resolveUserScopeId({
              cwd,
              explicitUserScopeId: input.userScopeId,
              defaultUserScopeId: options.defaultUserScopeId,
            }),
          );

    if (options.retrieveMemory) {
      return options.retrieveMemory({
        organizationId,
        projectKey,
        userScopeId,
        query: input.query,
        limit,
      });
    }

    if (hasOverrides) {
      return withRepositories(
        {
          projectKey,
          userScopeId,
          includeUser: input.includeUser,
        },
        ({ projectRepository, userRepository }) =>
          collectRecords({
            query: input.query,
            limit,
            organizationId,
            projectKey,
            projectRepository,
            userScopeId,
            userRepository:
              input.includeUser === false ? undefined : userRepository,
          }),
      );
    }

    return withCanonicalServices((services) =>
      retrieveRecordsWithCanonicalServices(services, {
        organizationId,
        projectKey,
        query: input.query,
        userScopeId,
        limit,
      }),
    );
  }

  return {
    async add_memory(toolInput) {
      assertNonBlankMemoryContent(toolInput.content);
      assertProvidedScopeIdentifiers(toolInput);
      assertOptionalAllowedValue(toolInput.scope, "scope", SUPPORTED_SCOPE_TYPES);
      assertAllowedValue(toolInput.kind, "kind", SUPPORTED_MEMORY_KINDS);

      const scope = toolInput.scope ?? "project";
      const projectKey =
        toolInput.projectKey === undefined
          ? undefined
          : requireProjectKey(toolInput.projectKey, "project");
      const userScopeId = resolveUserScopeId({
        cwd,
        explicitUserScopeId: toolInput.userScopeId,
        defaultUserScopeId: options.defaultUserScopeId,
      });

      const createdRecord = hasOverrides
        ? await withRepositories(
            {
              projectKey,
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
                  projectKey,
                  scope,
                  userScopeId,
                }),
              );
            },
          )
        : await withCanonicalServices((services) =>
            writeCanonicalMemory({
              writes: services.writes,
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
                projectKey,
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
      assertNonBlankText(toolInput.query, "search query");
      assertProvidedScopeIdentifiers(toolInput);
      const projectKey = requireProjectKey(toolInput.projectKey, "project");
      const query = toolInput.query.trim();

      const results = await resolveRecords({
        organizationId: toolInput.organizationId?.trim(),
        projectKey,
        query,
        userScopeId: toolInput.userScopeId,
        includeUser: toolInput.includeUser,
        limit: toolInput.limit,
      });

      return {
        ok: true,
        projectKey,
        query,
        results,
      };
    },

    async build_context_pack(toolInput) {
      assertNonBlankText(toolInput.task, "context-pack task");
      assertProvidedScopeIdentifiers(toolInput);
      assertOptionalPositiveInteger(toolInput.maxOutputBytes, "maxOutputBytes");
      const projectKey = requireProjectKey(toolInput.projectKey, "project");
      const organizationId = toolInput.organizationId?.trim();
      const task = toolInput.task.trim();

      const useServiceBackedPack =
        !hasOverrides && !options.retrieveMemory;
      const builtPack = useServiceBackedPack
        ? await withCanonicalServices(async (services) => {
            const records = await retrieveRecordsWithCanonicalServices(services, {
              organizationId,
              projectKey,
              query: task,
              userScopeId:
                toolInput.includeUser === false
                  ? undefined
                  : requireUserScopeId(
                      resolveUserScopeId({
                        cwd,
                        explicitUserScopeId: toolInput.userScopeId,
                        defaultUserScopeId: options.defaultUserScopeId,
                      }),
                    ),
              limit: normalizeLimit(toolInput.limit),
            });
            const result = buildContextPackResult({ projectKey, task, records, maxOutputBytes: toolInput.maxOutputBytes });

            await services.chunkRepository.createContextPackRun({
              organizationId: organizationId ?? "default",
              projectKey,
              task,
              selectedMemoryIds: result.selectedMemoryIds,
              packMarkdown: result.packMarkdown,
            });

            return result;
          })
        : await (async () => {
            const records = await resolveRecords({
              organizationId,
              projectKey,
              query: task,
              userScopeId: toolInput.userScopeId,
              includeUser: toolInput.includeUser,
              limit: toolInput.limit,
            });
            return buildContextPackResult({ projectKey, task, records, maxOutputBytes: toolInput.maxOutputBytes });
          })();

      return builtPack;
    },

    ...createStoreToolHandlers({
      cwd,
      defaultUserScopeId: options.defaultUserScopeId,
      withCanonicalServices,
    }),

    async list_memory(toolInput) {
      ensureGovernanceCanonicalMode(hasGovernanceOverrides);
      assertProvidedScopeIdentifiers(toolInput);
      assertOptionalAllowedValue(toolInput.scope, "scope", SUPPORTED_SCOPE_TYPES);
      if (toolInput.tag !== undefined) {
        assertNonBlankText(toolInput.tag, "memory tag");
      }
      const tag =
        toolInput.tag === undefined ? undefined : toolInput.tag.trim();
      assertOptionalPositiveInteger(toolInput.limit, "limit", 5000);
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
      const organizationId = toolInput.organizationId?.trim() ?? "default";

      const memories = await withCanonicalRepository((repository) =>
        repository.listMemoryForGovernance(scopeRef, {
          organizationId,
          includeArchived: toolInput.includeArchived,
          tag,
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
      assertProvidedScopeIdentifiers(toolInput);
      assertOptionalAllowedValue(toolInput.scope, "scope", SUPPORTED_SCOPE_TYPES);
      assertOptionalAllowedValue(toolInput.kind, "kind", ENTITY_KIND_VALUES);
      if (toolInput.query !== undefined) {
        assertNonBlankText(toolInput.query, "graph query");
      }
      const query =
        toolInput.query === undefined ? undefined : toolInput.query.trim();
      assertOptionalPositiveInteger(toolInput.limit, "limit", 5000);
      assertOptionalPositiveInteger(
        toolInput.relationshipLimit,
        "relationshipLimit",
        5000,
      );
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
      const organizationId = toolInput.organizationId?.trim() ?? "default";

      const graph = await withCanonicalRepository((repository) =>
        repository.inspectMemoryGraph(scopeRef, {
          organizationId,
          kind: toolInput.kind,
          query,
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
      assertPositiveInteger(toolInput.memoryId, "memoryId");
      if (toolInput.content !== undefined) {
        assertNonBlankMemoryContent(toolInput.content);
      }
      assertOptionalAllowedValue(toolInput.kind, "kind", SUPPORTED_MEMORY_KINDS);
      assertOptionalAllowedValue(
        toolInput.durability,
        "durability",
        SUPPORTED_DURABILITY_VALUES,
      );
      assertOptionalPostgresInteger(toolInput.importance, "importance");
      assertNonBlankTags(toolInput.tags);
      const title =
        toolInput.title === undefined
          ? undefined
          : optionalNonBlankText(toolInput.title);
      const summary =
        toolInput.summary === undefined
          ? undefined
          : optionalNonBlankText(toolInput.summary);

      const organizationId = toolInput.organizationId?.trim() ?? "default";
      return await withMemoryRecordWrite(withCanonicalServices, organizationId, [toolInput.memoryId], async (services) => {
        const refresh = shouldRefreshMemoryIndex(toolInput);
        const { memory, job } = await updateWithIndexIntent(services, {
          id: toolInput.memoryId,
          organizationId,
          kind: toolInput.kind,
          title,
          content: toolInput.content,
          summary,
          importance: toolInput.importance,
          durability: toolInput.durability,
          tags: toolInput.tags,
        }, refresh);

        if (!memory) {
          return {
            ok: true,
            updated: false,
          };
        }

        if (refresh) {
          await refreshCanonicalMemoryIndex({
            job,
            reuseUnchangedChunks: Boolean(services.writes),
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
      assertPositiveInteger(toolInput.memoryId, "memoryId");
      const organizationId = toolInput.organizationId?.trim() ?? "default";
      return await withMemoryRecordWrite(withCanonicalServices, organizationId, [toolInput.memoryId], async (services) => {
        let job: IngestJob | undefined;
        const archiveInput = {
          id: toolInput.memoryId,
          organizationId,
        };
        const archived = services.writes
          ? await services.repository.archiveMemoryRecord(archiveInput, async (recordId) => {
            job = await createPendingIndexJob(services.ingestJobs, recordId, organizationId);
          })
          : await services.repository.archiveMemoryRecord(archiveInput);

        if (!job && archived.qdrantPointIds.length === 0) {
          return {
            ok: true,
            archived: archived.archived,
            qdrantPointsDeleted: 0,
            qdrantPointsPending: 0,
          };
        }

        try {
          if (job) {
            await services.vectorIndex.deleteByRecordIds([toolInput.memoryId], { organizationId });
            await services.ingestJobs.markCompleted(job.id);
            await services.ingestJobs.markQdrantCompleted(job.id);
          } else {
            await services.vectorIndex.delete(archived.qdrantPointIds, { organizationId });
          }
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
            ...(job ? { indexCleanupPending: true } : {}),
          };
        }
      });
    },

    async tag_memory(toolInput) {
      ensureGovernanceCanonicalMode(hasGovernanceOverrides);
      assertPositiveInteger(toolInput.memoryId, "memoryId");
      assertNonBlankTags(toolInput.tags);
      const organizationId = toolInput.organizationId?.trim() ?? "default";
      return await withMemoryRecordWrite(withCanonicalServices, organizationId, [toolInput.memoryId], async (services) => {
        const { memory, job } = await updateWithIndexIntent(services, {
          id: toolInput.memoryId,
          organizationId,
          tags: toolInput.tags,
        }, true);

        if (!memory) {
          return {
            ok: true,
            updated: false,
          };
        }

        await refreshCanonicalMemoryIndex({
          job,
          reuseUnchangedChunks: Boolean(services.writes),
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

    ...createCompactionToolHandlers({
      cwd,
      hasOverrides,
      logger: baseLogger,
      options,
      withCanonicalServices,
    }),
    ...createAuditToolHandlers({ auditLog: auditLogForListing }),
    ...createGoalRunToolHandlers({
      cwd,
      defaultUserScopeId: options.defaultUserScopeId,
      hasGovernanceOverrides,
      withCanonicalServices,
    }),
  };
}

function assertNonBlankTags(tags: readonly string[] | undefined): void {
  if (tags === undefined) {
    return;
  }
  if (!Array.isArray(tags)) {
    throw new Error("tags must be an array");
  }
  for (const tag of tags) {
    assertNonBlankText(tag, "tag");
  }
}

function toRepositoryAddMemoryInput(input: AddMemoryToolInput): AddMemoryInput {
  assertProvidedScopeIdentifiers(input);
  const scope = input.scope ?? "project";
  const scopeId =
    scope === "user"
      ? requireUserScopeId(input.userScopeId)
      : requireProjectKey(input.projectKey, scope);

  return {
    organizationId: input.organizationId?.trim(),
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

function assertCreateToolHandlersInput(
  value: unknown,
): asserts value is {
  options: CreateToolRegistryOptions;
  cwd: string;
  withCanonicalServices: WithCanonicalServices;
} {
  const candidate = assertObject(value, "tool handlers input");
  assertCreateToolRegistryOptions(candidate.options);
  assertNonBlankString(candidate.cwd, "cwd");
  assertFunction(candidate.withCanonicalServices, "withCanonicalServices");
}

function hasRepositoryOverrides(options: CreateToolRegistryOptions): boolean {
  return Boolean(
    options.repository ||
      options.projectRepository ||
      options.userRepository ||
      options.resolveRepository,
  );
}
