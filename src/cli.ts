import { pathToFileURL } from "node:url";
import { writeLifecycleInit } from "./lifecycle/init.js";
import { createToolRegistry, type ToolRegistry } from "./mcp/server.js";

export type ParsedCliArgs =
  | {
      command: "pack";
      projectKey: string;
      userScopeId?: string;
      organizationId?: string;
      task: string;
    }
  | {
      command: "reindex";
      projectKey: string;
      userScopeId?: string;
      organizationId?: string;
    }
  | {
      command: "remember";
      projectKey: string;
      userScopeId?: string;
      organizationId?: string;
      kind: string;
      content: string;
    }
  | {
      command: "init";
      projectKey: string;
      userScopeId?: string;
      organizationId?: string;
      task?: string;
      outDir?: string;
      force: boolean;
    }
  | {
      command: "backup-verify";
    }
  | {
      command: "restore-smoke";
    };

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const [command, ...rest] = argv;

  if (command === "backup-verify" || command === "restore-smoke") {
    if (rest.length > 0) {
      throw new Error(`Unsupported argument: ${rest[0]}`);
    }

    return { command };
  }

  if (command === "init") {
    return parseInitArgs(rest);
  }

  if (command === "remember") {
    return parseRememberArgs(rest);
  }

  if (command !== "pack" && command !== "reindex") {
    throw new Error(`Unsupported command: ${command ?? "(missing)"}`);
  }

  let projectKey: string | undefined;
  let userScopeId: string | undefined;
  let task: string | undefined;
  let organizationId: string | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];

    if (token === "--project") {
      projectKey = requireFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--task") {
      task = requireFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--user") {
      userScopeId = requireFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--organization-id") {
      organizationId = requireFlagValue(token, value);
      index += 1;
      continue;
    }

    throw new Error(`Unsupported argument: ${token}`);
  }

  if (!projectKey) {
    throw new Error("Missing required --project argument");
  }

  if (command === "pack" && !task) {
    throw new Error("Missing required --task argument");
  }

  if (command === "reindex") {
    return {
      command,
      projectKey,
      userScopeId,
      organizationId,
    };
  }

  return {
    command: "pack",
    projectKey,
    userScopeId,
    organizationId,
    task: task!,
  };
}

export async function runCli(
  argv: string[] = process.argv.slice(2),
  options: {
    registry?: ToolRegistry;
    cwd?: string;
  } = {},
): Promise<string> {
  const parsed = parseCliArgs(argv);
  const cwd = options.cwd ?? process.cwd();
  const getRegistry = () =>
    options.registry ??
    createToolRegistry({
      cwd,
    });

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
      const result = await registry.add_memory({
        projectKey: parsed.projectKey,
        userScopeId: parsed.userScopeId,
        organizationId: parsed.organizationId ?? "default",
        kind: parsed.kind,
        content: parsed.content,
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

function parseRememberArgs(rest: string[]): ParsedCliArgs {
  let projectKey: string | undefined;
  let userScopeId: string | undefined;
  let organizationId: string | undefined;
  let kind: string | undefined;
  let content: string | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];

    if (token === "--project") {
      projectKey = requireFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--user") {
      userScopeId = requireFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--organization-id") {
      organizationId = requireFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--kind") {
      kind = requireFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--content") {
      content = requireFlagValue(token, value, { allowLeadingDash: true });
      index += 1;
      continue;
    }

    throw new Error(`Unsupported argument: ${token}`);
  }

  if (!projectKey) {
    throw new Error("Missing required --project argument");
  }
  if (!kind) {
    throw new Error("Missing required --kind argument");
  }
  if (!content) {
    throw new Error("Missing required --content argument");
  }

  return {
    command: "remember",
    projectKey,
    userScopeId,
    organizationId,
    kind,
    content,
  };
}

function parseInitArgs(rest: string[]): ParsedCliArgs {
  let projectKey: string | undefined;
  let userScopeId: string | undefined;
  let organizationId: string | undefined;
  let task: string | undefined;
  let outDir: string | undefined;
  let force = false;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];

    if (token === "--project") {
      projectKey = requireFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--user") {
      userScopeId = requireFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--organization-id") {
      organizationId = requireFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--task") {
      task = requireFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--out-dir") {
      outDir = requireFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--force") {
      force = true;
      continue;
    }

    throw new Error(`Unsupported argument: ${token}`);
  }

  if (!projectKey) {
    throw new Error("Missing required --project argument");
  }

  return {
    command: "init",
    projectKey,
    userScopeId,
    organizationId,
    task,
    outDir,
    force,
  };
}

function requireFlagValue(
  flag: string,
  value: string | undefined,
  options: { allowLeadingDash?: boolean } = {},
): string {
  if (!value || (!options.allowLeadingDash && value.startsWith("--"))) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli()
    .then((output) => {
      console.log(output);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
