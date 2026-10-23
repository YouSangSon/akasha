import fs from "node:fs";
import { describe, expect, it } from "vitest";

const REQUIRED_APP_ENV = [
  "BACKUP_DIR",
  "BACKUP_TARGET_DIR",
  "BACKUP_TARGET_HOST",
  "COMPACTION_SWEEP_ENABLED",
  "COMPACTION_SWEEP_INTERVAL_MS",
  "DATABASE_URL",
  "EMBEDDING_DIMENSIONS",
  "EMBEDDING_MODEL",
  "EMBEDDING_PROVIDER",
  "HOST",
  "INGEST_SWEEP_ENABLED",
  "INGEST_SWEEP_INTERVAL_MS",
  "LEGACY_ANONYMOUS_SEARCH",
  "LOG_LEVEL",
  "MEMORY_API_TOKENS",
  "NODE_ENV",
  "OPENAI_API_KEY",
  "OPENAI_EMBEDDING_MODEL",
  "PORT",
  "POSTGRES_DB",
  "POSTGRES_PASSWORD",
  "POSTGRES_USER",
  "QDRANT_API_KEY",
  "QDRANT_COLLECTION_NAME",
  "QDRANT_URL",
  "RATE_LIMIT_PER_MINUTE",
  "TRANSFORMERS_EMBEDDING_MODEL",
  "VECTOR_BACKEND",
] as const;

function read(path: string): string {
  return fs.readFileSync(path, "utf8");
}

describe("compose app service contract", () => {
  it("passes all public runtime env knobs through to the app container", () => {
    const compose = read("compose.yaml");

    for (const name of REQUIRED_APP_ENV) {
      expect(compose).toMatch(new RegExp(`^\\s+${name}:\\s+`, "m"));
    }
  });

  it("defines an unauthenticated readiness healthcheck for the app container", () => {
    const compose = read("compose.yaml");

    expect(compose).toContain("healthcheck:");
    expect(compose).toContain("/readyz");
    expect(compose).toContain("127.0.0.1");
    expect(compose).toContain("CMD-SHELL");
  });

  it("installs curl in the runtime image for the Compose readiness probe", () => {
    const dockerfile = read("docker/app.Dockerfile");

    expect(dockerfile).toContain("apt-get install -y --no-install-recommends curl ca-certificates libgomp1");
  });

  it("keeps the default retrieval runner independent from local compose credentials", () => {
    const runner = read("tests/eval/run-default-stack.sh");
    const composeUp = runner.indexOf("compose up -d postgres qdrant");

    expect(composeUp).toBeGreaterThan(0);
    for (const assignment of [
      "export POSTGRES_USER=memory",
      "export POSTGRES_PASSWORD=memory",
      "export POSTGRES_DB=memory_os",
      'export POSTGRES_PORT="$postgres_port"',
      "export QDRANT_API_KEY=local-qdrant-key",
    ]) {
      const exportIndex = runner.indexOf(assignment);
      expect(exportIndex).toBeGreaterThan(0);
      expect(exportIndex).toBeLessThan(composeUp);
    }
  });
});
