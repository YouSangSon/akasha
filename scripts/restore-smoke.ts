import fsp from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { createToolRegistry } from "../src/mcp/server.js";

const execFileAsync = promisify(execFile);

type BackupManifest = {
  createdAt: string;
  postgres: {
    fileName: string;
    sha256: string;
  };
  qdrant: {
    fileName: string;
    sha256: string;
    metadataFileName?: string;
  };
};

export type RunRestoreSmokeInput = {
  startEnvironment: () => Promise<void>;
  restorePostgres: () => Promise<void>;
  restoreQdrant: () => Promise<void>;
  startApp: () => Promise<void>;
  callSearch: () => Promise<unknown[]>;
  callPack: () => Promise<{ ok: boolean }>;
  stopEnvironment: () => Promise<void>;
};

export type RestoreSmokeToolInput = {
  projectKey: string;
  userScopeId?: string;
  organizationId?: string;
};

export function buildRestoreSmokeToolInput(input: RestoreSmokeToolInput) {
  return {
    projectKey: input.projectKey,
    ...(input.userScopeId ? { userScopeId: input.userScopeId } : {}),
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
  };
}

export async function runRestoreSmoke(input: RunRestoreSmokeInput) {
  try {
    await input.startEnvironment();
    await input.restorePostgres();
    await input.restoreQdrant();
    await input.startApp();

    const searchResults = await input.callSearch();

    if (searchResults.length === 0) {
      throw new Error("restore smoke search returned no results");
    }

    const packResult = await input.callPack();

    if (!packResult.ok) {
      throw new Error("restore smoke context pack failed");
    }
  } finally {
    await input.stopEnvironment();
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

async function execShell(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const result = await execFileAsync("sh", ["-lc", command], {
    encoding: "utf8",
    env,
  });

  return result.stdout.trim();
}

async function findLatestManifest(backupDir: string): Promise<{
  fileName: string;
  manifest: BackupManifest;
}> {
  const files = await fsp.readdir(backupDir);
  const fileName = files
    .filter((candidate) => /^manifest-\d{8}-\d{4}\.json$/.test(candidate))
    .sort()
    .at(-1);

  if (!fileName) {
    throw new Error("no backup manifest found in BACKUP_DIR");
  }

  const manifest = JSON.parse(
    await fsp.readFile(path.join(backupDir, fileName), "utf8"),
  ) as Partial<BackupManifest>;

  if (
    !manifest.postgres?.fileName ||
    !manifest.qdrant?.fileName
  ) {
    throw new Error("backup manifest is missing required artifact metadata");
  }

  return {
    fileName,
    manifest: manifest as BackupManifest,
  };
}

async function waitForHealth(url: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }

      lastError = new Error(`health check returned ${response.status}`);
    } catch (error: unknown) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw lastError ?? new Error("health check did not succeed");
}

async function withRestoreServiceEnv<T>(
  restoreEnv: { databaseUrl: string; qdrantUrl: string },
  callback: () => Promise<T>,
): Promise<T> {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousQdrantUrl = process.env.QDRANT_URL;

  process.env.DATABASE_URL = restoreEnv.databaseUrl;
  process.env.QDRANT_URL = restoreEnv.qdrantUrl;

  try {
    return await callback();
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }

    if (previousQdrantUrl === undefined) {
      delete process.env.QDRANT_URL;
    } else {
      process.env.QDRANT_URL = previousQdrantUrl;
    }
  }
}

