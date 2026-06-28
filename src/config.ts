import path from "node:path";

export type ResolveServiceConfigInput = {
  env?: NodeJS.ProcessEnv;
};

export type ServiceConfig = {
  host: string;
  port: number;
  databaseUrl: string;
  vectorBackend: "qdrant" | "pgvector";
  qdrant: {
    url: string;
    apiKey: string;
    collectionName: string;
  };
  openai: {
    apiKey: string;
  };
  embedding: {
    provider: "openai" | "local" | "transformers";
    model: string;
    dimensions: number;
    version: "v1";
    chunkTargetTokens: 800;
    chunkOverlapTokens: 120;
  };
  backups: {
    directory: string;
    targetHost?: string;
    encryptionKeyFile?: string;
  };
};

export function resolveServiceConfig(
  input: ResolveServiceConfigInput = {},
): ServiceConfig {
  const env = input.env ?? process.env;
  const host = env.HOST ?? "127.0.0.1";
  const port = parsePort(env.PORT);
  const databaseUrl = resolveDatabaseUrl(env);

  // EMBEDDING_PROVIDER selects which embedding factory wires up.
  //   "openai"       — historical default, requires OPENAI_API_KEY, paid.
  //   "local"        — deterministic SHA-256 stub for dev/CI/air-gapped use;
  //                    NOT semantically meaningful, plumbing tests only.
  //   "transformers" — free local ONNX inference via the installed
  //                    @huggingface/transformers package. Default model
  //                    Xenova/all-MiniLM-L6-v2, 384-dim. First call downloads
  //                    ~22MB to HF cache.
  // VECTOR_BACKEND selects the vector-search adapter.
  //   "qdrant"   — default; requires QDRANT_URL + QDRANT_API_KEY.
  //   "pgvector" — Postgres-only deploy; reuses the existing PG pool.
  const vectorBackendRaw = (env.VECTOR_BACKEND ?? "qdrant").toLowerCase();
  if (vectorBackendRaw !== "qdrant" && vectorBackendRaw !== "pgvector") {
    throw new Error(
      `Unsupported VECTOR_BACKEND: ${vectorBackendRaw} (expected "qdrant" or "pgvector")`,
    );
  }
  const vectorBackend: "qdrant" | "pgvector" = vectorBackendRaw;

  const providerRaw = (env.EMBEDDING_PROVIDER ?? "transformers").toLowerCase();
  if (
    providerRaw !== "openai" &&
    providerRaw !== "local" &&
    providerRaw !== "transformers"
  ) {
    throw new Error(
      `Unsupported EMBEDDING_PROVIDER: ${providerRaw} (expected "openai", "local", or "transformers")`,
    );
  }
  const provider: "openai" | "local" | "transformers" = providerRaw;

  const openAiApiKey =
    provider === "openai"
      ? requireEnv(env.OPENAI_API_KEY, "OPENAI_API_KEY")
      : env.OPENAI_API_KEY ?? "";

  const dimensions =
    provider === "openai"
      ? 1536
      : provider === "transformers"
        ? parsePositiveInt(env.EMBEDDING_DIMENSIONS, 384)
        : parsePositiveInt(env.EMBEDDING_DIMENSIONS, 384);
  const model =
    provider === "openai"
      ? envOrDefault(
          env.OPENAI_EMBEDDING_MODEL,
          "OPENAI_EMBEDDING_MODEL",
          "text-embedding-3-small",
        )
      : provider === "transformers"
        ? envOrDefault(
            env.TRANSFORMERS_EMBEDDING_MODEL,
            "TRANSFORMERS_EMBEDDING_MODEL",
            "Xenova/all-MiniLM-L6-v2",
          )
        : envOrDefault(
            env.EMBEDDING_MODEL,
            "EMBEDDING_MODEL",
            "local-deterministic-v1",
          );
  const qdrantCollectionName = envOrDefault(
    env.QDRANT_COLLECTION_NAME,
    "QDRANT_COLLECTION_NAME",
    "memory_chunks_v1",
  );

  // Qdrant credentials are only required when qdrant is the active backend.
  const qdrant = vectorBackend === "qdrant"
    ? {
        url: requireEnv(env.QDRANT_URL, "QDRANT_URL"),
        apiKey: requireEnv(env.QDRANT_API_KEY, "QDRANT_API_KEY"),
        collectionName: qdrantCollectionName,
      }
    : {
        url: env.QDRANT_URL ?? "",
        apiKey: env.QDRANT_API_KEY ?? "",
        collectionName: qdrantCollectionName,
      };

  return {
    host,
    port,
    databaseUrl,
    vectorBackend,
    qdrant,
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
      encryptionKeyFile: env.BACKUP_ENCRYPTION_KEY_FILE,
    },
  };
}

function requireEnv(value: string | undefined, name: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function envOrDefault(
  value: string | undefined,
  name: string,
  fallback: string,
): string {
  if (value === undefined) {
    return fallback;
  }
  if (value.trim().length === 0) {
    throw new Error(`Invalid ${name}: expected non-empty string`);
  }
  return value;
}

function parsePort(value: string | undefined): number {
  const raw = value ?? "8787";
  let port: number;
  try {
    port = parsePlainDecimalPositiveInt(raw);
  } catch {
    throw new Error(`Invalid PORT: ${raw}`);
  }

  if (port > 65_535) {
    throw new Error(`Invalid PORT: ${raw}`);
  }

  return port;
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  try {
    return parsePlainDecimalPositiveInt(value);
  } catch {
    throw new Error(`expected positive integer, got "${value}"`);
  }
}

function parsePlainDecimalPositiveInt(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error("expected plain decimal integer");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("expected positive safe integer");
  }
  return parsed;
}

function resolveDatabaseUrl(env: NodeJS.ProcessEnv): string {
  if (env.DATABASE_URL !== undefined) {
    return requireEnv(env.DATABASE_URL, "DATABASE_URL");
  }

  return `postgres://${requireEnv(env.POSTGRES_USER, "POSTGRES_USER")}:${requireEnv(env.POSTGRES_PASSWORD, "POSTGRES_PASSWORD")}@postgres:5432/${requireEnv(env.POSTGRES_DB, "POSTGRES_DB")}`;
}
