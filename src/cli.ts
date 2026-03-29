import { pathToFileURL } from "node:url";
import { buildContextPack } from "./context-pack/build-context-pack.js";
import {
  createProjectRuntime,
} from "./mcp/server.js";

export type ParsedCliArgs = {
  command: "pack";
  projectKey: string;
  task: string;
};

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const [command, ...rest] = argv;

  if (command !== "pack") {
    throw new Error(`Unsupported command: ${command ?? "(missing)"}`);
  }

  let projectKey: string | undefined;
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

    throw new Error(`Unsupported argument: ${token}`);
  }

  if (!projectKey) {
    throw new Error("Missing required --project argument");
  }

  if (!task) {
    throw new Error("Missing required --task argument");
  }

  return {
    command,
    projectKey,
    task,
  };
}

export function runCli(argv: string[] = process.argv.slice(2)): string {
  const parsed = parseCliArgs(argv);
  const runtime = createProjectRuntime({
    cwd: process.cwd(),
    projectKey: parsed.projectKey,
  });

  try {
    const pack = buildContextPack({
      records: runtime.repository.searchMemory({
        query: parsed.task,
        scopes: [
          {
            scopeType: "project",
            scopeId: parsed.projectKey,
          },
        ],
      }),
    });

    return pack.markdown;
  } finally {
    runtime.close();
  }
}

function requireFlagValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(runCli());
  } catch (error: unknown) {
    console.error(error);
    process.exit(1);
  }
}
