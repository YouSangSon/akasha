import { describe, expect, it, vi } from "vitest";
import { prefetchCliContextPack } from "../../src/eval/client-cli-prefetch.js";
import type { PgQueryable } from "../../src/db/connection.js";
import type { ClientAbExperiment, ClientAbPreflight, ClientCommand } from "../../src/eval/client-ab.js";

const task = { id: "canonical-state", task: "Where is canonical state?", claimKeys: ["canonical_store", "vector_recovery"], contextRecords: [] };
const experiment = { organizationId: "org-a", projectKey: "project-a", userScopeId: "user-a", tasks: [task] } as unknown as ClientAbExperiment;
const preflight = { allowedMemoryIds: ["project:project-a:1", "project:project-a:2"], tasks: [{ taskId: task.id, requiredMemoryIds: ["project:project-a:1"] }] } as ClientAbPreflight;
const markdown = "  Postgres is canonical; rebuild vectors.\n";
const receipt = { id: "42", selected_memory_ids: ["project:project-a:1"], pack_markdown: markdown };

describe("actual CLI prefetch provenance", () => {
  it("uses explicit scope, a fresh DB cursor, exact stdout, and a credential allowlist", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ cursor: "41" }] }).mockResolvedValueOnce({ rows: [receipt] });
    const execute = vi.fn(async (command: ClientCommand) => {
      expect(command.binary).toBe(process.execPath);
      expect(command.args).toEqual(["/repo/dist/src/cli.js", "pack", "--project", "project-a", "--task", task.task, "--user", "user-a", "--organization-id", "org-a"]);
      expect(command.env).toMatchObject({ DATABASE_URL: "postgres://local", EMBEDDING_PROVIDER: "transformers" });
      expect(command.env.OPENAI_API_KEY).toBeUndefined();
      expect(command.env.CODEX_API_KEY).toBeUndefined();
      expect(command.env.ANTHROPIC_API_KEY).toBeUndefined();
      return { stdout: markdown + "\n", stderr: "" };
    });
    const result = await prefetchCliContextPack({ experiment, task, preflight, repoDir: "/repo", env: { DATABASE_URL: "postgres://local", EMBEDDING_PROVIDER: "transformers", OPENAI_API_KEY: "never-forward", CODEX_API_KEY: "never-forward", ANTHROPIC_API_KEY: "never-forward" }, database: { query } as PgQueryable, execute });
    expect(result.packMarkdown).toBe(markdown);
    expect(result.receipt).toMatchObject({ contextPackRunId: "42", selectedMemoryIds: receipt.selected_memory_ids, packSha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(query.mock.calls[1]![1]).toEqual(["41", "org-a", "project-a", task.task]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each(["cli-failure", "missing", "multiple", "mismatch", "foreign", "sentinel", "required", "anchor", "duplicate"])("rejects %s before returning context to the model", async (failure) => {
    const row = { ...receipt };
    if (failure === "foreign") row.selected_memory_ids = ["project:other:9"];
    if (failure === "sentinel") row.pack_markdown += " ORBITAL_SENTINEL_9BCE";
    if (failure === "required") row.selected_memory_ids = ["project:project-a:2"];
    if (failure === "anchor") row.pack_markdown = "No useful context";
    if (failure === "duplicate") row.selected_memory_ids = ["project:project-a:1", "project:project-a:1"];
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ cursor: "41" }] }).mockResolvedValueOnce({ rows: failure === "missing" ? [] : failure === "multiple" ? [row, row] : [row] });
    const execute = vi.fn(async () => {
      if (failure === "cli-failure") throw new Error("CLI failed");
      return { stdout: (failure === "mismatch" ? row.pack_markdown.trim() : row.pack_markdown) + "\n", stderr: "" };
    });
    await expect(prefetchCliContextPack({ experiment, task, preflight, repoDir: "/repo", env: {}, database: { query } as PgQueryable, execute })).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
