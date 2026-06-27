import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { scanForSecrets } from "../../src/store/secret-scrub.js";

type SecretFinding = {
  path: string;
  category: string;
};

const excludedFiles = new Set([
  "src/store/secret-scrub.ts",
  "tests/store/secret-scrub.test.ts",
]);

const DB_USERINFO_RE = /:\/\/([^:@\s]+):([^@\s]+)@[a-z0-9][\w.-]+/gi;
const POSTGRES_ENV_USERINFO_RE =
  /:\/\/\\?\$\{POSTGRES_USER(?::-memory)?}:\\?\$\{POSTGRES_PASSWORD(?::-memory)?}@[a-z0-9][\w.-]+/gi;
const placeholderDbUserInfo = new Set([
  "memory:memory",
  "postgres:test",
  "user:pass",
  "user:pw",
  "memory:STRONG_PW",
]);

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .sort();
}

function isTextFile(content: Buffer): boolean {
  return !content.includes(0);
}

function hasOnlyPlaceholderDbCredentials(content: string): boolean {
  const contentWithoutEnvPlaceholders = content.replaceAll(
    POSTGRES_ENV_USERINFO_RE,
    "://memory:memory@postgres",
  );
  const matches = [...contentWithoutEnvPlaceholders.matchAll(DB_USERINFO_RE)];
  return matches.every((match) => {
    const user = match[1] ?? "";
    const password = match[2] ?? "";
    return placeholderDbUserInfo.has(`${user}:${password}`);
  });
}

describe("repo secret hygiene", () => {
  it("does not globally allow embedded database credentials", () => {
    const realDbUrl = [
      "postgres://app",
      "real-password@db.example.com/app",
    ].join(":");
    const mixedEnvDbUrl = [
      "postgres://${POSTGRES_USER}",
      "real-password@db.example.com/app",
    ].join(":");
    const wrongEnvDbUrl = [
      "postgres://${NOT_POSTGRES}",
      "real-password@db.example.com/app",
    ].join(":");
    const broadLiteralPairDbUrl = [
      "postgres://user",
      "STRONG_PW@db.example.com/app",
    ].join(":");
    const unsafeShellDefaultDbUrl = [
      "postgres://${POSTGRES_USER:-app}",
      "${POSTGRES_PASSWORD:-real-password}@db.example.com/app",
    ].join(":");

    expect(
      hasOnlyPlaceholderDbCredentials(`DATABASE_URL=${realDbUrl}`),
    ).toBe(false);
    expect(
      hasOnlyPlaceholderDbCredentials(
        "DATABASE_URL=postgres://memory:memory@127.0.0.1:5432/memory_os",
      ),
    ).toBe(true);
    expect(
      hasOnlyPlaceholderDbCredentials(
        "DATABASE_URL=postgres://${POSTGRES_USER:-memory}:${POSTGRES_PASSWORD:-memory}@postgres/db",
      ),
    ).toBe(true);
    expect(
      hasOnlyPlaceholderDbCredentials(`DATABASE_URL=${mixedEnvDbUrl}`),
    ).toBe(false);
    expect(
      hasOnlyPlaceholderDbCredentials(`DATABASE_URL=${wrongEnvDbUrl}`),
    ).toBe(false);
    expect(
      hasOnlyPlaceholderDbCredentials(`DATABASE_URL=${broadLiteralPairDbUrl}`),
    ).toBe(false);
    expect(
      hasOnlyPlaceholderDbCredentials(`DATABASE_URL=${unsafeShellDefaultDbUrl}`),
    ).toBe(false);
  });

  it("keeps tracked text files free of high-confidence secret-shaped literals", () => {
    const findings: SecretFinding[] = [];

    for (const path of trackedFiles()) {
      if (excludedFiles.has(path)) {
        continue;
      }

      const content = fs.readFileSync(path);
      if (!isTextFile(content)) {
        continue;
      }

      const text = content.toString("utf8");
      for (const { category } of scanForSecrets(text)) {
        if (
          category !== "db-connection-string" ||
          !hasOnlyPlaceholderDbCredentials(text)
        ) {
          findings.push({ path, category });
        }
      }
    }

    expect(findings).toEqual([]);
  });
});
