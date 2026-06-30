import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatMemoryIdentifier,
  normalizeLimit,
  resolveUserScopeId,
  summarize,
  toMemoryType,
  type ResolveUserScopeIdInput,
} from "../../src/mcp/tool-utils.js";

const originalDeveloperMemoryUserId = process.env.DEVELOPER_MEMORY_USER_ID;
const tempDirs: string[] = [];
const callResolveUserScopeId = (input: unknown) => () =>
  resolveUserScopeId(input as ResolveUserScopeIdInput);

describe("tool utility input guards", () => {
  it("formats memory identifiers from valid records", () => {
    expect(
      formatMemoryIdentifier({
        scopeType: "project",
        scopeId: "project-alpha",
        id: 12,
      }),
    ).toBe("project:project-alpha:12");
  });

  it.each([
    [null, "memory identifier record must be an object"],
    [
      { scopeType: 12, scopeId: "project-alpha", id: 1 },
      "scopeType must be a string",
    ],
    [
      { scopeType: "project", scopeId: " \n\t ", id: 1 },
      "scopeId must contain non-whitespace text",
    ],
    [
      { scopeType: "project", scopeId: "project-alpha", id: 0 },
      "id must be a positive safe integer",
    ],
  ])("rejects invalid memory identifier input", (record, message) => {
    expect(() =>
      formatMemoryIdentifier(
        record as { scopeType: string; scopeId: string; id: number },
      ),
    ).toThrow(message);
  });

  it("normalizes optional limits", () => {
    expect(normalizeLimit(undefined)).toBe(10);
    expect(normalizeLimit(25)).toBe(25);
  });

  it.each([
    ["10", "limit must be a number"],
    [0, "limit must be a positive integer up to 100"],
    [101, "limit must be a positive integer up to 100"],
    [1.5, "limit must be a positive integer up to 100"],
  ])("rejects invalid limits", (limit, message) => {
    expect(() => normalizeLimit(limit as number)).toThrow(message);
  });

  it("converts supported memory kinds", () => {
    expect(toMemoryType("decision")).toBe("decision");
    expect(toMemoryType("summary")).toBe("summary");
    expect(toMemoryType("fact")).toBe("fact");
  });

  it("rejects invalid memory kind inputs", () => {
    expect(() => toMemoryType(12 as unknown as string)).toThrow(
      "memory kind must be a string",
    );
    expect(() => toMemoryType("task")).toThrow("Unsupported memory kind: task");
  });

  it("summarizes text while rejecting non-string content", () => {
    expect(summarize("a".repeat(90))).toHaveLength(80);
    expect(() => summarize(12 as unknown as string)).toThrow(
      "content must be a string",
    );
  });
});

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

  it.each([undefined, null, "input", 12, true, []])(
    "rejects non-object direct input",
    (input) => {
      expect(callResolveUserScopeId(input)).toThrow(
        "resolveUserScopeId input must be an object",
      );
    },
  );

  it.each([
    [{}, "cwd must be a string"],
    [{ cwd: 12 }, "cwd must be a string"],
    [{ cwd: " \n\t " }, "cwd must contain non-whitespace text"],
    [
      { cwd: process.cwd(), explicitUserScopeId: 12 },
      "explicitUserScopeId must be a string",
    ],
    [
      { cwd: process.cwd(), defaultUserScopeId: false },
      "defaultUserScopeId must be a string",
    ],
  ])("rejects invalid direct input field", (input, message) => {
    expect(callResolveUserScopeId(input)).toThrow(message);
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
