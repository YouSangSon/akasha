import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/cli.js";

describe("parseCliArgs", () => {
  it("parses the pack command", () => {
    const parsed = parseCliArgs([
      "pack",
      "--project",
      "project-alpha",
      "--task",
      "continue work",
    ]);

    expect(parsed.command).toBe("pack");
    expect(parsed.projectKey).toBe("project-alpha");
    expect(parsed.task).toBe("continue work");
  });

  it("rejects missing project arguments", () => {
    expect(() =>
      parseCliArgs(["pack", "--task", "continue work"]),
    ).toThrow("Missing required --project argument");
  });
});
