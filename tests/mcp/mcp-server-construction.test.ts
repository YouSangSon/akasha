import { describe, expect, it } from "vitest";
import { createMcpServer } from "../../src/mcp/server.js";
import type { ToolRegistry } from "../../src/mcp/types.js";

describe("createMcpServer", () => {
  it.each([
    {
      input: null,
      message: "MCP server options must be an object",
    },
    {
      input: [],
      message: "MCP server options must be an object",
    },
    {
      input: { cwd: 42 },
      message: "cwd must be a string",
    },
    {
      input: { defaultActor: " \n\t " },
      message: "defaultActor must contain non-whitespace text",
    },
    {
      input: { registry: null },
      message: "registry must be an object",
    },
    {
      input: { authorizeTool: "allow" },
      message: "authorizeTool must be a function",
    },
  ])("rejects malformed server options %#", ({ input, message }) => {
    expect(() => createMcpServer(input as never)).toThrow(message);
  });

  it("still accepts an injected registry object for schema-only server tests", () => {
    expect(() =>
      createMcpServer({ registry: {} as unknown as ToolRegistry }),
    ).not.toThrow();
  });
});
