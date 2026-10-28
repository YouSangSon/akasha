import { assertNoSecrets } from "../store/secret-scrub.js";
import { embedSimilarityBatch } from "../embedding/embedding-provider.js";
import { assertNonBlankText } from "../store/memory-content.js";
import type { ScopeType } from "../types.js";
import type { CanonicalServices, ToolRegistry, WithCanonicalServices } from "../mcp/types.js";
import { withMemoryRecordWrite } from "../mcp/memory-write-services.js";
import {
  assertAllowedValue,
  assertOptionalAllowedValue,
  assertOptionalPositiveInteger,
  assertPositiveInteger,
  assertPositiveIntegerArray,
  assertProvidedScopeIdentifiers,
  ensureGovernanceCanonicalMode,
  optionalNonBlankText,
  requireProjectKey,
  requireUserScopeId,
  resolveUserScopeId,
  SUPPORTED_GOAL_RUN_OUTCOMES,
  SUPPORTED_GOAL_RUN_STATUSES,
  SUPPORTED_SCOPE_TYPES,
} from "../mcp/tool-utils.js";
import { buildGoalContextPack } from "./build-goal-context.js";
import {
  DEFAULT_REPEAT_THRESHOLD,
  findRepeatAttempts,
} from "./find-repeat-attempts.js";

type GoalRunToolHandlers = Pick<
  ToolRegistry,
  | "start_goal_run"
  | "record_iteration"
  | "get_goal_run"
  | "list_goal_runs"
  | "complete_goal_run"
  | "abandon_goal_run"
  | "build_goal_context"
  | "check_repeat_attempt"
>;

