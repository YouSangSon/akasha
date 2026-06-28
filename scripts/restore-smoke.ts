import fsp from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { createToolRegistry } from "../src/mcp/server.js";

const execFileAsync = promisify(execFile);

const DEFAULT_QDRANT_COLLECTION_NAME = "memory_chunks_v1";
const DEFAULT_RESTORE_APP_PORT = "18787";

export type BackupManifest = {
  createdAt: string;
  vectorBackend?: "qdrant" | "pgvector";
  postgres: {
    fileName: string;
    sha256: string;
  };
  qdrant?: {
    fileName: string;
    sha256: string;
    metadataFileName?: string;
    collectionName?: string;
  };
};

export type RunRestoreSmokeInput = {
  startEnvironment: () => Promise<void>;
  restorePostgres: () => Promise<void>;
  restoreQdrant?: () => Promise<void>;
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

export type BuildRestoreSmokeCommandEnvInput = {
  env?: NodeJS.ProcessEnv;
  databaseUrl: string;
  vectorBackend: "qdrant" | "pgvector";
  qdrantUrl?: string;
  manifest: BackupManifest;
  manifestPath: string;
  postgresArtifactPath: string;
  qdrantArtifactPath: string;
  qdrantMetadataPath: string;
};

export function buildRestoreSmokeToolInput(input: RestoreSmokeToolInput) {
  const projectKey = requireRestoreSmokeText(input.projectKey, "projectKey");
  const userScopeId = optionalRestoreSmokeText(input.userScopeId, "userScopeId");
  const organizationId = optionalRestoreSmokeText(
    input.organizationId,
    "organizationId",
  );

  return {
    projectKey,
    ...(userScopeId !== undefined ? { userScopeId } : {}),
    ...(organizationId !== undefined ? { organizationId } : {}),
  };
}

export function resolveRestoreAppPort(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.RESTORE_APP_PORT ?? DEFAULT_RESTORE_APP_PORT;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid RESTORE_APP_PORT: ${raw}`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`Invalid RESTORE_APP_PORT: ${raw}`);
  }
  return raw;
}

function requireRestoreSmokeText(value: string, name: string): string {
  if (value.trim().length === 0) {
    throw new Error(`${name} must contain non-whitespace text`);
  }
  return value;
}

function optionalRestoreSmokeText(
  value: string | undefined,
  name: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireRestoreSmokeText(value, name);
}

function resolveQdrantCollectionName(
  manifest: BackupManifest,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const manifestCollection = optionalTrimmedRestoreSmokeText(
    manifest.qdrant?.collectionName,
    "manifest qdrant.collectionName",
  );
  if (manifestCollection !== undefined) {
    return manifestCollection;
  }

  const envCollection = optionalTrimmedRestoreSmokeText(
    env.QDRANT_COLLECTION_NAME,
    "QDRANT_COLLECTION_NAME",
  );
  return envCollection ?? DEFAULT_QDRANT_COLLECTION_NAME;
}

function optionalTrimmedRestoreSmokeText(
  value: string | undefined,
  name: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${name} must contain non-whitespace text`);
  }
  return trimmed;
}

export function buildRestoreSmokeCommandEnv(
  input: BuildRestoreSmokeCommandEnvInput,
): NodeJS.ProcessEnv {
  const env = input.env ?? process.env;
  const qdrantCollectionName =
    input.vectorBackend === "qdrant"
      ? resolveQdrantCollectionName(input.manifest, env)
      : undefined;

  return {
    ...env,
    DATABASE_URL: input.databaseUrl,
    VECTOR_BACKEND: input.vectorBackend,
    ...(input.qdrantUrl ? { QDRANT_URL: input.qdrantUrl } : {}),
    ...(qdrantCollectionName
      ? {
          QDRANT_COLLECTION_NAME: qdrantCollectionName,
          RESTORE_SMOKE_QDRANT_COLLECTION_NAME: qdrantCollectionName,
        }
      : {}),
    RESTORE_SMOKE_MANIFEST_PATH: input.manifestPath,
    RESTORE_SMOKE_POSTGRES_ARTIFACT_PATH: input.postgresArtifactPath,
    RESTORE_SMOKE_QDRANT_ARTIFACT_PATH: input.qdrantArtifactPath,
    RESTORE_SMOKE_QDRANT_METADATA_PATH: input.qdrantMetadataPath,
  };
}

