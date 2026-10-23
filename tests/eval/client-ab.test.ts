import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  aggregateClientPairs,
  assertPaidClientExecutionAllowed,
  buildClientCommand,
  buildClientPrompt,
  clientAbRunPlan,
  createClientWorkspace,
  gradeClientAnswer,
  parseClaudeStream,
  parseCodexFinalOutput,
  parseCodexEvents,
  prepareClientAbExperiment,
  runPaidClientAb,
  runClientCommand,
  seedAndPreflightClientAb,
  verifyToolTrace,
} from "../../src/eval/client-ab.js";
import { assertLocalPreflightEnvironment, parseClientAbArgs } from "./client-ab-runner.js";

const fixtureRelativePath = "tests/eval/fixtures/client-ab.json";
const tempRoots: string[] = [];

vi.setConfig({ testTimeout: 15_000 });

afterAll(() => {
  vi.resetConfig();
});

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTrackedFixtureRepo() {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), "akasha-client-ab-test-"));
  tempRoots.push(repoDir);
  const fixture = await readFile(path.join(process.cwd(), fixtureRelativePath), "utf8");
  await writeFile(path.join(repoDir, "fixture.json"), fixture);
  const parsed = JSON.parse(fixture) as {
    sourcePaths: string[];
    seedSourcePath: string;
  };
  for (const sourcePath of [...parsed.sourcePaths, parsed.seedSourcePath]) {
    const targetPath = path.join(repoDir, sourcePath);
    await (await import("node:fs/promises")).mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, await readFile(path.join(process.cwd(), sourcePath), "utf8"));
  }
  execFileSync("git", ["init", "--quiet"], { cwd: repoDir });
  execFileSync("git", ["config", "user.email", "eval@example.test"], { cwd: repoDir });
  execFileSync("git", ["config", "user.name", "Eval"], { cwd: repoDir });
  execFileSync("git", ["add", "."], { cwd: repoDir });
  execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: repoDir });
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).trim();
  return { repoDir, sha };
}

