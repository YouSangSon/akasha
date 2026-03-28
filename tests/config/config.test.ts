import { describe, expect, it } from "vitest";
import { resolveProjectPaths } from "../../src/config.js";

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
});