async function main() {
  const backupDir = requireEnv("BACKUP_DIR");
  const restorePostgresUrl = requireEnv("RESTORE_POSTGRES_URL");
  const restoreQdrantUrl = requireEnv("RESTORE_QDRANT_URL");
  const restorePostgresCommand = requireEnv("RESTORE_SMOKE_POSTGRES_RESTORE_CMD");
  const restoreQdrantCommand = requireEnv("RESTORE_SMOKE_QDRANT_RESTORE_CMD");
  const projectName = process.env.RESTORE_SMOKE_PROJECT ?? "restore-smoke";
  const projectKey = process.env.RESTORE_SMOKE_PROJECT_KEY ?? "project-alpha";
  const userScopeId = process.env.RESTORE_SMOKE_USER_SCOPE_ID?.trim();
  const organizationId = process.env.RESTORE_SMOKE_ORGANIZATION_ID?.trim();
  const searchQuery = process.env.RESTORE_SMOKE_SEARCH_QUERY ?? "continue work";
  const packTask = process.env.RESTORE_SMOKE_PACK_TASK ?? "continue work";
  const appPort = process.env.RESTORE_APP_PORT ?? "18787";
  const { fileName: manifestFileName, manifest } = await findLatestManifest(backupDir);
  const manifestPath = path.join(backupDir, manifestFileName);
  const postgresArtifactPath = path.join(backupDir, manifest.postgres.fileName);
  const qdrantArtifactPath = path.join(backupDir, manifest.qdrant.fileName);
  const qdrantMetadataPath = manifest.qdrant.metadataFileName
    ? path.join(backupDir, manifest.qdrant.metadataFileName)
    : "";
  const composeArgs = [
    "compose",
    "-f",
    "compose.yaml",
    "-f",
    "compose.restore-smoke.yaml",
    "-p",
    projectName,
  ];
  const restoreCommandEnv = {
    ...process.env,
    DATABASE_URL: restorePostgresUrl,
    QDRANT_URL: restoreQdrantUrl,
    RESTORE_SMOKE_MANIFEST_PATH: manifestPath,
    RESTORE_SMOKE_POSTGRES_ARTIFACT_PATH: postgresArtifactPath,
    RESTORE_SMOKE_QDRANT_ARTIFACT_PATH: qdrantArtifactPath,
    RESTORE_SMOKE_QDRANT_METADATA_PATH: qdrantMetadataPath,
  };

  await runRestoreSmoke({
    startEnvironment() {
      return execFileAsync("docker", [
        ...composeArgs,
        "up",
        "-d",
        "postgres",
        "qdrant",
      ]).then(() => undefined);
    },
    restorePostgres() {
      return execShell(restorePostgresCommand, restoreCommandEnv).then(
        () => undefined,
      );
    },
    restoreQdrant() {
      return execShell(restoreQdrantCommand, restoreCommandEnv).then(
        () => undefined,
      );
    },
    async startApp() {
      await execFileAsync("docker", [...composeArgs, "up", "-d", "app"], {
        env: process.env,
      });
      await waitForHealth(`http://127.0.0.1:${appPort}/healthz`);
    },
    callSearch() {
      return withRestoreServiceEnv(
        {
          databaseUrl: restorePostgresUrl,
          qdrantUrl: restoreQdrantUrl,
        },
        async () => {
          const registry = createToolRegistry({ cwd: process.cwd() });
          const toolInput = buildRestoreSmokeToolInput({
            projectKey,
            userScopeId,
            organizationId,
          });
          const result = await registry.search_memory({
            ...toolInput,
            query: searchQuery,
          });

          return result.results;
        },
      );
    },
    callPack() {
      return withRestoreServiceEnv(
        {
          databaseUrl: restorePostgresUrl,
          qdrantUrl: restoreQdrantUrl,
        },
        async () => {
          const registry = createToolRegistry({ cwd: process.cwd() });
          const toolInput = buildRestoreSmokeToolInput({
            projectKey,
            userScopeId,
            organizationId,
          });
          const result = await registry.build_context_pack({
            ...toolInput,
            task: packTask,
          });

          return { ok: result.ok };
        },
      );
    },
    stopEnvironment() {
      return execFileAsync("docker", [...composeArgs, "down", "-v"], {
        env: process.env,
      }).then(() => undefined);
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
