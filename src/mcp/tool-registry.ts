import {
  createCanonicalServicesResolver,
  createServiceBackedAuditLog,
} from "./canonical-services.js";
import { createToolHandlers } from "./tool-handlers.js";
import type {
  CreateToolRegistryOptions,
  ToolRegistry,
  WithCanonicalServices,
} from "./types.js";
import { rootLogger } from "../logger.js";

export function createToolRegistry(
  options: CreateToolRegistryOptions = {},
): ToolRegistry {
  const cwd = options.cwd ?? process.cwd();
  const withCanonicalServices =
    options.withCanonicalServices ??
    createCanonicalServicesResolver({
      resolveCanonicalServices: options.resolveCanonicalServices,
    });
  const handlers = createToolHandlers({ options, cwd, withCanonicalServices });

  return instrumentToolRegistry({ options, cwd, handlers, withCanonicalServices });
}

function instrumentToolRegistry(input: {
  options: CreateToolRegistryOptions;
  cwd: string;
  handlers: ToolRegistry;
  withCanonicalServices: WithCanonicalServices;
}): ToolRegistry {
  const { options, handlers, withCanonicalServices } = input;
  const serviceBackedAuditLog =
    !hasRepositoryOverrides(options) && !options.retrieveMemory
      ? createServiceBackedAuditLog(withCanonicalServices)
      : undefined;
  const auditLog =
    options.auditLog ??
    (options.resolveCanonicalServices && !options.withCanonicalServices
      ? undefined
      : serviceBackedAuditLog);
  const baseLogger = options.logger ?? rootLogger;
  const defaultActor = options.defaultActor ?? "anonymous";

  async function instrument<T>(
    toolName: string,
    toolInput: {
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
      projectKey: toolInput.projectKey,
      scope: toolInput.scope,
    });
    log.info({ event: "tool.start" }, "tool invoked");
    try {
      const result = await run();
      const durationMs = Date.now() - start;
      log.info({ event: "tool.complete", durationMs }, "tool completed");

      // Best-effort audit write; audit infrastructure outages must not fail
      // the caller.
      void auditLog
        ?.record({
          organizationId: toolInput.organizationId ?? "default",
          actor: defaultActor,
          tool: toolName,
          projectKey: toolInput.projectKey ?? null,
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

      void auditLog
        ?.record({
          organizationId: toolInput.organizationId ?? "default",
          actor: defaultActor,
          tool: toolName,
          projectKey: toolInput.projectKey ?? null,
          outcome: "error",
          errorMessage,
          durationMs,
          requestId,
        })
        .catch(() => undefined);

      throw error;
    }
  }

  return {
    add_memory: (toolInput) =>
      instrument("add_memory", toolInput, () => handlers.add_memory(toolInput)),
    search_memory: (toolInput) =>
      instrument("search_memory", toolInput, () =>
        handlers.search_memory(toolInput),
      ),
    build_context_pack: (toolInput) =>
      instrument("build_context_pack", toolInput, () =>
        handlers.build_context_pack(toolInput),
      ),
    reindex_memory: (toolInput) =>
      instrument("reindex_memory", toolInput, () =>
        handlers.reindex_memory(toolInput),
      ),
    compact_memory: (toolInput) =>
      instrument("compact_memory", toolInput, () =>
        handlers.compact_memory(toolInput),
      ),
    list_memory: (toolInput) =>
      instrument("list_memory", toolInput, () =>
        handlers.list_memory(toolInput),
      ),
    inspect_memory_graph: (toolInput) =>
      instrument("inspect_memory_graph", toolInput, () =>
        handlers.inspect_memory_graph(toolInput),
      ),
    update_memory: (toolInput) =>
      instrument("update_memory", toolInput, () =>
        handlers.update_memory(toolInput),
      ),
    delete_memory: (toolInput) =>
      instrument("delete_memory", toolInput, () =>
        handlers.delete_memory(toolInput),
      ),
    tag_memory: (toolInput) =>
      instrument("tag_memory", toolInput, () =>
        handlers.tag_memory(toolInput),
      ),
    list_audit_log: (toolInput) =>
      instrument("list_audit_log", toolInput, () =>
        handlers.list_audit_log(toolInput),
      ),
    unarchive_memory: (toolInput) =>
      instrument("unarchive_memory", toolInput, () =>
        handlers.unarchive_memory(toolInput),
      ),
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
