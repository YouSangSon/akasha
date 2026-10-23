import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCliArgs, type ParsedCliArgs } from "./cli-args.js";
import { writeLifecycleInit } from "./lifecycle/init.js";
import { createToolRegistry, type ToolRegistry } from "./mcp/server.js";
import { bootstrapCanonicalServices } from "./mcp/canonical-services.js";
import type { CanonicalServices } from "./mcp/types.js";
import {
  assertNonBlankString,
  assertObject,
} from "./mcp/tool-registry-validation.js";

export { parseCliArgs, type ParsedCliArgs } from "./cli-args.js";

type RunCliOptions = {
  registry?: ToolRegistry;
  cwd?: string;
};

export async function runCli(
  argv: string[] = process.argv.slice(2),
  options: RunCliOptions = {},
): Promise<string> {
  const parsed = parseCliArgs(argv);
  const normalizedOptions = normalizeRunCliOptions(options);
  const cwd = normalizedOptions.cwd ?? process.cwd();
  let services: Promise<CanonicalServices> | undefined;
  const operations: Promise<unknown>[] = [];
  const getRegistry = () =>
    normalizedOptions.registry ??
    createToolRegistry({
      cwd,
      withCanonicalServices: (callback) => {
        services ??= bootstrapCanonicalServices();
        const operation = services.then(callback);
        operations.push(operation);
        return operation;
      },
    });

  let commandFailed = false;
  let commandError: unknown;
  try {
    return await dispatchCli(parsed, getRegistry, cwd);
  } catch (error: unknown) {
    commandFailed = true;
    commandError = error;
    throw error;
  } finally {
    // Instrumentation starts best-effort audit writes before dispatch settles.
    await Promise.allSettled(operations);
    try {
      await services?.then((value) => value.close?.(), () => undefined);
    } catch (closeError: unknown) {
      if (commandFailed) {
        throw new AggregateError([commandError, closeError], "CLI command and cleanup failed");
      }
      throw new Error("CLI command completed, but service cleanup failed", { cause: closeError });
    }
  }
}

async function dispatchCli(
  parsed: ParsedCliArgs,
  getRegistry: () => ToolRegistry,
  cwd: string,
): Promise<string> {
  switch (parsed.command) {
    case "pack": {
      const registry = getRegistry();
      const pack = await registry.build_context_pack({
        projectKey: parsed.projectKey,
        userScopeId: parsed.userScopeId,
        organizationId: parsed.organizationId,
        task: parsed.task,
      });

      return pack.packMarkdown;
    }
    case "reindex": {
      const registry = getRegistry();
      const result = await registry.reindex_memory({
        projectKey: parsed.projectKey,
        userScopeId: parsed.userScopeId,
        organizationId: parsed.organizationId ?? "default",
      });

      return JSON.stringify(result, null, 2);
    }
    case "remember": {
      const registry = getRegistry();
      const content =
        parsed.content ?? (await readContentFile(parsed.contentFile!, cwd));
      const result = await registry.add_memory({
        projectKey: parsed.projectKey,
        userScopeId: parsed.userScopeId,
        organizationId: parsed.organizationId ?? "default",
        kind: parsed.kind,
        content,
      });

      return JSON.stringify(result, null, 2);
    }
    case "init": {
      const result = await writeLifecycleInit({
        repoDir: cwd,
        projectKey: parsed.projectKey,
        userScopeId: parsed.userScopeId,
        organizationId: parsed.organizationId ?? "default",
        task: parsed.task,
        outDir: parsed.outDir,
        force: parsed.force,
      });

      return JSON.stringify(result, null, 2);
    }
    case "backup-verify":
    case "restore-smoke":
      return JSON.stringify(parsed, null, 2);
  }
}

function normalizeRunCliOptions(options: RunCliOptions): RunCliOptions {
  const candidate = assertObject(options, "CLI options");
  const cwd = candidate.cwd;
  const registry = candidate.registry;

  if (cwd !== undefined) {
    assertNonBlankString(cwd, "cwd");
  }
  if (registry !== undefined) {
    assertObject(registry, "registry");
  }

  return {
    cwd,
    registry: registry as ToolRegistry | undefined,
  };
}

async function readContentFile(filePath: string, cwd: string): Promise<string> {
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(cwd, filePath);
  const content = await fs.readFile(resolved, "utf8");
  if (content.length === 0) {
    throw new Error(`Content file is empty: ${filePath}`);
  }
  return content;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli()
    .then((output) => {
      console.log(output);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
