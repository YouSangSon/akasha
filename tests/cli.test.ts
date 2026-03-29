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
  });
});
