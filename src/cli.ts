import { pathToFileURL } from "node:url";
import { createToolRegistry } from "./mcp/server.js";

export type ParsedCliArgs =
  | {
      command: "pack";
      projectKey: string;
      userScopeId?: string;
      task: string;
    }
  | {
      command: "reindex";
      projectKey: string;
      userScopeId?: string;
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

  if (command !== "pack" && command !== "reindex") {
    throw new Error(`Unsupported command: ${command ?? "(missing)"}`);
  }

  let projectKey: string | undefined;
  let userScopeId: string | undefined;
  let task: string | undefined;

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
    };
  }

  return {
    command: "pack",
    projectKey,
    userScopeId,
    task: task!,
  };
}

export async function runCli(
  argv: string[] = process.argv.slice(2),
): Promise<string> {
  const parsed = parseCliArgs(argv);
  const registry = createToolRegistry({
    cwd: process.cwd(),
  });

  switch (parsed.command) {
    case "pack": {
      const pack = await registry.build_context_pack({
        projectKey: parsed.projectKey,
        userScopeId: parsed.userScopeId,
        task: parsed.task,
      });

      return pack.packMarkdown;
    }
    case "reindex":
      return JSON.stringify(parsed, null, 2);
    case "backup-verify":
    case "restore-smoke":
      return JSON.stringify(parsed, null, 2);
  }
}

function requireFlagValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) {
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