export function createGoalRunToolHandlers(input: {
  cwd: string;
  defaultUserScopeId?: string;
  hasGovernanceOverrides: boolean;
  withCanonicalServices: WithCanonicalServices;
}): GoalRunToolHandlers {
  const {
    cwd,
    defaultUserScopeId,
    hasGovernanceOverrides,
    withCanonicalServices,
  } = input;

  return {
    async start_goal_run(toolInput) {
      ensureGovernanceCanonicalMode(hasGovernanceOverrides);
      assertNonBlankText(toolInput.goal, "goal");
      const goal = toolInput.goal.trim();
      assertOptionalAllowedValue(toolInput.scope, "scope", SUPPORTED_SCOPE_TYPES);
      const scope = toolInput.scope ?? "project";
      const scopeId = resolveGoalRunScopeId(scope, toolInput, {
        cwd,
        defaultUserScopeId,
      });
      const terminationCriteria = optionalNonBlankText(
        toolInput.terminationCriteria,
        "terminationCriteria",
      );
      assertNoSecrets(goal);
      if (terminationCriteria) {
        assertNoSecrets(terminationCriteria);
      }
      return await withCanonicalServices(async (services) => {
        const goalRun = await services.goalRuns.start({
          organizationId: toolInput.organizationId?.trim() ?? "default",
          scopeType: scope,
          scopeId,
          projectKey: scope === "project" ? scopeId : null,
          goal,
          terminationCriteria,
        });
        return { ok: true, goalRun };
      });
    },

    async record_iteration(toolInput) {
      ensureGovernanceCanonicalMode(hasGovernanceOverrides);
      assertPositiveInteger(toolInput.goalRunId, "goalRunId");
      assertNonBlankText(toolInput.attempt, "attempt");
      const attempt = toolInput.attempt.trim();
      assertAllowedValue(
        toolInput.outcome,
        "outcome",
        SUPPORTED_GOAL_RUN_OUTCOMES,
      );
      assertPositiveIntegerArray(toolInput.memoryIds, "memoryIds");
      const summary = optionalNonBlankText(toolInput.summary, "summary");
      const error = optionalNonBlankText(toolInput.error, "error");
      assertNoSecrets(attempt);
      if (summary) {
        assertNoSecrets(summary);
      }
      if (error) {
        assertNoSecrets(error);
      }
      const organizationId = toolInput.organizationId?.trim() ?? "default";
      const recordIteration = async (services: CanonicalServices) => {
        const iteration = await services.goalRuns.recordIteration({
          organizationId,
          goalRunId: toolInput.goalRunId,
          attempt,
          outcome: toolInput.outcome,
          summary,
          error,
          memoryIds: toolInput.memoryIds,
        });
        return { ok: true as const, iteration };
      };
      return toolInput.memoryIds && toolInput.memoryIds.length > 0
        ? await withMemoryRecordWrite(withCanonicalServices, organizationId, toolInput.memoryIds, recordIteration)
        : await withCanonicalServices(recordIteration);
    },

    async get_goal_run(toolInput) {
      ensureGovernanceCanonicalMode(hasGovernanceOverrides);
      assertPositiveInteger(toolInput.goalRunId, "goalRunId");
      return await withCanonicalServices(async (services) => {
        const goalRun = await services.goalRuns.get({
          organizationId: toolInput.organizationId?.trim() ?? "default",
          goalRunId: toolInput.goalRunId,
        });
        return { ok: true, goalRun };
      });
    },

    async list_goal_runs(toolInput) {
      ensureGovernanceCanonicalMode(hasGovernanceOverrides);
      assertOptionalAllowedValue(toolInput.scope, "scope", SUPPORTED_SCOPE_TYPES);
      assertOptionalAllowedValue(
        toolInput.status,
        "status",
        SUPPORTED_GOAL_RUN_STATUSES,
      );
      const scope = toolInput.scope ?? "project";
      const scopeId = resolveGoalRunScopeId(scope, toolInput, {
        cwd,
        defaultUserScopeId,
      });
      return await withCanonicalServices(async (services) => {
        const goalRuns = await services.goalRuns.list({
          organizationId: toolInput.organizationId?.trim() ?? "default",
          scopeType: scope,
          scopeId,
          status: toolInput.status,
        });
        return { ok: true, goalRuns };
      });
    },

    async complete_goal_run(toolInput) {
      ensureGovernanceCanonicalMode(hasGovernanceOverrides);
      assertPositiveInteger(toolInput.goalRunId, "goalRunId");
      const resolution = optionalNonBlankText(toolInput.resolution, "resolution");
      if (resolution) {
        assertNoSecrets(resolution);
      }
      return await withCanonicalServices(async (services) => {
        const goalRun = await services.goalRuns.complete({
          organizationId: toolInput.organizationId?.trim() ?? "default",
          goalRunId: toolInput.goalRunId,
          note: resolution,
        });
        return { ok: true, goalRun };
      });
    },

    async abandon_goal_run(toolInput) {
      ensureGovernanceCanonicalMode(hasGovernanceOverrides);
      assertPositiveInteger(toolInput.goalRunId, "goalRunId");
      const reason = optionalNonBlankText(toolInput.reason, "reason");
      if (reason) {
        assertNoSecrets(reason);
      }
      return await withCanonicalServices(async (services) => {
        const goalRun = await services.goalRuns.abandon({
          organizationId: toolInput.organizationId?.trim() ?? "default",
          goalRunId: toolInput.goalRunId,
          note: reason,
        });
        return { ok: true, goalRun };
      });
    },

    async build_goal_context(toolInput) {
      ensureGovernanceCanonicalMode(hasGovernanceOverrides);
      assertPositiveInteger(toolInput.goalRunId, "goalRunId");
      assertOptionalPositiveInteger(toolInput.limit, "limit", 200);
      return await withCanonicalServices(async (services) => {
        const organizationId = toolInput.organizationId?.trim() ?? "default";
        const goalRun = await services.goalRuns.get({
          organizationId,
          goalRunId: toolInput.goalRunId,
        });
        if (!goalRun) {
          return {
            ok: true,
            found: false,
            goalRunId: toolInput.goalRunId,
            packMarkdown: "",
          };
        }
        const records = await services.repository.listMemory(
          { scopeType: goalRun.scopeType, scopeId: goalRun.scopeId },
          {
            organizationId,
            limit: toolInput.limit ?? GOAL_CONTEXT_RECORD_LIMIT,
          },
        );
        const pack = buildGoalContextPack({ goalRun, records });
        return {
          ok: true,
          found: true,
          goalRunId: goalRun.id,
          packMarkdown: pack.markdown,
        };
      });
    },

    async check_repeat_attempt(toolInput) {
      ensureGovernanceCanonicalMode(hasGovernanceOverrides);
      assertPositiveInteger(toolInput.goalRunId, "goalRunId");
      assertNonBlankText(toolInput.attempt, "attempt");
      const attempt = toolInput.attempt.trim();
      assertNoSecrets(attempt);
      const threshold = resolveRepeatThreshold(toolInput.threshold);
      return await withCanonicalServices(async (services) => {
        const organizationId = toolInput.organizationId?.trim() ?? "default";
        const goalRun = await services.goalRuns.get({
          organizationId,
          goalRunId: toolInput.goalRunId,
        });
        if (!goalRun) {
          return { ok: true, found: false, repeat: false, threshold, matches: [] };
        }

        const failures = goalRun.iterations.filter(
          (iteration) =>
            iteration.outcome === "failure" && iteration.attempt.trim().length > 0,
        );
        if (failures.length === 0) {
          return { ok: true, found: true, repeat: false, threshold, matches: [] };
        }

        const vectors = await embedSimilarityBatch(services.embeddings, [
          attempt,
          ...failures.map((failure) => failure.attempt),
        ]);
        const candidateEmbedding = vectors[0];
        if (!candidateEmbedding) {
          return { ok: true, found: true, repeat: false, threshold, matches: [] };
        }

        const priorFailures = failures
          .map((failure, index) => ({
            iterationIndex: failure.iterationIndex,
            attempt: failure.attempt,
            embedding: vectors[index + 1] ?? [],
          }))
          .filter(
            (failure) => failure.embedding.length === candidateEmbedding.length,
          );
        const matches = findRepeatAttempts({
          candidateEmbedding,
          priorFailures,
          threshold,
        });

        return {
          ok: true,
          found: true,
          repeat: matches.length > 0,
          threshold,
          matches,
        };
      });
    },
  };
}

const GOAL_CONTEXT_RECORD_LIMIT = 50;

function resolveRepeatThreshold(threshold: number | undefined): number {
  if (threshold === undefined) {
    return DEFAULT_REPEAT_THRESHOLD;
  }
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error("threshold must be greater than 0 and at most 1");
  }
  return threshold;
}

function resolveGoalRunScopeId(
  scope: ScopeType,
  toolInput: { projectKey?: string; userScopeId?: string },
  resolutionInput: { cwd: string; defaultUserScopeId?: string },
): string {
  assertProvidedScopeIdentifiers(toolInput);
  if (scope === "user") {
    return requireUserScopeId(
      resolveUserScopeId({
        cwd: resolutionInput.cwd,
        explicitUserScopeId: toolInput.userScopeId,
        defaultUserScopeId: resolutionInput.defaultUserScopeId,
      }),
    );
  }
  return requireProjectKey(toolInput.projectKey, scope);
}
