import { describe, expect, it, vi } from "vitest";
import { parseCliArgs, runCli } from "../src/cli.js";
import type { ToolRegistry } from "../src/mcp/server.js";

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
    });
    expect(JSON.parse(output)).toEqual({
      ok: true,
      projectKey: "project-alpha",
      userScopeId: "alice",
      chunkCount: 3,
    });
  });
});
