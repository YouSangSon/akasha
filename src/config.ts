import os from "node:os";
import path from "node:path";

export type ProjectPathsInput = {
  cwd: string;
  projectKey: string;
};

export type UserPathsInput = {
  userScopeId: string;
};

export type ResolveServiceConfigInput = {
  env?: NodeJS.ProcessEnv;
};

export type ServiceConfig = {
  host: string;
  port: number;
  databaseUrl: string;
  qdrant: {
    url: string;
    apiKey: string;
    collectionName: string;
  };
  openai: {
    apiKey: string;
  };
  embedding: {
    provider: "openai";
    model: string;
    dimensions: 1536;
    version: "v1";
    chunkTargetTokens: 800;
    chunkOverlapTokens: 120;
  };
  backups: {
    directory: string;
    targetHost: string;
  };
};

export function resolveProjectPaths(input: ProjectPathsInput) {
  const stateDir = path.join(
    os.homedir(),
    ".developer-memory-os",
    input.projectKey,
  );

  return {
    cwd: input.cwd,
    projectKey: input.projectKey,
    stateDir,
    dbPath: path.join(stateDir, "memory.db"),
  };
}

export function resolveUserPaths(input: UserPathsInput) {
  const stateDir = path.join(
    os.homedir(),
    ".developer-memory-os",
    "users",
    input.userScopeId,
  );

  return {
    userScopeId: input.userScopeId,
    stateDir,
    dbPath: path.join(stateDir, "memory.db"),
  };
}

export function resolveServiceConfig(
  input: ResolveServiceConfigInput = {},
): ServiceConfig {
  const env = input.env ?? process.env;
  const host = env.HOST ?? "127.0.0.1";
  const port = parsePort(env.PORT);
  const openAiApiKey = requireEnv(env.OPENAI_API_KEY, "OPENAI_API_KEY");

  return {
    host,
    port,
    databaseUrl: requireEnv(env.DATABASE_URL, "DATABASE_URL"),
    qdrant: {
      url: requireEnv(env.QDRANT_URL, "QDRANT_URL"),
      apiKey: requireEnv(env.QDRANT_API_KEY, "QDRANT_API_KEY"),
      collectionName: env.QDRANT_COLLECTION_NAME ?? "memory_chunks_v1",
    },
    openai: {
      apiKey: openAiApiKey,
    },
    embedding: {
      provider: "openai",
      model: env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
      dimensions: 1536,
      version: "v1",
      chunkTargetTokens: 800,
      chunkOverlapTokens: 120,
    },
    backups: {
      directory:
        env.BACKUP_DIR ??
        path.join(process.cwd(), ".developer-memory-os", "backups"),
      targetHost: requireEnv(env.BACKUP_TARGET_HOST, "BACKUP_TARGET_HOST"),
    },
  };
}

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parsePort(value: string | undefined): number {
  const raw = value ?? "8787";
  const port = Number(raw);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid PORT: ${raw}`);
  }

  return port;
}
