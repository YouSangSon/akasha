import { describe, expect, it, vi } from "vitest";
import { parseCliArgs, runCli } from "../src/cli.js";
import type { ToolRegistry } from "../src/mcp/server.js";

describe("parseCliArgs", () => {
  it("can import public MCP server exports after module split", async () => {
    const module = await import("../src/mcp/server.js");
    expect(typeof module.createMcpServer).toBe("function");
    expect(typeof module.createToolRegistry).toBe("function");
  });

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
      organizationId: undefined,
    });

    expect(parseCliArgs(["backup-verify"])).toEqual({
      command: "backup-verify",
    });

    expect(parseCliArgs(["restore-smoke"])).toEqual({
      command: "restore-smoke",
    });
  });

  it("parses reindex --organization-id flag", () => {
    expect(
      parseCliArgs(["reindex", "--project", "p", "--organization-id", "acme"]),
    ).toEqual({
      command: "reindex",
      projectKey: "p",
      userScopeId: undefined,
      organizationId: "acme",
    });
  });

  it("leaves organizationId undefined when --organization-id flag is absent", () => {
    const parsed = parseCliArgs(["reindex", "--project", "p"]);
    expect(parsed).toEqual({
      command: "reindex",
      projectKey: "p",
      userScopeId: undefined,
      organizationId: undefined,
    });
  });

  it("rejects missing project arguments", () => {
    expect(() =>
      parseCliArgs(["pack", "--task", "continue work"]),
    ).toThrow("Missing required --project argument");
  });

  it("runs the reindex command instead of echoing parsed arguments", async () => {
    const registry: ToolRegistry = {
      build_context_pack: vi.fn(),
      search_memory: vi.fn(),
      add_memory: vi.fn(),
      compact_memory: vi.fn(),
      list_audit_log: vi.fn(),
      unarchive_memory: vi.fn(),
      reindex_memory: vi.fn().mockResolvedValue({
        ok: true,
        projectKey: "project-alpha",
        userScopeId: "alice",
        chunkCount: 3,
      }),
    };

    const output = await runCli(
      ["reindex", "--project", "project-alpha", "--user", "alice"],
      {
        registry,
      },
    );

    expect(registry.reindex_memory).toHaveBeenCalledWith({
      projectKey: "project-alpha",
      userScopeId: "alice",
      organizationId: "default",
    });
    expect(JSON.parse(output)).toEqual({
      ok: true,
      projectKey: "project-alpha",
      userScopeId: "alice",
      chunkCount: 3,
    });
  });

  it("passes --organization-id to reindex_memory when provided", async () => {
    const registry: ToolRegistry = {
      build_context_pack: vi.fn(),
      search_memory: vi.fn(),
      add_memory: vi.fn(),
      compact_memory: vi.fn(),
      list_audit_log: vi.fn(),
      unarchive_memory: vi.fn(),
      reindex_memory: vi.fn().mockResolvedValue({
        ok: true,
        projectKey: "project-alpha",
        userScopeId: undefined,
        chunkCount: 5,
      }),
    };

    await runCli(
      ["reindex", "--project", "project-alpha", "--organization-id", "acme"],
      { registry },
    );

    expect(registry.reindex_memory).toHaveBeenCalledWith({
      projectKey: "project-alpha",
      userScopeId: undefined,
      organizationId: "acme",
    });
  });
});
