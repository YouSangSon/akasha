import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { devNull } from "node:os";
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
  it("bounds the complete private VM composition without starting containers", ({ skip }) => {
    const available = spawnSync("docker", ["compose", "version", "--short"], { timeout: 5_000, stdio: "ignore" });
    if (available.status !== 0) {
      if (process.env.CI) throw new Error("CI requires Docker Compose for the private VM configuration check");
      skip();
      return;
    }
    const args = ["compose", "--env-file", devNull, "-p", "akasha-config-check", "-f", "compose.yaml", "-f", "compose.my-cloud.yaml", "config", "--format", "json"];
    const env = {
      ...process.env, AKASHA_VM_IMAGE: "akasha-config-check:fixture",
      POSTGRES_USER: "memory", POSTGRES_PASSWORD: "config-fixture", POSTGRES_DB: "config_fixture",
      QDRANT_API_KEY: "config-fixture", MEMORY_API_TOKENS: "config-fixture:config-org", OPENAI_API_KEY: "",
      PORT: "18787", POSTGRES_PORT: "15432", EMBEDDING_PROVIDER: "transformers", VECTOR_BACKEND: "qdrant",
    };
    const model: { services: Record<string, {
      cpus: number; mem_limit: number | string; memswap_limit: number | string; pids_limit: number; restart: string;
      image: string; pull_policy?: string; build?: unknown;
      ports?: Array<{ host_ip: string }>; logging: { driver: string; options: Record<string, string> };
    }> } = JSON.parse(execFileSync("docker", args, { env, encoding: "utf8", timeout: 10_000 }));
    const services = Object.values(model.services);
    expect(Object.keys(model.services).sort()).toEqual(["app", "postgres", "qdrant"]);
    expect(services.reduce((sum, service) => sum + Number(service.cpus), 0)).toBe(1);
    expect(services.reduce((sum, service) => sum + Number(service.mem_limit), 0)).toBe(2 * 1024 ** 3);
    for (const service of services) {
      expect(service.cpus).toBeGreaterThan(0);
      expect(Number(service.mem_limit)).toBeGreaterThan(0);
      expect(Number(service.memswap_limit)).toBe(Number(service.mem_limit));
      expect(service.pids_limit).toBeGreaterThan(0);
      expect(service.restart).toBe("no");
      expect(service.logging).toEqual({ driver: "json-file", options: { "max-size": "10m", "max-file": "3" } });
    }
    expect(model.services.postgres!.ports ?? []).toEqual([]);
    expect(model.services.qdrant!.ports ?? []).toEqual([]);
    expect(model.services.app!.ports).toHaveLength(1);
    expect(model.services.app!.ports![0]!.host_ip).toBe("127.0.0.1");
    expect(model.services.app!.image).toBe("akasha-config-check:fixture");
    expect(model.services.app!.pull_policy).toBe("never");
    expect(model.services.app!.build).toBeUndefined();
    expect(() => execFileSync("docker", args, {
      env: { ...env, AKASHA_VM_IMAGE: "" }, stdio: "pipe", timeout: 10_000,
    })).toThrow(/AKASHA_VM_IMAGE/);
  // Accommodate the bounded CLI calls (5s + 10s + 10s) on a shared runner.
  }, 30_000);

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
