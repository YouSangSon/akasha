import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/cli.js";

describe("parseCliArgs", () => {
  it("parses the pack command", () => {
    const parsed = parseCliArgs([
      "pack",
      "--project",
      "project-alpha",
      "--user",
      "alice",
      "--task",
      "continue work",
    ]);

    expect(parsed).toEqual({
      command: "pack",
      projectKey: "project-alpha",
      userScopeId: "alice",
      task: "continue work",
    });
  });

  it("parses operator maintenance commands", () => {
    expect(
      parseCliArgs(["reindex", "--project", "project-alpha", "--user", "alice"]),
    ).toEqual({
      command: "reindex",
      projectKey: "project-alpha",
      userScopeId: "alice",
    });

    expect(parseCliArgs(["backup-verify"])).toEqual({
      command: "backup-verify",
    });

    expect(parseCliArgs(["restore-smoke"])).toEqual({
      command: "restore-smoke",
    });
  });

  it("rejects missing project arguments", () => {
    expect(() =>
      parseCliArgs(["pack", "--task", "continue work"]),
    ).toThrow("Missing required --project argument");
  });
});
