import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseCliArgs, runCli } from "../src/cli.js";
import { writeLifecycleInit } from "../src/lifecycle/init.js";
import { createToolRegistry, type ToolRegistry } from "../src/mcp/server.js";
import type { MemoryRepository } from "../src/types.js";
import { goalRunRegistryStubs } from "./fixtures/goal-run-stubs.js";

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
      organizationId: undefined,
      task: "continue work",
    });
  });

  it("parses pack --organization-id flag", () => {
    expect(
      parseCliArgs([
        "pack",
        "--project",
        "project-alpha",
        "--organization-id",
        "acme",
        "--task",
        "continue work",
      ]),
    ).toEqual({
      command: "pack",
      projectKey: "project-alpha",
      userScopeId: undefined,
      organizationId: "acme",
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

  it("parses lifecycle init and remember commands", () => {
    expect(
      parseCliArgs([
        "init",
        "--project",
        "project-alpha",
        "--organization-id",
        "acme",
        "--task",
        "continue work",
        "--out-dir",
        ".akasha",
        "--force",
      ]),
    ).toEqual({
      command: "init",
      projectKey: "project-alpha",
      userScopeId: undefined,
      organizationId: "acme",
      task: "continue work",
      outDir: ".akasha",
      force: true,
    });

    expect(
      parseCliArgs([
        "remember",
        "--project",
        "project-alpha",
        "--organization-id",
        "acme",
        "--kind",
        "summary",
        "--content",
        "Decision: keep generated lifecycle files out of secrets.",
      ]),
    ).toEqual({
      command: "remember",
      projectKey: "project-alpha",
      userScopeId: undefined,
      organizationId: "acme",
      kind: "summary",
      content: "Decision: keep generated lifecycle files out of secrets.",
    });

    expect(
      parseCliArgs([
        "remember",
        "--project",
        "project-alpha",
        "--kind",
        "summary",
        "--content",
        "-- summary starts with a dash",
      ]),
    ).toMatchObject({
      command: "remember",
      content: "-- summary starts with a dash",
    });

    expect(
      parseCliArgs([
        "remember",
        "--project",
        "project-alpha",
        "--kind",
        "summary",
        "--content-file",
        "/tmp/session-summary.txt",
      ]),
    ).toMatchObject({
      command: "remember",
      contentFile: "/tmp/session-summary.txt",
      content: undefined,
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

  it("rejects whitespace-only organizationId flags before command dispatch", async () => {
    expect(() =>
      parseCliArgs([
        "pack",
        "--project",
        "project-alpha",
        "--organization-id",
        " \n\t ",
        "--task",
        "continue work",
      ]),
    ).toThrow(/--organization-id/);

    expect(() =>
      parseCliArgs([
        "remember",
        "--project",
        "project-alpha",
        "--organization-id",
        " \n\t ",
        "--kind",
        "summary",
        "--content",
        "Remember this",
      ]),
    ).toThrow(/--organization-id/);

    expect(() =>
      parseCliArgs([
        "init",
        "--project",
        "project-alpha",
        "--organization-id",
        " \n\t ",
      ]),
    ).toThrow(/--organization-id/);
  });

  it("rejects missing project arguments", () => {
    expect(() =>
      parseCliArgs(["pack", "--task", "continue work"]),
    ).toThrow("Missing required --project argument");
  });

  it("runs the reindex command instead of echoing parsed arguments", async () => {
    const registry: ToolRegistry = {
      ...goalRunRegistryStubs(),
      build_context_pack: vi.fn(),
      search_memory: vi.fn(),
      add_memory: vi.fn(),
      compact_memory: vi.fn(),
      list_memory: vi.fn(),
      inspect_memory_graph: vi.fn(),
      update_memory: vi.fn(),
      delete_memory: vi.fn(),
      tag_memory: vi.fn(),
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
      ...goalRunRegistryStubs(),
      build_context_pack: vi.fn(),
      search_memory: vi.fn(),
      add_memory: vi.fn(),
      compact_memory: vi.fn(),
      list_memory: vi.fn(),
      inspect_memory_graph: vi.fn(),
      update_memory: vi.fn(),
      delete_memory: vi.fn(),
      tag_memory: vi.fn(),
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

  it("passes --organization-id to build_context_pack for session-start recipes", async () => {
    const registry: ToolRegistry = {
      ...goalRunRegistryStubs(),
      build_context_pack: vi.fn().mockResolvedValue({
        ok: true,
        projectKey: "project-alpha",
        packMarkdown: "# Context Pack",
        selectedMemoryIds: [],
        selectionRationale: [],
        sections: {
          project_summary: [],
          recent_decisions: [],
          constraints: [],
          open_questions: [],
          relevant_notes: [],
        },
      }),
      search_memory: vi.fn(),
      add_memory: vi.fn(),
      compact_memory: vi.fn(),
      list_memory: vi.fn(),
      inspect_memory_graph: vi.fn(),
      update_memory: vi.fn(),
      delete_memory: vi.fn(),
      tag_memory: vi.fn(),
      list_audit_log: vi.fn(),
      unarchive_memory: vi.fn(),
      reindex_memory: vi.fn(),
    };

    const output = await runCli(
      [
        "pack",
        "--project",
        "project-alpha",
        "--organization-id",
        "acme",
        "--task",
        "continue work",
      ],
      { registry },
    );

    expect(registry.build_context_pack).toHaveBeenCalledWith({
      projectKey: "project-alpha",
      userScopeId: undefined,
      organizationId: "acme",
      task: "continue work",
    });
    expect(output).toBe("# Context Pack");
  });

  it("runs remember through the add_memory registry path", async () => {
    const registry: ToolRegistry = {
      ...goalRunRegistryStubs(),
      build_context_pack: vi.fn(),
      search_memory: vi.fn(),
      add_memory: vi.fn().mockResolvedValue({
        ok: true,
        memoryId: "project:project-alpha:1",
        summary: "Stored lifecycle summary",
      }),
      compact_memory: vi.fn(),
      list_memory: vi.fn(),
      inspect_memory_graph: vi.fn(),
      update_memory: vi.fn(),
      delete_memory: vi.fn(),
      tag_memory: vi.fn(),
      list_audit_log: vi.fn(),
      unarchive_memory: vi.fn(),
      reindex_memory: vi.fn(),
    };

    const output = await runCli(
      [
        "remember",
        "--project",
        "project-alpha",
        "--organization-id",
        "acme",
        "--kind",
        "summary",
        "--content",
        "Finished lifecycle init wiring.",
      ],
      { registry },
    );

    expect(registry.add_memory).toHaveBeenCalledWith({
      projectKey: "project-alpha",
      userScopeId: undefined,
      organizationId: "acme",
      kind: "summary",
      content: "Finished lifecycle init wiring.",
    });
    expect(JSON.parse(output)).toEqual({
      ok: true,
      memoryId: "project:project-alpha:1",
      summary: "Stored lifecycle summary",
    });
  });

  it("rejects whitespace-only remember content through the real registry path", async () => {
    const addMemory = vi.fn();
    const repository = { addMemory } as unknown as MemoryRepository;
    const registry = createToolRegistry({
      repository,
      defaultUserScopeId: "user-a",
    });

    await expect(
      runCli(
        [
          "remember",
          "--project",
          "project-alpha",
          "--kind",
          "summary",
          "--content",
          " \n\t ",
        ],
        { registry },
      ),
    ).rejects.toThrow(/non-whitespace text/);

    expect(addMemory).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only organizationId before registry calls", async () => {
    const registry: ToolRegistry = {
      ...goalRunRegistryStubs(),
      build_context_pack: vi.fn(),
      search_memory: vi.fn(),
      add_memory: vi.fn(),
      compact_memory: vi.fn(),
      list_memory: vi.fn(),
      inspect_memory_graph: vi.fn(),
      update_memory: vi.fn(),
      delete_memory: vi.fn(),
      tag_memory: vi.fn(),
      list_audit_log: vi.fn(),
      unarchive_memory: vi.fn(),
      reindex_memory: vi.fn(),
    };

    await expect(
      runCli(
        [
          "reindex",
          "--project",
          "project-alpha",
          "--organization-id",
          " \n\t ",
        ],
        { registry },
      ),
    ).rejects.toThrow(/--organization-id/);

    expect(registry.reindex_memory).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only init organizationId before writing lifecycle files", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "akasha-cli-init-"));

    await expect(
      runCli(
        [
          "init",
          "--project",
          "project-alpha",
          "--organization-id",
          " \n\t ",
        ],
        { cwd: tmpDir },
      ),
    ).rejects.toThrow(/--organization-id/);

    expect(fs.existsSync(path.join(tmpDir, ".akasha"))).toBe(false);
  });

  it("rejects whitespace-only direct lifecycle init inputs before writing files", async () => {
    const cases = [
      { field: "organizationId", input: { organizationId: " \n\t " } },
      { field: "userScopeId", input: { userScopeId: " \n\t " } },
      { field: "task", input: { task: " \n\t " } },
    ] as const;

    for (const testCase of cases) {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "akasha-init-"));

      await expect(
        writeLifecycleInit({
          repoDir: tmpDir,
          projectKey: "project-alpha",
          ...testCase.input,
        }),
      ).rejects.toThrow(testCase.field);

      expect(fs.existsSync(path.join(tmpDir, ".akasha"))).toBe(false);
    }
  });

  it("runs remember with --content-file without putting content in argv", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "akasha-cli-remember-"));
    const contentPath = path.join(tmpDir, "summary.txt");
    fs.writeFileSync(contentPath, "Summary: captured from file.\nNext: verify.");
    const registry: ToolRegistry = {
      ...goalRunRegistryStubs(),
      build_context_pack: vi.fn(),
      search_memory: vi.fn(),
      add_memory: vi.fn().mockResolvedValue({
        ok: true,
        memoryId: "project:project-alpha:1",
        summary: "Stored file summary",
      }),
      compact_memory: vi.fn(),
      list_memory: vi.fn(),
      inspect_memory_graph: vi.fn(),
      update_memory: vi.fn(),
      delete_memory: vi.fn(),
      tag_memory: vi.fn(),
      list_audit_log: vi.fn(),
      unarchive_memory: vi.fn(),
      reindex_memory: vi.fn(),
    };

    await runCli(
      [
        "remember",
        "--project",
        "project-alpha",
        "--organization-id",
        "acme",
        "--kind",
        "summary",
        "--content-file",
        "summary.txt",
      ],
      { registry, cwd: tmpDir },
    );

    expect(registry.add_memory).toHaveBeenCalledWith({
      projectKey: "project-alpha",
      userScopeId: undefined,
      organizationId: "acme",
      kind: "summary",
      content: "Summary: captured from file.\nNext: verify.",
    });
  });

  it("writes MCP config snippets and lifecycle hook scripts without copying secrets", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "akasha-cli-init-"));
    fs.writeFileSync(
      path.join(tmpDir, ".env"),
      [
        "MEMORY_API_TOKENS=secret-token",
        "QDRANT_API_KEY=secret-qdrant",
      ].join("\n"),
    );

    const output = await runCli(
      [
        "init",
        "--project",
        "project-alpha",
        "--organization-id",
        "acme",
        "--task",
        "continue work",
        "--out-dir",
        ".akasha",
      ],
      { cwd: tmpDir },
    );

    const result = JSON.parse(output);
    expect(result.ok).toBe(true);
    expect(result.files).toHaveLength(6);
    expect(
      result.files.every(
        (file: { action: string }) => file.action === "created",
      ),
    ).toBe(true);

    const claudeConfigPath = path.join(
      tmpDir,
      ".akasha",
      "mcp",
      "claude-desktop.json",
    );
    const codexConfigPath = path.join(tmpDir, ".akasha", "mcp", "codex.toml");
    const sessionStartPath = path.join(
      tmpDir,
      ".akasha",
      "hooks",
      "session-start.sh",
    );
    const sessionEndPath = path.join(
      tmpDir,
      ".akasha",
      "hooks",
      "session-end.sh",
    );

    const claudeConfig = JSON.parse(fs.readFileSync(claudeConfigPath, "utf8"));
    expect(claudeConfig.mcpServers.akasha.command).toBe(
      path.join(tmpDir, ".akasha", "bin", "mcp-server.sh"),
    );
    expect(claudeConfig.mcpServers.akasha.args).toEqual([]);

    for (const generated of [
      fs.readFileSync(claudeConfigPath, "utf8"),
      fs.readFileSync(codexConfigPath, "utf8"),
    ]) {
      expect(generated).not.toContain("secret-token");
      expect(generated).not.toContain("secret-qdrant");
      expect(generated).not.toContain("MEMORY_API_TOKENS");
      expect(generated).not.toContain("QDRANT_API_KEY");
    }

    expect(fs.readFileSync(sessionStartPath, "utf8")).toContain(" pack ");
    expect(fs.readFileSync(sessionStartPath, "utf8")).toContain(
      "--organization-id",
    );
    expect(fs.readFileSync(sessionEndPath, "utf8")).toContain(" remember ");
    expect(fs.readFileSync(sessionEndPath, "utf8")).toContain("mktemp");
    expect(fs.readFileSync(sessionEndPath, "utf8")).toContain("--content-file");
    expect(fs.readFileSync(sessionEndPath, "utf8")).not.toContain(
      "--content \"$CONTENT\"",
    );
  });

  it("does not overwrite existing lifecycle files unless --force is provided", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "akasha-cli-init-"));
    await runCli(["init", "--project", "project-alpha"], { cwd: tmpDir });
    const readmePath = path.join(tmpDir, ".akasha", "README.md");
    fs.writeFileSync(readmePath, "custom local notes\n");

    const skippedOutput = await runCli(["init", "--project", "project-alpha"], {
      cwd: tmpDir,
    });
    expect(fs.readFileSync(readmePath, "utf8")).toBe("custom local notes\n");
    expect(
      JSON.parse(skippedOutput).files.some(
        (file: { path: string; action: string }) =>
          file.path === readmePath && file.action === "skipped",
      ),
    ).toBe(true);

    await runCli(["init", "--project", "project-alpha", "--force"], {
      cwd: tmpDir,
    });
    expect(fs.readFileSync(readmePath, "utf8")).toContain(
      "Akasha lifecycle init",
    );
  });
});
