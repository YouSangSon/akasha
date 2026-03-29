import { describe, expect, it } from "vitest";
import { resolveProjectPaths, resolveUserPaths } from "../../src/config.js";

describe("resolveProjectPaths", () => {
  it("creates deterministic locations for db and working folders", () => {
    const paths = resolveProjectPaths({
      cwd: "/tmp/project-alpha",
      projectKey: "project-alpha",
    });

    expect(paths.projectKey).toBe("project-alpha");
    expect(paths.dbPath).toContain(
      ".developer-memory-os/project-alpha/memory.db",
    );
    expect(paths.stateDir).toContain(".developer-memory-os/project-alpha");
  });

  it("rejects project keys that are not safe path segments", () => {
    expect(() =>
      resolveProjectPaths({
        cwd: "/tmp/project-alpha",
        projectKey: "../escape",
      }),
    ).toThrow("Invalid path identifier: ../escape");
  });
});

describe("resolveUserPaths", () => {
  it("creates deterministic locations for a global user memory store", () => {
    const paths = resolveUserPaths({
      userScopeId: "user-alice",
    });

    expect(paths.userScopeId).toBe("user-alice");
    expect(paths.dbPath).toContain(
      ".developer-memory-os/users/user-alice/memory.db",
    );
    expect(paths.stateDir).toContain(".developer-memory-os/users/user-alice");
  });

  it("rejects user scope ids that are not safe path segments", () => {
    expect(() =>
      resolveUserPaths({
        userScopeId: "../escape",
      }),
    ).toThrow("Invalid path identifier: ../escape");
  });
});
