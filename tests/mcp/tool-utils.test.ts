import { afterEach, describe, expect, it } from "vitest";
import { resolveUserScopeId } from "../../src/mcp/tool-utils.js";

const originalDeveloperMemoryUserId = process.env.DEVELOPER_MEMORY_USER_ID;

describe("resolveUserScopeId", () => {
  afterEach(() => {
    if (originalDeveloperMemoryUserId === undefined) {
      delete process.env.DEVELOPER_MEMORY_USER_ID;
    } else {
      process.env.DEVELOPER_MEMORY_USER_ID = originalDeveloperMemoryUserId;
    }
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
});
