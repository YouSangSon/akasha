import { describe, expect, it } from "vitest";
import { resolveServiceConfig } from "../../src/config.js";

const BASE_ENV = {
  DATABASE_URL: "postgres://memory:memory@postgres:5432/memory_os",
  QDRANT_URL: "http://qdrant:6333",
  QDRANT_API_KEY: "local-qdrant-key",
};

describe("resolveServiceConfig", () => {
  it("parses Postgres, Qdrant, OpenAI, and optional backup settings when EMBEDDING_PROVIDER=openai is set explicitly", () => {
    const config = resolveServiceConfig({
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "8787",
        DATABASE_URL: "postgres://memory:memory@postgres:5432/memory_os",
        QDRANT_URL: "http://qdrant:6333",
        QDRANT_API_KEY: "local-qdrant-key",
        EMBEDDING_PROVIDER: "openai",
        OPENAI_API_KEY: "test-openai-key",
        OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
        BACKUP_DIR: "/var/lib/developer-memory-os/backups",
        BACKUP_TARGET_HOST: "backup@example.internal",
        BACKUP_ENCRYPTION_KEY_FILE: "/run/secrets/akasha-backup-data-key",
      },
    });

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(8787);
    expect(config.databaseUrl).toContain("postgres://memory:memory");
    expect(config.qdrant.url).toBe("http://qdrant:6333");
    expect(config.openai.apiKey).toBe("test-openai-key");
    expect(config.embedding.provider).toBe("openai");
    expect(config.embedding.model).toBe("text-embedding-3-small");
    expect(config.embedding.dimensions).toBe(1536);
    expect(config.backups.targetHost).toBe("backup@example.internal");
    expect(config.backups.encryptionKeyFile).toBe(
      "/run/secrets/akasha-backup-data-key",
    );
  });

  it("defaults to the transformers provider with Xenova/all-MiniLM-L6-v2 (384-dim) when EMBEDDING_PROVIDER is unset, with no OPENAI_API_KEY required", () => {
    const config = resolveServiceConfig({
      env: {
        DATABASE_URL: "postgres://memory:memory@postgres:5432/memory_os",
        QDRANT_URL: "http://qdrant:6333",
        QDRANT_API_KEY: "local-qdrant-key",
        // No EMBEDDING_PROVIDER → falls back to "transformers".
        // No OPENAI_API_KEY → must NOT be required.
      },
    });

    expect(config.embedding.provider).toBe("transformers");
    expect(config.embedding.model).toBe("Xenova/all-MiniLM-L6-v2");
    expect(config.embedding.dimensions).toBe(384);
  });

  it("rejects invalid port values", () => {
    expect(() =>
      resolveServiceConfig({
        env: {
          DATABASE_URL: "postgres://memory:memory@postgres:5432/memory_os",
          QDRANT_URL: "http://qdrant:6333",
          QDRANT_API_KEY: "local-qdrant-key",
          OPENAI_API_KEY: "test-openai-key",
          PORT: "not-a-port",
        },
      }),
    ).toThrow("Invalid PORT: not-a-port");
  });

  it.each([
    ["DATABASE_URL", { DATABASE_URL: " \n\t " }],
    ["QDRANT_URL", { QDRANT_URL: " \n\t " }],
    ["QDRANT_API_KEY", { QDRANT_API_KEY: " \n\t " }],
    [
      "OPENAI_API_KEY",
      { EMBEDDING_PROVIDER: "openai", OPENAI_API_KEY: " \n\t " },
    ],
  ])(
    "rejects whitespace-only required %s",
    (name, overrides) => {
      expect(() =>
        resolveServiceConfig({
          env: {
            ...BASE_ENV,
            ...overrides,
          },
        }),
      ).toThrow(`Missing required environment variable: ${name}`);
    },
  );

  it.each(["1e3", "0x2253", "0b10001001010011", "8787.5", "+8787", " 8787 "])(
    "rejects non-decimal PORT value %s",
    (port) => {
      expect(() =>
        resolveServiceConfig({
          env: {
            ...BASE_ENV,
            PORT: port,
          },
        }),
      ).toThrow(`Invalid PORT: ${port}`);
    },
  );

  it("rejects out-of-range PORT values", () => {
    expect(() =>
      resolveServiceConfig({
        env: {
          ...BASE_ENV,
          PORT: "65536",
        },
      }),
    ).toThrow("Invalid PORT: 65536");
  });

  it.each(["", "1e3", "0x180", "0b110000000", "384.5", "+384", " 384 "])(
    "rejects non-decimal EMBEDDING_DIMENSIONS value %s",
    (dimensions) => {
      expect(() =>
        resolveServiceConfig({
          env: {
            ...BASE_ENV,
            EMBEDDING_DIMENSIONS: dimensions,
          },
        }),
      ).toThrow(`expected positive integer, got "${dimensions}"`);
    },
  );

  it("accepts plain decimal EMBEDDING_DIMENSIONS values", () => {
    const config = resolveServiceConfig({
      env: {
        ...BASE_ENV,
        EMBEDDING_DIMENSIONS: "512",
      },
    });

    expect(config.embedding.dimensions).toBe(512);
  });

  it("derives the database url from Postgres env when DATABASE_URL is absent", () => {
    const config = resolveServiceConfig({
      env: {
        POSTGRES_USER: "memory",
        POSTGRES_PASSWORD: "memory",
        POSTGRES_DB: "memory_os",
        QDRANT_URL: "http://qdrant:6333",
        QDRANT_API_KEY: "local-qdrant-key",
        OPENAI_API_KEY: "test-openai-key",
      },
    });

    expect(config.databaseUrl).toBe(
      "postgres://memory:memory@postgres:5432/memory_os",
    );
  });

  it.each([
    ["POSTGRES_USER", { POSTGRES_USER: " \n\t " }],
    ["POSTGRES_PASSWORD", { POSTGRES_PASSWORD: " \n\t " }],
    ["POSTGRES_DB", { POSTGRES_DB: " \n\t " }],
  ])(
    "rejects whitespace-only fallback %s when DATABASE_URL is absent",
    (name, overrides) => {
      expect(() =>
        resolveServiceConfig({
          env: {
            POSTGRES_USER: "memory",
            POSTGRES_PASSWORD: "memory",
            POSTGRES_DB: "memory_os",
            QDRANT_URL: "http://qdrant:6333",
            QDRANT_API_KEY: "local-qdrant-key",
            ...overrides,
          },
        }),
      ).toThrow(`Missing required environment variable: ${name}`);
    },
  );

  it("does not require a backup target host for runtime services", () => {
    const config = resolveServiceConfig({
      env: {
        DATABASE_URL: "postgres://memory:memory@postgres:5432/memory_os",
        QDRANT_URL: "http://qdrant:6333",
        QDRANT_API_KEY: "local-qdrant-key",
        OPENAI_API_KEY: "test-openai-key",
      },
    });

    expect(config.backups.targetHost).toBeUndefined();
  });
});