export async function runRestoreSmoke(input: RunRestoreSmokeInput) {
  try {
    await input.startEnvironment();
    await input.restorePostgres();
    if (input.restoreQdrant) {
      await input.restoreQdrant();
    }
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
    !manifest.postgres?.fileName
  ) {
    throw new Error("backup manifest is missing required artifact metadata");
  }

  if (
    manifest.vectorBackend !== "pgvector" &&
    !manifest.qdrant?.fileName
  ) {
    throw new Error("backup manifest is missing required Qdrant artifact metadata");
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
  restoreEnv: {
    databaseUrl: string;
    vectorBackend: "qdrant" | "pgvector";
    qdrantUrl?: string;
    qdrantCollectionName?: string;
  },
  callback: () => Promise<T>,
): Promise<T> {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousQdrantUrl = process.env.QDRANT_URL;
  const previousQdrantCollectionName = process.env.QDRANT_COLLECTION_NAME;
  const previousVectorBackend = process.env.VECTOR_BACKEND;

  process.env.DATABASE_URL = restoreEnv.databaseUrl;
  process.env.VECTOR_BACKEND = restoreEnv.vectorBackend;
  if (restoreEnv.qdrantUrl) {
    process.env.QDRANT_URL = restoreEnv.qdrantUrl;
  } else {
    delete process.env.QDRANT_URL;
  }
  if (restoreEnv.qdrantCollectionName) {
    process.env.QDRANT_COLLECTION_NAME = restoreEnv.qdrantCollectionName;
  }

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

    if (previousQdrantCollectionName === undefined) {
      delete process.env.QDRANT_COLLECTION_NAME;
    } else {
      process.env.QDRANT_COLLECTION_NAME = previousQdrantCollectionName;
    }

    if (previousVectorBackend === undefined) {
      delete process.env.VECTOR_BACKEND;
    } else {
      process.env.VECTOR_BACKEND = previousVectorBackend;
    }
  }
}

async function main() {
  const backupDir = requireEnv("BACKUP_DIR");
  const restorePostgresUrl = requireEnv("RESTORE_POSTGRES_URL");
  const restorePostgresCommand = requireEnv("RESTORE_SMOKE_POSTGRES_RESTORE_CMD");
  const projectName = process.env.RESTORE_SMOKE_PROJECT ?? "restore-smoke";
  const projectKey = process.env.RESTORE_SMOKE_PROJECT_KEY ?? "project-alpha";
  const userScopeId = process.env.RESTORE_SMOKE_USER_SCOPE_ID?.trim();
  const organizationId = process.env.RESTORE_SMOKE_ORGANIZATION_ID?.trim();
  const searchQuery = process.env.RESTORE_SMOKE_SEARCH_QUERY ?? "continue work";
  const packTask = process.env.RESTORE_SMOKE_PACK_TASK ?? "continue work";
  const appPort = resolveRestoreAppPort();
  const { fileName: manifestFileName, manifest } = await findLatestManifest(backupDir);
  const vectorBackend = manifest.vectorBackend ?? "qdrant";
  const restoreQdrantUrl =
    vectorBackend === "qdrant" ? requireEnv("RESTORE_QDRANT_URL") : undefined;
  const restoreQdrantCommand =
    vectorBackend === "qdrant"
      ? requireEnv("RESTORE_SMOKE_QDRANT_RESTORE_CMD")
      : undefined;
  const manifestPath = path.join(backupDir, manifestFileName);
  const postgresArtifactPath = path.join(backupDir, manifest.postgres.fileName);
  const qdrantArtifactPath = manifest.qdrant?.fileName
    ? path.join(backupDir, manifest.qdrant.fileName)
    : "";
  const qdrantMetadataPath = manifest.qdrant?.metadataFileName
    ? path.join(backupDir, manifest.qdrant.metadataFileName)
    : "";
  const qdrantCollectionName =
    vectorBackend === "qdrant"
      ? resolveQdrantCollectionName(manifest)
      : undefined;
  const composeArgs = [
    "compose",
    "-f",
    "compose.yaml",
    ...(vectorBackend === "pgvector" ? ["-f", "compose.pgvector.yaml"] : []),
    "-f",
    "compose.restore-smoke.yaml",
    "-p",
    projectName,
  ];
  const composeEnv = {
    ...process.env,
    VECTOR_BACKEND: vectorBackend,
    ...(qdrantCollectionName
      ? { QDRANT_COLLECTION_NAME: qdrantCollectionName }
      : {}),
  };
  const restoreCommandEnv = buildRestoreSmokeCommandEnv({
    databaseUrl: restorePostgresUrl,
    vectorBackend,
    qdrantUrl: restoreQdrantUrl,
    manifest,
    manifestPath,
    postgresArtifactPath,
    qdrantArtifactPath,
    qdrantMetadataPath,
  });

  await runRestoreSmoke({
    startEnvironment() {
      return execFileAsync("docker", [
        ...composeArgs,
        "up",
        "-d",
        "postgres",
        ...(vectorBackend === "qdrant" ? ["qdrant"] : []),
      ], {
        env: composeEnv,
      }).then(() => undefined);
    },
    restorePostgres() {
      return execShell(restorePostgresCommand, restoreCommandEnv).then(
        () => undefined,
      );
    },
    ...(restoreQdrantCommand
      ? {
          restoreQdrant() {
            return execShell(restoreQdrantCommand, restoreCommandEnv).then(
              () => undefined,
            );
          },
        }
      : {}),
    async startApp() {
      await execFileAsync("docker", [...composeArgs, "up", "-d", "app"], {
        env: composeEnv,
      });
      await waitForHealth(`http://127.0.0.1:${appPort}/healthz`);
    },
    callSearch() {
      return withRestoreServiceEnv(
        {
          databaseUrl: restorePostgresUrl,
          vectorBackend,
          qdrantUrl: restoreQdrantUrl,
          qdrantCollectionName,
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
          vectorBackend,
          qdrantUrl: restoreQdrantUrl,
          qdrantCollectionName,
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
        env: composeEnv,
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
