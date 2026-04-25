import path from "node:path";

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
    provider: "openai" | "local";
    model: string;
    dimensions: number;
    version: "v1";
    chunkTargetTokens: 800;
    chunkOverlapTokens: 120;
  };
  backups: {
    directory: string;
    targetHost?: string;
  };
};

export function resolveServiceConfig(
  input: ResolveServiceConfigInput = {},
): ServiceConfig {
  const env = input.env ?? process.env;
  const host = env.HOST ?? "127.0.0.1";
  const port = parsePort(env.PORT);
  const databaseUrl = resolveDatabaseUrl(env);

  // EMBEDDING_PROVIDER selects which embedding factory wires up. "openai" is
  // the historical default and requires OPENAI_API_KEY. "local" is a
  // deterministic offline provider for dev/CI/air-gapped use — does not call
  // any remote service and does not need an API key.
  const providerRaw = (env.EMBEDDING_PROVIDER ?? "openai").toLowerCase();
  if (providerRaw !== "openai" && providerRaw !== "local") {
    throw new Error(
      `Unsupported EMBEDDING_PROVIDER: ${providerRaw} (expected "openai" or "local")`,
    );
  }
  const provider: "openai" | "local" = providerRaw;

  const openAiApiKey =
    provider === "openai"
      ? requireEnv(env.OPENAI_API_KEY, "OPENAI_API_KEY")
      : env.OPENAI_API_KEY ?? "";

  const dimensions =
    provider === "local"
      ? parsePositiveInt(env.EMBEDDING_DIMENSIONS, 384)
      : 1536;
  const model =
    provider === "local"
      ? env.EMBEDDING_MODEL ?? "local-deterministic-v1"
      : env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

  return {
    host,
    port,
    databaseUrl,
    qdrant: {
      url: requireEnv(env.QDRANT_URL, "QDRANT_URL"),
      apiKey: requireEnv(env.QDRANT_API_KEY, "QDRANT_API_KEY"),
      collectionName: env.QDRANT_COLLECTION_NAME ?? "memory_chunks_v1",
    },
    openai: {
      apiKey: openAiApiKey,
    },
    embedding: {
      provider,
      model,
      dimensions,
      version: "v1",
      chunkTargetTokens: 800,
      chunkOverlapTokens: 120,
    },
    backups: {
      directory:
        env.BACKUP_DIR ??
        path.join(process.cwd(), ".developer-memory-os", "backups"),
      targetHost: env.BACKUP_TARGET_HOST,
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

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`expected positive integer, got "${value}"`);
  }
  return parsed;
}

function resolveDatabaseUrl(env: NodeJS.ProcessEnv): string {
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }

  return `postgres://${requireEnv(env.POSTGRES_USER, "POSTGRES_USER")}:${requireEnv(env.POSTGRES_PASSWORD, "POSTGRES_PASSWORD")}@postgres:5432/${requireEnv(env.POSTGRES_DB, "POSTGRES_DB")}`;
}
