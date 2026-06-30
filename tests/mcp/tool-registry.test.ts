import { describe, expect, it } from "vitest";
import { createToolHandlers } from "../../src/mcp/tool-handlers.js";
import { createToolRegistry } from "../../src/mcp/tool-registry.js";

describe("createToolRegistry", () => {
  it.each([
    {
      input: null,
      message: "tool registry options must be an object",
    },
    {
      input: [],
      message: "tool registry options must be an object",
    },
    {
      input: { cwd: 42 },
      message: "cwd must be a string",
    },
    {
      input: { cwd: " \n\t " },
      message: "cwd must contain non-whitespace text",
    },
    {
      input: { defaultUserScopeId: false },
      message: "defaultUserScopeId must be a string",
    },
    {
      input: { defaultActor: "" },
      message: "defaultActor must contain non-whitespace text",
    },
    {
      input: { repository: null },
      message: "repository must be an object",
    },
    {
      input: { logger: "logger" },
      message: "logger must be an object",
    },
    {
      input: { resolveRepository: null },
      message: "resolveRepository must be a function",
    },
    {
      input: { withCanonicalServices: {} },
      message: "withCanonicalServices must be a function",
    },
  ])("rejects malformed registry options %#", ({ input, message }) => {
    expect(() => createToolRegistry(input as never)).toThrow(message);
  });

  it("still builds the registry with default options", () => {
    expect(createToolRegistry()).toEqual(
      expect.objectContaining({
        add_memory: expect.any(Function),
        search_memory: expect.any(Function),
        build_context_pack: expect.any(Function),
      }),
    );
  });
});

describe("createToolHandlers", () => {
  const withCanonicalServices = async () => {
    throw new Error("not used");
  };

  it.each([
    {
      input: null,
      message: "tool handlers input must be an object",
    },
    {
      input: {
        options: null,
        cwd: process.cwd(),
        withCanonicalServices,
      },
      message: "tool registry options must be an object",
    },
    {
      input: {
        options: {},
        cwd: 42,
        withCanonicalServices,
      },
      message: "cwd must be a string",
    },
    {
      input: {
        options: {},
        cwd: " \n\t ",
        withCanonicalServices,
      },
      message: "cwd must contain non-whitespace text",
    },
    {
      input: {
        options: {},
        cwd: process.cwd(),
      },
      message: "withCanonicalServices must be a function",
    },
    {
      input: {
        options: {},
        cwd: process.cwd(),
        withCanonicalServices: null,
      },
      message: "withCanonicalServices must be a function",
    },
  ])("rejects malformed handler construction input %#", ({ input, message }) => {
    expect(() => createToolHandlers(input as never)).toThrow(message);
  });
});
