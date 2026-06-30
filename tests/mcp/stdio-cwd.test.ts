import { describe, expect, it } from "vitest";
import { resolveStdioCwd } from "../../src/mcp/server.js";

const malformedDirectInputs: Array<{
  env: unknown;
  fallback: unknown;
  message: string;
}> = [
  {
    env: null,
    fallback: (): string => "/fallback",
    message: "env must be an object",
  },
  {
    env: { DMO_CWD: 42 },
    fallback: (): string => "/fallback",
    message: "DMO_CWD must be a string",
  },
  {
    env: {},
    fallback: null,
    message: "getFallbackCwd must be a function",
  },
  {
    env: {},
    fallback: (): string => " \n\t ",
    message: "fallback cwd must contain non-whitespace text",
  },
];

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

  it.each(malformedDirectInputs)(
    "rejects malformed direct inputs %#",
    ({ env, fallback, message }) => {
      expect(() =>
        resolveStdioCwd(
          env as never,
          fallback as never,
        ),
      ).toThrow(message);
    },
  );
});
