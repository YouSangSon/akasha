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
  parseCodexSubscriptionStatus,
  readCodexSubscriptionStatus,
  prepareClientAbExperiment,
  runClientAb,
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
  vi.unstubAllEnvs();
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
  it("propagates a validated MCP budget without changing the off prompt", () => {
    const task = { task: "continue", claimKeys: ["canonical_store"] };
    const scope = { organizationId: "org-a", projectKey: "p", userScopeId: "alice" };
    expect(buildClientPrompt(task, "on", { scope, maxOutputBytes: 4096 })).toContain('"maxOutputBytes":4096');
    expect(buildClientPrompt(task, "off", { rawCanonicalContext: "facts", maxOutputBytes: 4096 })).toBe(buildClientPrompt(task, "off", { rawCanonicalContext: "facts" }));
    expect(parseClientAbArgs(["--sha", "a".repeat(40), "--max-output-bytes", "4096"])).toHaveProperty("maxOutputBytes", 4096);
    expect(() => parseClientAbArgs(["--sha", "a".repeat(40), "--profile", "cli-prefetch", "--max-output-bytes", "4096"])).toThrow(/MCP roundtrip/);
  });

  it.each(["0", "-1", "1.5", "1x", "9007199254740992"])("rejects malformed evaluation budget %s", (value) => {
    expect(() => parseClientAbArgs(["--sha", "a".repeat(40), "--max-output-bytes", value])).toThrow(/positive safe integer/);
  });

  it("rejects invalid budgets before seeding or creating result directories", async () => {
    const add = vi.fn();
    await expect(seedAndPreflightClientAb({ experiment: {} as never, registry: { add_memory: add, build_context_pack: vi.fn() }, maxOutputBytes: 0 })).rejects.toThrow(/maxOutputBytes/);
    expect(add).not.toHaveBeenCalled();
    await expect(runClientAb({ profile: "cli-prefetch", maxOutputBytes: 4096 } as never)).rejects.toThrow(/MCP roundtrip/);
  });

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

  it("creates only a strict task schema with the same requested fields for each client", async () => {
    const workspace = await createClientWorkspace(["canonical_store", "vector_recovery"]);
    tempRoots.push(workspace.rootDir);
    const entries = await (await import("node:fs/promises")).readdir(workspace.cwd);

    expect(entries).toEqual(["result.schema.json"]);
    expect(JSON.parse(await readFile(workspace.schemaPath, "utf8"))).toMatchObject({
      type: "object",
      required: ["claims"],
      additionalProperties: false,
      properties: { claims: { type: "object", additionalProperties: false, required: ["canonical_store", "vector_recovery"], properties: { canonical_store: { type: "string" }, vector_recovery: { type: "string" } } } },
    });
    const command = await buildClientCommand({ vendor: "claude", condition: "off", workspace, prompt: "task", expectedModel: "test" });
    expect(JSON.parse(command.args[command.args.indexOf("--json-schema") + 1]!)).toEqual(JSON.parse(await readFile(workspace.schemaPath, "utf8")));
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
    expect(on.args).toContain('mcp_servers.akasha.enabled_tools=["build_context_pack"]');
    expect(on.args).toContain('mcp_servers.akasha.tools.build_context_pack.approval_mode="approve"');
    expect(on.args).toContain("read-only");
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
    expect(aggregateClientPairs("codex", pairs.map((pair) => ({ ...pair, on: { success: true, inputTokens: 199 } })))).toMatchObject({ allPairsSuccessful: true, passed: false });
  });

  it.each([
    { profile: "mcp-roundtrip", maxOutputBytes: undefined },
    { profile: "mcp-roundtrip", maxOutputBytes: 8192 },
    { profile: "cli-prefetch", maxOutputBytes: undefined },
  ] as const)("uses the existing paired $profile plan with budget $maxOutputBytes, isolated auth and atomic evidence", async ({ profile, maxOutputBytes }) => {
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
    await expect(runClientAb({
      experiment, vendor: "codex", model: "codex-test", resultDir,
      mcpServer: { command: "node", args: [] }, executePaid: true,
      env: { AKASHA_ALLOW_PAID_CLIENT_EVAL: "1" }, allowedMemoryIds: ["1"],
    })).rejects.toThrow("paid Codex A/B execution fails closed");

    vi.stubEnv("OPENAI_API_KEY", "must-not-reach-subscription");
    vi.stubEnv("CODEX_API_KEY", "must-not-reach-subscription");
    const readSubscriptionStatus = vi.fn(async () => ({ checkedAt: new Date().toISOString(), weeklyRemainingPercent: 80, creditBalance: "12.0000000000" }));
    const prefetch = vi.fn(async () => ({ packMarkdown: "Exact CLI pack\n", receipt: { contextPackRunId: "42", selectedMemoryIds: ["1"], packSha256: "a".repeat(64), cliDurationMs: 10 } }));
    const summary = await runClientAb({
      profile, prefetch,
      maxOutputBytes,
      experiment,
      vendor: "codex",
      model: "codex-test",
      resultDir,
      mcpServer: { command: "node", args: ["server.js"], env: { DMO_CWD: repoDir, DATABASE_URL: "postgres://secret.invalid/never-client" } },
      executePaid: false, executeSubscription: true, effort: "medium", readSubscriptionStatus,
      env: { AKASHA_ALLOW_PAID_CLIENT_EVAL: "1" },
      allowedMemoryIds: ["1"],
      getCliVersion: async () => "codex 0.test",
      execute: async (command) => {
        const mcp = command.args.some((arg) => arg.includes("mcp_servers.akasha.command"));
        const on = mcp || command.stdin.includes("Akasha context pack:");
        if (profile === "cli-prefetch") {
          expect(mcp).toBe(false);
          if (on) expect(command.stdin).toContain("Akasha context pack:\nExact CLI pack\n\n\n");
        }
        calls.push({ condition: on ? "on" : "off", stdin: command.stdin, args: command.args, env: command.env });
        return {
          stdout: `${mcp ? JSON.stringify({ type: "item.completed", item: { type: "mcp_tool_call", server: "akasha", tool: "build_context_pack", status: "completed", error: null, arguments: JSON.parse(command.stdin.split("\n").find((line) => line.startsWith('{"organizationId"'))!), result: { structured_content: { ok: true, packMarkdown: "retrieved fact", selectedMemoryIds: ["1"], ...(maxOutputBytes === undefined ? {} : { budget: { maxOutputBytes, omittedCount: 0 } }) } } } }) + "\n" : ""}{"type":"turn.completed","model":"codex-test","usage":{"input_tokens":${on ? 160 : 200},"cached_input_tokens":0}}\n`,
          stderr: "",
          finalOutput: JSON.stringify(answer(command.stdin)),
        };
      },
    });

    expect(calls).toHaveLength(18);
    expect(readSubscriptionStatus).toHaveBeenCalledTimes(36);
    expect(calls.every((call) => call.env.OPENAI_API_KEY === undefined && call.env.CODEX_API_KEY === undefined && call.args.includes('forced_login_method="chatgpt"') && call.args.includes('model_provider="openai"'))).toBe(true);
    expect(calls.map((call) => call.condition)).toEqual(["off", "on", "on", "off", "off", "on", "off", "on", "on", "off", "off", "on", "off", "on", "on", "off", "off", "on"]);
    expect(calls.every((call) => !call.args.some((arg) => arg.includes("Raw canonical context")) && call.stdin.includes("Return exactly one JSON object"))).toBe(true);
    expect(calls.every((call) => !call.stdin.includes("alpha.canonical-pg") && call.env.DATABASE_URL === undefined)).toBe(true);
    expect(summary.aggregate).toMatchObject({ pairCount: 9, passed: true, medianInputTokenReduction: 0.2 });
    expect(summary.profile).toBe(profile);
    expect(prefetch).toHaveBeenCalledTimes(profile === "cli-prefetch" ? 9 : 0);
    const observed = JSON.parse(await readFile(path.join(resultDir, "codex-canonical-state-r1-on.json"), "utf8"));
    expect(observed).toMatchObject({ profile, clientStdinUtf8Bytes: Buffer.byteLength(calls.find((call) => call.condition === "on")!.stdin, "utf8"), clientDurationMs: expect.any(Number) });
    expect(observed.clientDurationMs).toBeGreaterThanOrEqual(0);
    if (maxOutputBytes !== undefined) {
      expect(observed.maxOutputBytes).toBe(maxOutputBytes);
      expect(summary.maxOutputBytes).toBe(maxOutputBytes);
      expect(observed.toolCalls[0].arguments.maxOutputBytes).toBe(maxOutputBytes);
      expect(observed.toolCalls[0].payloadBytes.structuredContentJsonUtf8Bytes).toBeGreaterThan(0);
    } else expect(summary).not.toHaveProperty("maxOutputBytes");
    expect(await (await import("node:fs/promises")).readdir(resultDir)).toHaveLength(profile === "cli-prefetch" ? 29 : 20);
  });

  it.each(["client", "prefetch"])("persists a failing %s and summary failure without retrying", async (failure) => {
    const { repoDir, sha } = await makeTrackedFixtureRepo();
    const experiment = prepareClientAbExperiment({ repoDir, sha, fixturePath: "fixture.json" });
    const resultRoot = await mkdtemp(path.join(os.tmpdir(), "akasha-client-ab-failure-"));
    tempRoots.push(resultRoot);
    const resultDir = path.join(resultRoot, "run");
    let calls = 0;

    await expect(runClientAb({
      profile: failure === "prefetch" ? "cli-prefetch" : "mcp-roundtrip",
      prefetch: async () => { throw new Error("fake client failure"); },
      experiment, vendor: "codex", model: "codex-test", resultDir,
      mcpServer: { command: "node", args: ["server.js"] }, executePaid: true,
      env: { AKASHA_ALLOW_PAID_CLIENT_EVAL: "1" }, allowedMemoryIds: ["1"],
      getCliVersion: async () => "codex 0.test",
      execute: async () => { calls += 1; throw new Error("fake client failure"); },
    })).rejects.toThrow("fake client failure");

    expect(calls).toBe(failure === "prefetch" ? 0 : 1);
    const files = await (await import("node:fs/promises")).readdir(resultDir);
    expect(files).toContain("codex-canonical-state-r1-off.json");
    expect(files).toContain("codex-failure.json");
    const failed = JSON.parse(await readFile(path.join(resultDir, "codex-canonical-state-r1-off.json"), "utf8"));
    if (failure === "client") {
      expect(failed.clientStdinUtf8Bytes).toBeGreaterThan(0);
      expect(failed.clientDurationMs).toBeGreaterThanOrEqual(0);
    } else {
      expect(failed).not.toHaveProperty("clientStdinUtf8Bytes");
      expect(failed).not.toHaveProperty("clientDurationMs");
    }
    expect(JSON.parse(await readFile(path.join(resultDir, "codex-failure.json"), "utf8"))).toMatchObject({ profile: failure === "prefetch" ? "cli-prefetch" : "mcp-roundtrip" });
  });

  // A roomy cap isolates byte/metadata propagation from the fake selection policy.
  it.each([undefined, 1_000_000])("seeds and preflights exact target scope through public registry methods before any client call", async (maxOutputBytes) => {
    const { repoDir, sha } = await makeTrackedFixtureRepo();
    const experiment = prepareClientAbExperiment({ repoDir, sha, fixturePath: "fixture.json" });
    const resultPath = path.join(await mkdtemp(path.join(os.tmpdir(), "akasha-client-ab-preflight-")), "preflight.json");
    tempRoots.push(path.dirname(resultPath));
    const memories = new Map<string, { id: string; content: string }>();
    let sequence = 0;
    const packs: Array<{ packMarkdown: string }> = [];
    const registry = {
      add_memory: async (input: { content: string; kind: string; scope: "project" | "user"; projectKey: string; userScopeId?: string }) => {
        expect(input.kind).toBe(experiment.seedRecords.find((record) => record.content === input.content)!.kind);
        const memoryId = String(++sequence);
        const contextId = `${input.scope}:${input.scope === "project" ? input.projectKey : input.userScopeId}:${memoryId}`;
        memories.set(contextId, { id: contextId, content: input.content });
        return { ok: true as const, memoryId, summary: "seeded" };
      },
      build_context_pack: async (input: { task: string; organizationId?: string; projectKey: string; userScopeId?: string; includeUser?: boolean; limit?: number; maxOutputBytes?: number }) => {
        expect(input).toMatchObject({ organizationId: experiment.organizationId, projectKey: experiment.projectKey, userScopeId: experiment.userScopeId, includeUser: true, limit: 10, ...(maxOutputBytes === undefined ? {} : { maxOutputBytes }) });
        const selected = [...memories.values()].filter((memory) =>
          input.task.includes("authoritative") ? memory.content.includes("Postgres is the canonical")
            : input.task.includes("language") ? memory.content.includes("Korean responses") || memory.content.includes("never log raw")
              : memory.content.includes("source diversity") || memory.content.includes("800 tokens"),
        ).map((memory) => memory.id);
        const pack = { ok: true as const, projectKey: input.projectKey, selectedMemoryIds: selected, packMarkdown: selected.map((id) => memories.get(id)!.content).join("\n"), sections: { project: "", user: "" }, selectionRationale: [], ...(maxOutputBytes === undefined ? {} : { budget: { maxOutputBytes, omittedCount: 0 } }) };
        packs.push(pack);
        return pack;
      },
    };

    const preflight = await seedAndPreflightClientAb({ experiment, registry: registry as never, resultPath, maxOutputBytes });

    expect(preflight).toMatchObject({ seededRecordCount: experiment.seedRecords.length, foreignLeakageCount: 0 });
    expect(preflight.tasks).toHaveLength(3);
    preflight.tasks.forEach((task, index) => {
      expect(task.rawCanonicalUtf8Bytes).toBe(Buffer.byteLength(experiment.rawCanonicalContext, "utf8"));
      expect(task.contextPackMarkdownUtf8Bytes).toBe(Buffer.byteLength(packs[index]!.packMarkdown, "utf8"));
      expect(task.contextPackStructuredJsonUtf8Bytes).toBe(Buffer.byteLength(JSON.stringify(packs[index]), "utf8"));
    });
    if (maxOutputBytes !== undefined) expect(preflight.maxOutputBytes).toBe(maxOutputBytes);
    else expect(preflight).not.toHaveProperty("maxOutputBytes");
    expect(JSON.parse(await readFile(resultPath, "utf8"))).toMatchObject({ sourceSha: sha, foreignLeakageCount: 0 });
  });

  it("fails closed on non-subscription auth, unavailable usage, exhausted limits, or missing credits", () => {
    const account = { account: { type: "chatgpt" }, requiresOpenaiAuth: true };
    const limits = { limitId: "codex", primary: { usedPercent: 10, windowDurationMins: 10080 }, secondary: null, credits: { balance: "12.0000000000" }, spendControlReached: false, rateLimitReachedType: null };
    const usage = { ordinaryUsageAllowed: true, rateLimits: limits };
    expect(parseCodexSubscriptionStatus(account, usage)).toMatchObject({ weeklyRemainingPercent: 90, creditBalance: "12.0000000000" });
    for (const type of ["apiKey", "chatgptAuthTokens", "amazonBedrock"]) expect(() => parseCodexSubscriptionStatus({ ...account, account: { type } }, usage)).toThrow("ChatGPT authentication");
    for (const patch of [{ ordinaryUsageAllowed: null }, { ordinaryUsageAllowed: false }, { rateLimitsByLimitId: {} }, { rateLimits: { ...limits, credits: null } }, { rateLimits: { ...limits, spendControlReached: null } }, { rateLimits: { ...limits, primary: null } }, { rateLimits: { ...limits, primary: { usedPercent: 99, windowDurationMins: 10080 } } }, { rateLimits: { ...limits, secondary: { usedPercent: 100, windowDurationMins: 300 } } }]) {
      expect(() => parseCodexSubscriptionStatus(account, { ...usage, ...patch })).toThrow();
    }
  });

  it.each(["initial-unavailable", "after-unavailable", "credit-decline", "client-failure"])("stops subscription calls and keeps evidence on %s", async (failure) => {
    const { repoDir, sha } = await makeTrackedFixtureRepo();
    const experiment = prepareClientAbExperiment({ repoDir, sha, fixturePath: "fixture.json" });
    const resultDir = path.join(repoDir, "results");
    const readSubscriptionStatus = vi.fn(async () => {
      const call = readSubscriptionStatus.mock.calls.length;
      if (failure === "initial-unavailable" || (failure === "after-unavailable" && call === 2)) throw new Error("usage unavailable");
      return { checkedAt: new Date().toISOString(), weeklyRemainingPercent: 80, creditBalance: failure === "credit-decline" && call === 2 ? "12.0000000000" : "12.0000000001" };
    });
    const execute = vi.fn(async () => {
      if (failure === "client-failure") throw new Error("client failed");
      return { stdout: '{"type":"turn.completed","usage":{"input_tokens":200,"cached_input_tokens":0}}\n', stderr: "", finalOutput: '{"claims":{"canonical_store":"postgres","vector_recovery":"rebuild_from_postgres"}}' };
    });
    await expect(runClientAb({ experiment, vendor: "codex", model: "codex-test", effort: "medium", resultDir, mcpServer: { command: "node", args: [] }, executePaid: false, executeSubscription: true, allowedMemoryIds: ["1"], execute, readSubscriptionStatus, getCliVersion: async () => "test" })).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(failure === "initial-unavailable" ? 0 : 1);
    expect(readSubscriptionStatus).toHaveBeenCalledTimes(failure === "initial-unavailable" ? 1 : 2);
    expect(JSON.parse(await readFile(path.join(resultDir, "codex-failure.json"), "utf8"))).toMatchObject({ status: "failed" });
    await expect(readFile(path.join(resultDir, "codex-summary.json"))).rejects.toThrow("ENOENT");
    if (failure === "credit-decline" || failure === "after-unavailable") expect(JSON.parse(await readFile(path.join(resultDir, "codex-canonical-state-r1-off.json"), "utf8"))).toMatchObject({ success: true });
  });

  it("requires both paid guards and strictly parses paid/preflight runner options", () => {
    expect(() => assertPaidClientExecutionAllowed({}, true)).toThrow("AKASHA_ALLOW_PAID_CLIENT_EVAL=1");
    expect(() => assertPaidClientExecutionAllowed({ AKASHA_ALLOW_PAID_CLIENT_EVAL: "1" }, false)).toThrow("--execute-paid");
    const sha = "a".repeat(40);
    expect(parseClientAbArgs(["--sha", sha, "--execute-subscription", "--client", "codex", "--model", "codex-test", "--effort", "medium"])).toMatchObject({ executeSubscription: true, executePaid: false });
    for (const extra of [["--execute-paid"], [], ["--effort", "medium"]]) {
      const client = extra.length === 1 ? "codex" : "claude";
      expect(() => parseClientAbArgs(["--sha", sha, "--execute-subscription", "--client", client, "--model", "test", ...extra])).toThrow();
    }
    expect(parseClientAbArgs(["--sha", sha])).toMatchObject({ executePaid: false, preflight: false });
    expect(parseClientAbArgs(["--sha", sha])).toMatchObject({ profile: "mcp-roundtrip" });
    expect(parseClientAbArgs(["--sha", sha, "--profile", "cli-prefetch"])).toMatchObject({ profile: "cli-prefetch" });
    expect(() => parseClientAbArgs(["--sha", sha, "--profile", "unknown"])).toThrow("--profile");
    expect(() => parseClientAbArgs(["--sha", sha, "--profile", "cli-prefetch", "--client", "claude"])).toThrow("Codex only");
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
    await expect(runClientAb({ experiment, vendor: "codex", model: "codex-test", resultDir, mcpServer: { command: "node", args: [] }, executePaid: true, env: { AKASHA_ALLOW_PAID_CLIENT_EVAL: "1" }, allowedMemoryIds: ["1"], execute, getCliVersion })).rejects.toThrow("EEXIST");
    expect(execute).not.toHaveBeenCalled();
    expect(getCliVersion).not.toHaveBeenCalled();
    expect(await readFile(path.join(resultDir, "codex-summary.json"), "utf8")).toBe(old);
  });

  it.each(["success", "rpc-error", "malformed", "api-auth"])("exchanges account RPC with an owned child and closes on %s", async (scenario) => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "akasha-client-ab-rpc-"));
    tempRoots.push(cwd);
    const seen: string[] = [];
    vi.stubEnv("OPENAI_API_KEY", "never-pass-api-key");
    vi.stubEnv("CODEX_API_KEY", "never-pass-api-key");
    const query = readCodexSubscriptionStatus(async (command, timeout, exchange) => {
      expect(command.env.OPENAI_API_KEY).toBeUndefined();
      expect(command.env.CODEX_API_KEY).toBeUndefined();
      expect(command.args).toEqual(expect.arrayContaining(['model_provider="openai"', 'cli_auth_credentials_store="file"', 'chatgpt_base_url="https://chatgpt.com/backend-api/"']));
      const usage = { ordinaryUsageAllowed: true, rateLimits: { limitId: "codex", primary: { usedPercent: 10, windowDurationMins: 10080 }, credits: { balance: "12.00" }, spendControlReached: false } };
      const script = `const r=require("node:readline").createInterface({input:process.stdin});r.on("line",line=>{const m=JSON.parse(line); if(!m.id)return; if(m.id===2 && ${JSON.stringify(scenario)}==="malformed"){console.log("invalid json");return;} if(m.id===2 && ${JSON.stringify(scenario)}==="rpc-error"){console.log(JSON.stringify({id:2,error:{code:1}}));return;} console.log(JSON.stringify({id:m.id,result:m.id===1?{}:m.id===2?{account:{type:${JSON.stringify(scenario === "api-auth" ? "apiKey" : "chatgpt")}},requiresOpenaiAuth:true}:${JSON.stringify(usage)}}));});`;
      seen.push(JSON.parse(command.stdin).method);
      return runClientCommand({ ...command, binary: process.execPath, args: ["-e", script], cwd }, Math.min(timeout!, 5000), (line) => {
        const reply = exchange!(line);
        if (reply) for (const request of reply.trim().split("\n")) seen.push(JSON.parse(request).method);
        return reply;
      });
    });
    if (scenario === "success") {
      await expect(query).resolves.toMatchObject({ weeklyRemainingPercent: 90, creditBalance: "12.00" });
      expect(seen).toEqual(["initialize", "initialized", "account/read", "account/rateLimits/read"]);
    } else await expect(query).rejects.toThrow();
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
