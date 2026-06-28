import { describe, expect, it } from "vitest";
import { resolveStdioCwd } from "../../src/mcp/server.js";

describe("resolveStdioCwd", () => {
  it("uses the fallback cwd when DMO_CWD is unset", () => {
    expect(resolveStdioCwd({}, () => "/repo/fallback")).toBe("/repo/fallback");
  });

  it("uses a configured DMO_CWD without trimming valid path text", () => {
    expect(
      resolveStdioCwd({ DMO_CWD: "/repo/with spaces" }, () => "/fallback"),
    ).toBe("/repo/with spaces");
  });

  it("does not read the fallback cwd when DMO_CWD is configured", () => {
    expect(
      resolveStdioCwd({ DMO_CWD: "/repo/project" }, () => {
        throw new Error("fallback should not be read");
      }),
    ).toBe("/repo/project");
  });

  it("rejects whitespace-only DMO_CWD before stdio server startup", () => {
    expect(() =>
      resolveStdioCwd({ DMO_CWD: " \n\t " }, () => "/fallback"),
    ).toThrow("DMO_CWD must contain non-whitespace text");
  });
});
