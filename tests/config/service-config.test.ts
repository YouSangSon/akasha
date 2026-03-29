import { describe, expect, it } from "vitest";
import { resolveServiceConfig } from "../../src/config.js";

describe("resolveServiceConfig", () => {
  it("parses Postgres, Qdrant, OpenAI, and backup settings", () => {
    const config = resolveServiceConfig({
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "8787",
        DATABASE_URL: "postgres://memory:memory@postgres:5432/memory_os",
        QDRANT_URL: "http://qdrant:6333",
        QDRANT_API_KEY: "local-qdrant-key",
        OPENAI_API_KEY: "test-openai-key",
        OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
        BACKUP_DIR: "/var/lib/developer-memory-os/backups",
        BACKUP_TARGET_HOST: "backup@example.internal",
      },
    });

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(8787);
    expect(config.databaseUrl).toContain("postgres://memory:memory");
    expect(config.qdrant.url).toBe("http://qdrant:6333");
    expect(config.openai.apiKey).toBe("test-openai-key");
    expect(config.embedding.model).toBe("text-embedding-3-small");
    expect(config.backups.targetHost).toBe("backup@example.internal");
  });

  it("rejects invalid port values", () => {
    expect(() =>
      resolveServiceConfig({
        env: {
          DATABASE_URL: "postgres://memory:memory@postgres:5432/memory_os",
          QDRANT_URL: "http://qdrant:6333",
          QDRANT_API_KEY: "local-qdrant-key",
          OPENAI_API_KEY: "test-openai-key",
          BACKUP_TARGET_HOST: "backup@example.internal",
          PORT: "not-a-port",
        },
      }),
    ).toThrow("Invalid PORT: not-a-port");
  });
});