describe("client A/B evaluation harness", () => {
  it("uses a clean fixed-SHA corpus for both conditions without leaking the foreign sentinel", async () => {
    const { repoDir, sha } = await makeTrackedFixtureRepo();
    const experiment = prepareClientAbExperiment({
      repoDir,
      sha,
      fixturePath: "fixture.json",
    });
    const task = experiment.tasks[0]!;
    const offPrompt = buildClientPrompt(task, "off", { rawCanonicalContext: experiment.rawCanonicalContext });
    const onPrompt = buildClientPrompt(task, "on", { scope: experiment });

    expect(experiment.sourceSha).toBe(sha);
    expect(experiment.seedRecords.every((record) => record.organizationId === experiment.organizationId || record.organizationId === experiment.foreignOrganizationId)).toBe(true);
    expect(experiment.rawCanonicalContext).not.toContain("ORBITAL_SENTINEL_9BCE");
    expect(task.contextRecords).toHaveLength(1);
    expect(task.contextRecords.length).toBeLessThan(experiment.targetRecords.length);
    expect(onPrompt.endsWith(experiment.sharedPromptSuffix)).toBe(true);
    expect(offPrompt.endsWith(experiment.sharedPromptSuffix)).toBe(true);
    expect(onPrompt).not.toContain("alpha.canonical-pg");
    expect(offPrompt).not.toContain("foreign-sentinel");
    expect(experiment.targetRecords.length).toBeGreaterThanOrEqual(80);
    expect(experiment.targetRecords.find((record) => record.seedKey === "alice.korean-default")).toMatchObject({ kind: "decision" });
    expect(experiment.targetRecords.find((record) => record.seedKey === "alpha.no-content-logging")).toMatchObject({ kind: "summary" });
  });

  it("rejects a tracked change after the fixture SHA was pinned", async () => {
    const { repoDir, sha } = await makeTrackedFixtureRepo();
    await writeFile(path.join(repoDir, "fixture.json"), "{}\n");

    expect(() =>
      prepareClientAbExperiment({ repoDir, sha, fixturePath: "fixture.json" }),
    ).toThrow("tracked staged or unstaged changes");
  });

  it("creates a client cwd containing only the generic output schema", async () => {
    const workspace = await createClientWorkspace();
    tempRoots.push(workspace.rootDir);
    const entries = await (await import("node:fs/promises")).readdir(workspace.cwd);

    expect(entries).toEqual(["result.schema.json"]);
    expect(JSON.parse(await readFile(workspace.schemaPath, "utf8"))).toMatchObject({
      type: "object",
      required: ["claims"],
    });
  });

  it("does not configure Akasha for the off command while requiring it for on", async () => {
    const workspace = await createClientWorkspace();
    tempRoots.push(workspace.rootDir);
    const mcpServer = { command: "node", args: ["server.js"] };
    const off = await buildClientCommand({
      vendor: "codex",
      condition: "off",
      workspace,
      prompt: "task",
      expectedModel: "codex-test",
      mcpServer,
    });
    const on = await buildClientCommand({
      vendor: "codex",
      condition: "on",
      workspace,
      prompt: "task",
      expectedModel: "codex-test",
      mcpServer,
    });

    expect(off.args.join(" ")).not.toContain("mcp_servers.akasha");
    expect(on.args.join(" ")).toContain("mcp_servers.akasha.command");
  });

  it("grades normalized complete claims while rejecting omissions, contradictions, and sentinel leakage", () => {
    const complete = JSON.stringify({
      claims: {
        canonical_store: "postgres",
        vector_recovery: "rebuild_from_postgres",
      },
    });
    const task = {
      id: "canonical-state",
      claimKeys: ["canonical_store", "vector_recovery"],
    };

    expect(gradeClientAnswer(task, complete)).toMatchObject({ success: true, omissions: [], contradictions: [], leakage: [] });
    expect(gradeClientAnswer(task, JSON.stringify({ claims: { canonical_store: "postgres" } }))).toMatchObject({ success: false, omissions: ["vector_recovery"] });
    expect(gradeClientAnswer(task, JSON.stringify({ claims: { canonical_store: "Qdrant is canonical", vector_recovery: "rebuild_from_postgres" } }))).toMatchObject({ success: false, contradictions: ["canonical_store"] });
    expect(gradeClientAnswer(task, JSON.stringify({ claims: { canonical_store: "postgres", vector_recovery: "ORBITAL_SENTINEL_9BCE" } }))).toMatchObject({ success: false, leakage: ["foreign-sentinel"] });
    expect(gradeClientAnswer({ id: "context-quality", claimKeys: ["chunk_policy"] }, JSON.stringify({ claims: { chunk_policy: "800 tokens" } }))).toMatchObject({ success: false, contradictions: ["chunk_policy"] });
  });

  it("requires one successful context-pack call with the exact task and scope", () => {
    const expected = { organizationId: "org-a", projectKey: "p", task: "task", userScopeId: "u", includeUser: true, limit: 10 };
    const call = { server: "akasha", name: "build_context_pack", arguments: expected, succeeded: true, selectedMemoryIds: ["1"] };
    expect(() => verifyToolTrace("on", [], expected, ["1"])).toThrow("exactly one Akasha build_context_pack call");
    expect(() => verifyToolTrace("on", [call, call], expected, ["1"])).toThrow("exactly one Akasha build_context_pack call");
    expect(() => verifyToolTrace("off", [call])).toThrow("must not make tool calls");
    expect(verifyToolTrace("on", [call], expected, ["1"])).toEqual(undefined);
    expect(() => verifyToolTrace("on", [{ ...call, selectedMemoryIds: ["foreign"] }], expected, ["1"])).toThrow("outside the preflight target scope");
    expect(() => verifyToolTrace("on", [{ ...call, succeeded: false }], expected, ["1"])).toThrow("successful nonempty");
    expect(() => verifyToolTrace("on", [{ ...call, arguments: { ...expected, organizationId: "foreign" } }], expected, ["1"])).toThrow("exact task and scope");
  });

  it("rejects negations that merely contain the expected answer words", () => {
    expect(gradeClientAnswer({ claimKeys: ["canonical_store", "vector_recovery"] }, JSON.stringify({ claims: {
      canonical_store: "Postgres is not canonical.", vector_recovery: "Do not rebuild anything.",
    } })).success).toBe(false);
  });

  it("pairs Claude tool results by ID and accepts Codex nullable success errors", () => {
    const args = { organizationId: "org-a", projectKey: "p", task: "task", userScopeId: "u", includeUser: true, limit: 10 };
    const pack = { ok: true, packMarkdown: "recovered fact", selectedMemoryIds: ["1"] };
    const codex = [
      { type: "item.completed", item: { type: "mcp_tool_call", server: "akasha", tool: "build_context_pack", arguments: args, status: "completed", error: null, result: { structured_content: pack } } },
      { type: "turn.completed", usage: { input_tokens: 1 } },
    ].map((event) => JSON.stringify(event)).join("\n");
    expect(() => verifyToolTrace("on", parseCodexEvents(codex).toolCalls, args, ["1"])).not.toThrow();
    expect(() => verifyToolTrace("on", parseCodexEvents(codex.replace("recovered fact", "ORBITAL_SENTINEL_9BCE")).toolCalls, args, ["1"])).toThrow("successful nonempty");
    const claude = (is_error: boolean, tool_use_id = "call-1") => [
      { type: "assistant", message: { content: [{ type: "tool_use", id: "call-1", name: "mcp__akasha__build_context_pack", input: args }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id, is_error, content: JSON.stringify(pack) }] } },
      { type: "result", subtype: "success", is_error: false, modelUsage: { "claude-test": {} }, structured_output: { claims: {} }, usage: { input_tokens: 1 } },
    ].map((event) => JSON.stringify(event)).join("\n");
    expect(() => verifyToolTrace("on", parseClaudeStream(claude(false), "claude-test").toolCalls, args, ["1"])).not.toThrow();
    expect(() => verifyToolTrace("on", parseClaudeStream(claude(true), "claude-test").toolCalls, args, ["1"])).toThrow("successful nonempty");
    expect(() => verifyToolTrace("on", parseClaudeStream(claude(false, "unrelated"), "claude-test").toolCalls, args, ["1"])).toThrow("successful nonempty");
  });

  it("parses client usage without double-counting Codex cache tokens and enforces the declared Claude model", () => {
    expect(parseCodexEvents('{"type":"turn.completed","usage":{"input_tokens":120,"cached_input_tokens":40}}\n')).toEqual({ inputTokens: 120, cachedInputTokens: 40, toolCalls: [] });
    expect(() => parseCodexEvents('{"type":"turn.completed","usage":{"input_tokens":1}}\n{"type":"turn.completed","usage":{"input_tokens":1}}\n')).toThrow("exactly one turn.completed");
    expect(parseClaudeStream('{"type":"result","subtype":"success","is_error":false,"modelUsage":{"claude-test":{}},"structured_output":{"claims":{}},"usage":{"input_tokens":20,"cache_creation_input_tokens":5,"cache_read_input_tokens":3}}\n', "claude-test")).toMatchObject({ inputTokens: 28, cachedInputTokens: 8, observedModel: "claude-test" });
    expect(() => parseClaudeStream('{"type":"result","subtype":"success","is_error":false,"modelUsage":{"other":{}},"structured_output":{"claims":{}},"usage":{"input_tokens":1,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}\n', "claude-test")).toThrow("modelUsage");
    expect(() => parseCodexEvents('{"type":"item.completed","item":{"type":"mcp_tool_call","server":"akasha","tool":"build_context_pack","status":"failed","error":"nope"}}\n{"type":"turn.completed","usage":{"input_tokens":1}}\n')).toThrow("did not complete");
    expect(() => parseCodexEvents('{"type":"turn.failed"}\n')).toThrow("failed turn");
    expect(() => verifyToolTrace("on", parseCodexEvents('{"type":"item.completed","item":{"type":"command_execution"}}\n{"type":"turn.completed","usage":{"input_tokens":1}}\n').toolCalls)).toThrow("exactly one Akasha");
  });

  it("requires Codex to leave a structured final JSON object", () => {
    expect(parseCodexFinalOutput('{"claims":{"canonical_store":"Postgres"}}')).toEqual({
      claims: { canonical_store: "Postgres" },
    });
    expect(() => parseCodexFinalOutput("not json")).toThrow("structured final JSON");
    expect(() => parseCodexFinalOutput('{"claims":"Postgres"}')).toThrow("claims object");
  });

  it("aggregates all nine paired results for one vendor without mixing clients", () => {
    const pairs = Array.from({ length: 9 }, (_, index) => ({
      vendor: "codex" as const,
      taskId: `task-${index % 3}`,
      repeat: Math.floor(index / 3) + 1,
      off: { success: true, inputTokens: 200 },
      on: { success: true, inputTokens: 160 },
    }));

    expect(aggregateClientPairs("codex", pairs)).toMatchObject({ pairCount: 9, medianInputTokenReduction: 0.2, passed: true });
    expect(() => aggregateClientPairs("codex", [...pairs, { ...pairs[0]!, vendor: "claude" as const }])).toThrow("must not mix vendors");
  });

  it("uses a deterministic 18-call plan, stdin-only prompts, isolated MCP env, and atomic paired evidence", async () => {
    const { repoDir, sha } = await makeTrackedFixtureRepo();
    const experiment = prepareClientAbExperiment({ repoDir, sha, fixturePath: "fixture.json" });
    const resultRoot = await mkdtemp(path.join(os.tmpdir(), "akasha-client-ab-results-"));
    tempRoots.push(resultRoot);
    const resultDir = path.join(resultRoot, "run");
    const calls: Array<{ condition: string; stdin: string; args: string[]; env: NodeJS.ProcessEnv }> = [];
    const answer = (prompt: string) => {
      if (prompt.includes("canonical_store")) return { claims: { canonical_store: "postgres", vector_recovery: "rebuild_from_postgres" } };
      if (prompt.includes("default_language")) return { claims: { default_language: "korean", logging_rule: "never_log_raw_memory_content" } };
      return { claims: { source_diversity: "preserve_source_diversity", chunk_policy: "800_tokens_120_overlap" } };
    };
    await expect(runPaidClientAb({
      experiment, vendor: "codex", model: "codex-test", resultDir,
      mcpServer: { command: "node", args: [] }, executePaid: true,
      env: { AKASHA_ALLOW_PAID_CLIENT_EVAL: "1" }, allowedMemoryIds: ["1"],
    })).rejects.toThrow("paid Codex A/B execution fails closed");

    const summary = await runPaidClientAb({
      experiment,
      vendor: "codex",
      model: "codex-test",
      resultDir,
      mcpServer: { command: "node", args: ["server.js"], env: { DMO_CWD: repoDir, DATABASE_URL: "postgres://secret.invalid/never-client" } },
      executePaid: true,
      env: { AKASHA_ALLOW_PAID_CLIENT_EVAL: "1" },
      allowedMemoryIds: ["1"],
      getCliVersion: async () => "codex 0.test",
      execute: async (command) => {
        const on = command.args.some((arg) => arg.includes("mcp_servers.akasha.command"));
        calls.push({ condition: on ? "on" : "off", stdin: command.stdin, args: command.args, env: command.env });
        return {
          stdout: `${on ? JSON.stringify({ type: "item.completed", item: { type: "mcp_tool_call", server: "akasha", tool: "build_context_pack", status: "completed", error: null, arguments: JSON.parse(command.stdin.split("\n").find((line) => line.startsWith('{"organizationId"'))!), result: { structured_content: { ok: true, packMarkdown: "retrieved fact", selectedMemoryIds: ["1"] } } } }) + "\n" : ""}{"type":"turn.completed","model":"codex-test","usage":{"input_tokens":${on ? 160 : 200},"cached_input_tokens":0}}\n`,
          stderr: "",
          finalOutput: JSON.stringify(answer(command.stdin)),
        };
      },
    });

    expect(calls).toHaveLength(18);
    expect(calls.map((call) => call.condition)).toEqual(["off", "on", "on", "off", "off", "on", "off", "on", "on", "off", "off", "on", "off", "on", "on", "off", "off", "on"]);
    expect(calls.every((call) => !call.args.some((arg) => arg.includes("Raw canonical context")) && call.stdin.includes("Return exactly one JSON object"))).toBe(true);
    expect(calls.every((call) => !call.stdin.includes("alpha.canonical-pg") && call.env.DATABASE_URL === undefined)).toBe(true);
    expect(summary.aggregate).toMatchObject({ pairCount: 9, passed: true, medianInputTokenReduction: 0.2 });
    expect(await (await import("node:fs/promises")).readdir(resultDir)).toHaveLength(19);
  });

  it("persists a failing condition and summary failure without retrying", async () => {
    const { repoDir, sha } = await makeTrackedFixtureRepo();
    const experiment = prepareClientAbExperiment({ repoDir, sha, fixturePath: "fixture.json" });
    const resultRoot = await mkdtemp(path.join(os.tmpdir(), "akasha-client-ab-failure-"));
    tempRoots.push(resultRoot);
    const resultDir = path.join(resultRoot, "run");
    let calls = 0;

    await expect(runPaidClientAb({
      experiment, vendor: "codex", model: "codex-test", resultDir,
      mcpServer: { command: "node", args: ["server.js"] }, executePaid: true,
      env: { AKASHA_ALLOW_PAID_CLIENT_EVAL: "1" }, allowedMemoryIds: ["1"],
      getCliVersion: async () => "codex 0.test",
      execute: async () => { calls += 1; throw new Error("fake client failure"); },
    })).rejects.toThrow("fake client failure");

    expect(calls).toBe(1);
    const files = await (await import("node:fs/promises")).readdir(resultDir);
    expect(files).toContain("codex-canonical-state-r1-off.json");
    expect(files).toContain("codex-failure.json");
  });

  it("seeds and preflights exact target scope through public registry methods before any client call", async () => {
    const { repoDir, sha } = await makeTrackedFixtureRepo();
    const experiment = prepareClientAbExperiment({ repoDir, sha, fixturePath: "fixture.json" });
    const resultPath = path.join(await mkdtemp(path.join(os.tmpdir(), "akasha-client-ab-preflight-")), "preflight.json");
    tempRoots.push(path.dirname(resultPath));
    const memories = new Map<string, { id: string; content: string }>();
    let sequence = 0;
    const registry = {
      add_memory: async (input: { content: string; kind: string; scope: "project" | "user"; projectKey: string; userScopeId?: string }) => {
        expect(input.kind).toBe(experiment.seedRecords.find((record) => record.content === input.content)!.kind);
        const memoryId = String(++sequence);
        const contextId = `${input.scope}:${input.scope === "project" ? input.projectKey : input.userScopeId}:${memoryId}`;
        memories.set(contextId, { id: contextId, content: input.content });
        return { ok: true as const, memoryId, summary: "seeded" };
      },
      build_context_pack: async (input: { task: string; organizationId?: string; projectKey: string; userScopeId?: string; includeUser?: boolean; limit?: number }) => {
        expect(input).toMatchObject({ organizationId: experiment.organizationId, projectKey: experiment.projectKey, userScopeId: experiment.userScopeId, includeUser: true, limit: 10 });
        const selected = [...memories.values()].filter((memory) =>
          input.task.includes("authoritative") ? memory.content.includes("Postgres is the canonical")
            : input.task.includes("language") ? memory.content.includes("Korean responses") || memory.content.includes("never log raw")
              : memory.content.includes("source diversity") || memory.content.includes("800 tokens"),
        ).map((memory) => memory.id);
        return { ok: true as const, projectKey: input.projectKey, selectedMemoryIds: selected, packMarkdown: selected.map((id) => memories.get(id)!.content).join("\n"), sections: { project: "", user: "" }, selectionRationale: [] };
      },
    };

    const preflight = await seedAndPreflightClientAb({ experiment, registry: registry as never, resultPath });

    expect(preflight).toMatchObject({ seededRecordCount: experiment.seedRecords.length, foreignLeakageCount: 0 });
    expect(preflight.tasks).toHaveLength(3);
    expect(JSON.parse(await readFile(resultPath, "utf8"))).toMatchObject({ sourceSha: sha, foreignLeakageCount: 0 });
  });

  it("requires both paid guards and strictly parses paid/preflight runner options", () => {
    expect(() => assertPaidClientExecutionAllowed({}, true)).toThrow("AKASHA_ALLOW_PAID_CLIENT_EVAL=1");
    expect(() => assertPaidClientExecutionAllowed({ AKASHA_ALLOW_PAID_CLIENT_EVAL: "1" }, false)).toThrow("--execute-paid");
    const sha = "a".repeat(40);
    expect(parseClientAbArgs(["--sha", sha])).toMatchObject({ executePaid: false, preflight: false });
    expect(parseClientAbArgs(["--sha", sha, "--preflight"])).toMatchObject({ preflight: true });
    expect(parseClientAbArgs(["--sha", sha, "--execute-paid", "--client", "claude", "--model", "claude-test", "--max-budget-usd", "0.20"])).toMatchObject({ executePaid: true, client: "claude", maxBudgetUsd: 0.2 });
    expect(() => parseClientAbArgs(["--sha", sha, "--execute-paid"])).toThrow("requires --client and --model");
    expect(() => parseClientAbArgs(["--sha", sha, "--client", "codex", "--max-budget-usd", "0.20"])).toThrow("only with --client claude");
  });

  it("rejects remote or paid preflight configurations before service bootstrap", () => {
    const env = { EMBEDDING_PROVIDER: "transformers", VECTOR_BACKEND: "qdrant", DATABASE_URL: "postgres://memory:memory@127.0.0.1:55432/akasha_eval_123", QDRANT_URL: "http://127.0.0.1:6333", QDRANT_COLLECTION_NAME: "akasha_eval_123" };
    expect(() => assertLocalPreflightEnvironment(env)).not.toThrow();
    expect(() => assertLocalPreflightEnvironment({ ...env, EMBEDDING_PROVIDER: "openai" })).toThrow("local transformers");
    expect(() => assertLocalPreflightEnvironment({ ...env, QDRANT_URL: "https://remote.invalid" })).toThrow("disposable local");
    expect(() => assertLocalPreflightEnvironment({ ...env, DATABASE_URL: "postgres://memory:memory@localhost/production" })).toThrow("disposable local");
    expect(() => assertLocalPreflightEnvironment({ ...env, DATABASE_URL: env.DATABASE_URL + "?host=remote.invalid&database=production" })).toThrow("disposable local");
    expect(() => assertLocalPreflightEnvironment({ ...env, QDRANT_URL: env.QDRANT_URL + "/proxy" })).toThrow("disposable local");
  });

  it("preserves existing evidence and refuses a repeated result directory before any client call", async () => {
    const { repoDir, sha } = await makeTrackedFixtureRepo();
    const experiment = prepareClientAbExperiment({ repoDir, sha, fixturePath: "fixture.json" });
    const resultDir = await mkdtemp(path.join(os.tmpdir(), "akasha-client-ab-existing-"));
    tempRoots.push(resultDir);
    const old = '{"passed":true}\n';
    await writeFile(path.join(resultDir, "codex-summary.json"), old);
    const execute = vi.fn();
    const getCliVersion = vi.fn();
    await expect(runPaidClientAb({ experiment, vendor: "codex", model: "codex-test", resultDir, mcpServer: { command: "node", args: [] }, executePaid: true, env: { AKASHA_ALLOW_PAID_CLIENT_EVAL: "1" }, allowedMemoryIds: ["1"], execute, getCliVersion })).rejects.toThrow("EEXIST");
    expect(execute).not.toHaveBeenCalled();
    expect(getCliVersion).not.toHaveBeenCalled();
    expect(await readFile(path.join(resultDir, "codex-summary.json"), "utf8")).toBe(old);
  });

  it.skipIf(process.platform === "win32")("waits for an owned SIGTERM-resistant child to close after timeout", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "akasha-client-ab-child-"));
    tempRoots.push(cwd);
    await expect(runClientCommand({ binary: "sh", args: ["-c", 'trap "" TERM; echo $$ > child.pid; while :; do sleep 1; done'], cwd, env: { PATH: process.env.PATH }, stdin: "", finalOutputPath: "" }, 2000)).rejects.toThrow("timed out");
    const pid = Number(await readFile(path.join(cwd, "child.pid"), "utf8"));
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it("builds the contractually safe plan without retry slots", async () => {
    const { repoDir, sha } = await makeTrackedFixtureRepo();
    const experiment = prepareClientAbExperiment({ repoDir, sha, fixturePath: "fixture.json" });
    expect(clientAbRunPlan(experiment).map((entry) => `${entry.task.id}:${entry.repeat}:${entry.condition}`)).toEqual([
      "canonical-state:1:off", "canonical-state:1:on", "canonical-state:2:on", "canonical-state:2:off", "canonical-state:3:off", "canonical-state:3:on",
      "operator-preferences:1:off", "operator-preferences:1:on", "operator-preferences:2:on", "operator-preferences:2:off", "operator-preferences:3:off", "operator-preferences:3:on",
      "context-quality:1:off", "context-quality:1:on", "context-quality:2:on", "context-quality:2:off", "context-quality:3:off", "context-quality:3:on",
    ]);
  });
});
