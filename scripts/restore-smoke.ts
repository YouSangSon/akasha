import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

export type RunRestoreSmokeInput = {
  exec: (command: string, args: string[]) => Promise<void>;
  callSearch: () => Promise<unknown[]>;
  callPack: () => Promise<{ ok: boolean }>;
};

export async function runRestoreSmoke(input: RunRestoreSmokeInput) {
  await input.exec("docker", ["compose", "-p", "restore-smoke", "up", "-d"]);

  const searchResults = await input.callSearch();

  if (searchResults.length === 0) {
    throw new Error("restore smoke search returned no results");
  }

  const packResult = await input.callPack();

  if (!packResult.ok) {
    throw new Error("restore smoke context pack failed");
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

async function execShell(command: string): Promise<string> {
  const result = await execFileAsync("sh", ["-lc", command], {
    encoding: "utf8",
  });

  return result.stdout.trim();
}

async function main() {
  const searchCommand = requireEnv("RESTORE_SMOKE_SEARCH_CMD");
  const packCommand = requireEnv("RESTORE_SMOKE_PACK_CMD");

  await runRestoreSmoke({
    exec(command, args) {
      return execFileAsync(command, args).then(() => undefined);
    },
    async callSearch() {
      const output = await execShell(searchCommand);
      return JSON.parse(output) as unknown[];
    },
    async callPack() {
      const output = await execShell(packCommand);
      return JSON.parse(output) as { ok: boolean };
    },
  });

  console.log("restore smoke passed");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
