import type { Logger } from "../logger.js";
import type {
  CreateToolRegistryOptions,
  ToolRegistry,
  WithCanonicalServices,
} from "../mcp/types.js";
import { createRepositoryAccess } from "../mcp/tool-repository-access.js";
import {
  assertOptionalAllowedValue,
  assertOptionalNonNegativeFiniteNumber,
  assertOptionalPositiveFiniteNumber,
  assertOptionalPositiveInteger,
  assertPositiveIntegerArray,
  assertProvidedScopeIdentifiers,
  requireProjectKey,
  requireUserScopeId,
  resolveUserScopeId,
  SUPPORTED_SCOPE_TYPES,
} from "../mcp/tool-utils.js";
import { applyCompaction } from "./apply-compaction.js";
import { buildCompactionPlan } from "./compact-memory.js";
import { unarchiveCompaction } from "./unarchive-compaction.js";

type CompactionToolHandlers = Pick<
  ToolRegistry,
  "compact_memory" | "unarchive_memory"
>;

export function createCompactionToolHandlers(input: {
  cwd: string;
  hasOverrides: boolean;
  logger: Logger;
  options: CreateToolRegistryOptions;
  withCanonicalServices: WithCanonicalServices;
}): CompactionToolHandlers {
  const { cwd, hasOverrides, logger, options, withCanonicalServices } = input;
  const { withCanonicalRepository, withRepositories } = createRepositoryAccess({
    cwd,
    options,
    withCanonicalServices,
  });

  return {
    async compact_memory(toolInput) {
      assertProvidedScopeIdentifiers(toolInput);
      assertOptionalAllowedValue(toolInput.scope, "scope", SUPPORTED_SCOPE_TYPES);
      assertOptionalPositiveInteger(toolInput.limit, "limit", 5000);
      assertOptionalNonNegativeFiniteNumber(
        toolInput.decayThreshold,
        "decayThreshold",
      );
      assertOptionalPositiveFiniteNumber(toolInput.halfLifeDays, "halfLifeDays");
      assertOptionalPositiveFiniteNumber(
        toolInput.semanticDedupThreshold,
        "semanticDedupThreshold",
        1,
      );
      const scope = toolInput.scope ?? "project";
      const dryRun = toolInput.dryRun ?? true;
      const organizationId = toolInput.organizationId?.trim();
      const projectKey =
        toolInput.projectKey === undefined
          ? undefined
          : requireProjectKey(toolInput.projectKey, "project");
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
              scopeId: requireProjectKey(projectKey, scope),
            };
      const records = hasOverrides
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

              return repository.listMemory(scopeRef, {
                limit: toolInput.limit,
                organizationId,
                allowLegacyAnonymous: process.env.LEGACY_ANONYMOUS_SEARCH === "true",
                excludePinnedGoalRuns: true,
              });
            },
          )
        : await withCanonicalRepository((repository) =>
            repository.listMemory(scopeRef, {
              limit: toolInput.limit,
              organizationId,
              allowLegacyAnonymous: process.env.LEGACY_ANONYMOUS_SEARCH === "true",
              excludePinnedGoalRuns: true,
            }),
          );
      const targetLabel =
        scope === "user"
          ? requireUserScopeId(userScopeId)
          : requireProjectKey(projectKey, scope);

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
          projectKey,
          dryRun: true,
          decayThreshold: toolInput.decayThreshold,
          halfLifeDays: toolInput.halfLifeDays,
        });
      }

      return await withCanonicalServices((services) =>
        applyCompaction(
          {
            records,
            scope,
            scopeLabel: targetLabel,
            projectKey,
            dryRun,
            decayThreshold: toolInput.decayThreshold,
            halfLifeDays: toolInput.halfLifeDays,
            semanticDedupThreshold: toolInput.semanticDedupThreshold,
            organizationId: organizationId ?? "default",
            actor: "compact_memory",
          },
          {
            archiveRepository: services.archiveRepository,
            vectorIndex: services.vectorIndex,
            embeddings: services.embeddings,
            writes: services.writes,
            logger,
          },
        ),
      );
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
      if (!Array.isArray(toolInput.archiveIds)) {
        throw new Error("archiveIds must be an array");
      }
      assertPositiveIntegerArray(toolInput.archiveIds, "archiveIds");
      if (toolInput.archiveIds.length === 0) {
        return {
          ok: true,
          outcomes: [],
          restoredCount: 0,
          skippedCount: 0,
          failedCount: 0,
        };
      }
      return await withCanonicalServices(async (services) => {
        const organizationId = toolInput.organizationId?.trim() ?? "default";
        const result = await unarchiveCompaction(
          {
            archiveIds: toolInput.archiveIds,
            organizationId,
            actor: "unarchive_memory",
          },
          {
            archiveRepository: services.archiveRepository,
            chunkRepository: services.chunkRepository,
            writes: services.writes,
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
            logger,
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
