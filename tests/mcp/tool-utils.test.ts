import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { resolveUserScopeId } from "../../src/mcp/tool-utils.js";

const originalDeveloperMemoryUserId = process.env.DEVELOPER_MEMORY_USER_ID;
const tempDirs: string[] = [];

describe("resolveUserScopeId", () => {
  afterEach(async () => {
    if (originalDeveloperMemoryUserId === undefined) {
      delete process.env.DEVELOPER_MEMORY_USER_ID;
    } else {
      process.env.DEVELOPER_MEMORY_USER_ID = originalDeveloperMemoryUserId;
    }
    await Promise.all(
      tempDirs.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("uses explicit and default user scope ids when provided", () => {
    expect(
      resolveUserScopeId({
        cwd: process.cwd(),
        explicitUserScopeId: "explicit-user",
        defaultUserScopeId: "default-user",
      }),
    ).toBe("explicit-user");

    expect(
      resolveUserScopeId({
        cwd: process.cwd(),
        defaultUserScopeId: "default-user",
      }),
    ).toBe("default-user");
  });

  it("rejects whitespace-only explicit and default user scope ids", () => {
    expect(() =>
      resolveUserScopeId({
        cwd: process.cwd(),
        explicitUserScopeId: " \n\t ",
      }),
    ).toThrow(/userScopeId/);

    expect(() =>
      resolveUserScopeId({
        cwd: process.cwd(),
        defaultUserScopeId: " \n\t ",
      }),
    ).toThrow(/userScopeId/);
  });

  it("falls back to a trimmed environment user id", () => {
    process.env.DEVELOPER_MEMORY_USER_ID = " env-user ";

    expect(resolveUserScopeId({ cwd: process.cwd() })).toBe("env-user");
  });

  it("falls back to the git email hash when environment user id is unset", async () => {
    delete process.env.DEVELOPER_MEMORY_USER_ID;
    const cwd = await mkdtemp(path.join(os.tmpdir(), "akasha-user-scope-"));
    tempDirs.push(cwd);
    execFileSync("git", ["init"], { cwd, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "alice@example.com"], {
      cwd,
      stdio: "ignore",
    });

    expect(resolveUserScopeId({ cwd })).toBe(
      `git-${createHash("sha256").update("alice@example.com").digest("hex").slice(0, 12)}`,
    );
  });

  it.each([
    ["empty", ""],
    ["whitespace-only", " \n\t "],
  ])("rejects %s environment user ids", (_label, value) => {
    process.env.DEVELOPER_MEMORY_USER_ID = value;

    expect(() => resolveUserScopeId({ cwd: process.cwd() })).toThrow(
      "DEVELOPER_MEMORY_USER_ID must contain non-whitespace text",
    );
  });
});
