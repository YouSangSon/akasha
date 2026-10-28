import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  prepareClientAbExperiment, runClientAb, type ClientAbExperiment, type ClientAbRegistry, type PreparedClientTask,
} from "../../src/eval/client-ab.js";
import {
  captureClientAbSnapshot, clientAbSnapshotDigest, loadClientAbSnapshot, replayClientContextPack,
  validateClientAbSnapshot, type ClientAbSnapshot,
} from "../../src/eval/client-ab-snapshot.js";
import { buildContextPackResult } from "../../src/mcp/context-pack-result.js";
import { registerServiceTools } from "../../src/mcp/service-tools.js";
import { toToolResult } from "../../src/mcp/tool-result.js";
import type { ToolRegistry } from "../../src/mcp/types.js";
import type { SearchMemoryResult } from "../../src/types.js";
import { clientAbReplayMcpServer, createClientAbReplayServer } from "./client-ab-replay-server.js";
import { parseClientAbArgs, runClientAbRunner } from "./client-ab-runner.js";

vi.mock("../../src/mcp/canonical-services.js", () => ({
  bootstrapCanonicalServices: vi.fn(() => { throw new Error("DB bootstrap forbidden in snapshot replay"); }),
}));

let root: string;
let repoDir: string;
let experiment: ClientAbExperiment;
let snapshot: ClientAbSnapshot;
let registry: ReturnType<typeof fakeRegistry>;
const ci = { repository: "YouSangSon/akasha", runId: "123", runAttempt: "1", job: "default-stack", headSha: "" };
const captureConfig = { provider: "transformers", model: "fixture-model", dimensions: 384, version: "v1", chunkTargetTokens: 800, chunkOverlapTokens: 120, vectorBackend: "qdrant" } as const;

function fakeRegistry(current: ClientAbExperiment) {
  const memories = new Map<string, SearchMemoryResult>();
  let sequence = 0;
  const add_memory = vi.fn<ClientAbRegistry["add_memory"]>(async (input) => {
    const original = current.seedRecords[sequence]!;
    const id = ++sequence;
    const scopeType = original.scope;
    const scopeId = scopeType === "project" ? current.projectKey : current.userScopeId;
    const source = { id: id + 1000, organizationId: input.organizationId, scopeType, scopeId, sourceType: "document" as const, title: null, sourceRef: original.sourceRef, uri: null, createdAt: "2026-10-28T00:00:00.000Z" };
    memories.set(original.id, { id, organizationId: input.organizationId, sourceId: source.id, scopeType, scopeId, projectKey: current.projectKey, memoryType: original.kind, content: input.content, title: null, summary: null, durability: "ephemeral", importance: 0, tags: [], createdAt: source.createdAt, updatedAt: source.createdAt, source });
    return { ok: true, memoryId: String(id), summary: "seeded" };
  });
  const build_context_pack = vi.fn<ClientAbRegistry["build_context_pack"]>(async (input) => {
    const task = current.tasks.find((entry) => entry.task === input.task)!;
    return buildContextPackResult({ projectKey: input.projectKey, task: input.task, records: task.contextRecords.map((record) => memories.get(record.id)!), maxOutputBytes: input.maxOutputBytes });
  });
  return { add_memory, build_context_pack };
}

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "akasha-snapshot-test-"));
  repoDir = path.join(root, "repo");
  await mkdir(repoDir);
  const fixture = await readFile(path.join(process.cwd(), "tests/eval/fixtures/client-ab.json"), "utf8");
  await writeFile(path.join(repoDir, "fixture.json"), fixture);
  const paths = JSON.parse(fixture) as { sourcePaths: string[]; seedSourcePath: string };
  for (const sourcePath of [...paths.sourcePaths, paths.seedSourcePath]) {
    await mkdir(path.dirname(path.join(repoDir, sourcePath)), { recursive: true });
    await writeFile(path.join(repoDir, sourcePath), await readFile(path.join(process.cwd(), sourcePath)));
  }
  execFileSync("git", ["init", "--quiet"], { cwd: repoDir });
  execFileSync("git", ["-c", "user.email=eval@example.test", "-c", "user.name=Eval", "add", "."], { cwd: repoDir });
  execFileSync("git", ["-c", "user.email=eval@example.test", "-c", "user.name=Eval", "commit", "--quiet", "-m", "fixture"], { cwd: repoDir });
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).trim();
  experiment = prepareClientAbExperiment({ repoDir, sha, fixturePath: "fixture.json" });
  registry = fakeRegistry(experiment);
  snapshot = await captureClientAbSnapshot({ experiment, registry, ci: { ...ci, headSha: sha }, capture: captureConfig });
}, 20_000);

afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

function rehash(changed: ClientAbSnapshot): void {
  for (const entry of changed.captures) entry.sha256 = clientAbSnapshotDigest(JSON.stringify({ input: entry.input, result: entry.result }));
}

describe("client A/B snapshot", () => {
  it("seeds once and captures both complete production result variants on the same IDs", () => {
    expect(registry.add_memory).toHaveBeenCalledTimes(experiment.seedRecords.length);
    expect(registry.build_context_pack).toHaveBeenCalledTimes(6);
    expect(snapshot.corpusVersion).toBe(4);
    expect(experiment.tasks[2]!.task).toContain("seeded decision alpha.chunk-size");
    expect(snapshot.captures.map((entry) => entry.input.maxOutputBytes)).toEqual([undefined, undefined, undefined, 8192, 8192, 8192]);
    for (const entry of snapshot.captures) {
      expect(entry.result.selectionRationale).not.toHaveLength(0);
      expect(entry.result.sections).toHaveProperty("recent_decisions");
    }
    for (const task of experiment.tasks) {
      const pair = snapshot.captures.filter((entry) => entry.taskId === task.id);
      expect(pair[0]!.result.selectedMemoryIds).toEqual(pair[1]!.result.selectedMemoryIds);
    }
  });

  it.each([
    ["source SHA", (value: ClientAbSnapshot) => { value.sourceSha = "b".repeat(40); }],
    ["CI head", (value: ClientAbSnapshot) => { value.ci.headSha = "b".repeat(40); }],
    ["CI repository", (value: ClientAbSnapshot) => { value.ci.repository = "elsewhere/akasha"; }],
    ["old corpus", (value: ClientAbSnapshot) => { value.corpusVersion = 3; }],
    ["missing capture", (value: ClientAbSnapshot) => { value.captures.pop(); }],
    ["duplicate capture", (value: ClientAbSnapshot) => { value.captures[5] = structuredClone(value.captures[0]!); }],
    ["task", (value: ClientAbSnapshot) => { value.captures[0]!.input.task += " changed"; }],
    ["organization", (value: ClientAbSnapshot) => { value.captures[0]!.input.organizationId = "foreign"; }],
    ["extra argument", (value: ClientAbSnapshot) => { Object.assign(value.captures[0]!.input, { unexpected: true }); }],
    ["allowed scope", (value: ClientAbSnapshot) => { value.preflight.allowedMemoryIds[0] = "project:foreign:1"; }],
    ["required ID", (value: ClientAbSnapshot) => { value.preflight.tasks[0]!.requiredMemoryIds = []; }],
    ["section ID", (value: ClientAbSnapshot) => { value.captures[0]!.result.sections.recent_decisions[0]!.id = 999999; }],
    ["section organization", (value: ClientAbSnapshot) => { value.captures[0]!.result.sections.recent_decisions[0]!.organizationId = "foreign"; }],
    ["source scope", (value: ClientAbSnapshot) => { value.captures[0]!.result.sections.recent_decisions[0]!.source.scopeId = "foreign"; }],
    ["nested organization", (value: ClientAbSnapshot) => { Object.assign(value.captures[0]!.result.sections.recent_decisions[0]!.source, { metadata: { organizationId: "foreign" } }); }],
    ["rationale ID", (value: ClientAbSnapshot) => { value.captures[0]!.result.selectionRationale[0]!.recordId = 999999; }],
    ["rationale sentinel", (value: ClientAbSnapshot) => { value.captures[0]!.result.selectionRationale[0]!.sourceTitle = "ORBITAL_SENTINEL_9BCE"; }],
    ["section sentinel", (value: ClientAbSnapshot) => { value.captures[0]!.result.sections.recent_decisions[0]!.summary = "ORBITAL_SENTINEL_9BCE"; }],
    ["missing full sections", (value: ClientAbSnapshot) => { Reflect.deleteProperty(value.captures[0]!.result, "sections"); }],
    ["budget metadata", (value: ClientAbSnapshot) => { Reflect.deleteProperty(value.captures[3]!.result, "budget"); }],
    ["budget input", (value: ClientAbSnapshot) => { value.captures[3]!.input.maxOutputBytes = 8193; }],
    ["budget overflow", (value: ClientAbSnapshot) => { value.captures[3]!.result.packMarkdown += "x".repeat(8192); }],
    ["required anchor", (value: ClientAbSnapshot) => { value.captures[0]!.result.packMarkdown = "unrelated text"; }],
  ] as const)("rejects mutated %s even with recomputed capture digests", (_name, mutate) => {
    const changed = structuredClone(snapshot);
    mutate(changed);
    rehash(changed);
    expect(() => validateClientAbSnapshot(changed, experiment)).toThrow();
  });

  it("requires the operator-pinned artifact digest as well as internal content digests", async () => {
    const file = path.join(root, "trusted-snapshot.json");
    const contents = `${JSON.stringify(snapshot)}\n`;
    await writeFile(file, contents, { mode: 0o600 });
    await expect(loadClientAbSnapshot({ snapshotPath: file, snapshotSha256: "b".repeat(64), experiment })).rejects.toThrow("operator-pinned digest");
    await expect(loadClientAbSnapshot({ snapshotPath: file, snapshotSha256: clientAbSnapshotDigest(contents), experiment })).resolves.toEqual(snapshot);
    const changed = structuredClone(snapshot);
    changed.captures[0]!.result.packMarkdown += " changed";
    expect(() => validateClientAbSnapshot(changed, experiment)).toThrow("content digest");
  });

  it("validates a replay dry-run without any DB environment or bootstrap", async () => {
    const file = path.join(root, "dry-snapshot.json");
    const contents = `${JSON.stringify(snapshot)}\n`;
    await writeFile(file, contents, { mode: 0o600 });
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("QDRANT_URL", "");
    vi.stubEnv("EMBEDDING_PROVIDER", "openai");
    const args = parseClientAbArgs(["--sha", experiment.sourceSha, "--fixture", "fixture.json", "--snapshot", file, "--snapshot-sha256", clientAbSnapshotDigest(contents)]);
    await expect(runClientAbRunner(args, repoDir)).resolves.toMatchObject({ mode: "snapshot-dry-run", captureCount: 6, replay: { mode: "captured-mcp", ci: snapshot.ci } });
  });

  it.each([
    ["--snapshot", "capture.json"], ["--snapshot-sha256", "a".repeat(64)],
    ["--capture-snapshot", "capture.json"],
    ["--capture-snapshot", "capture.json", "--preflight", "--max-output-bytes", "8192"],
    ["--snapshot", "capture.json", "--snapshot-sha256", "a".repeat(64), "--preflight"],
    ["--snapshot", "capture.json", "--snapshot-sha256", "a".repeat(64), "--profile", "cli-prefetch"],
    ["--snapshot", "capture.json", "--snapshot-sha256", "a".repeat(64), "--client", "claude"],
    ["--snapshot", "capture.json", "--snapshot-sha256", "a".repeat(64), "--capture-snapshot", "other.json", "--preflight"],
    ["--snapshot", "capture.json", "--snapshot-sha256", "a".repeat(64), "--max-output-bytes", "4096"],
    ["--snapshot", "capture.json", "--snapshot-sha256", "a".repeat(64), "--client", "codex", "--model", "test", "--execute-paid"],
  ])("rejects incompatible runner flags: %j", (...flags) => {
    expect(() => parseClientAbArgs(["--sha", experiment.sourceSha, ...flags])).toThrow();
  });

  it("advertises the production tool entry, replays complete results, and rejects noncaptured known arguments", async () => {
    const server = createClientAbReplayServer(snapshot);
    const client = new Client({ name: "snapshot-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const production = new McpServer({ name: "developer-memory-os", version: "0.1.0" });
    registerServiceTools(production, { build_context_pack: vi.fn() } as unknown as ToolRegistry);
    const productionClient = new Client({ name: "production-schema-test", version: "1.0.0" });
    const [productionClientTransport, productionTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport), client.connect(clientTransport),
      production.connect(productionTransport), productionClient.connect(productionClientTransport),
    ]);
    try {
      const advertised = (await client.listTools()).tools;
      const productionEntry = (await productionClient.listTools()).tools.find((tool) => tool.name === "build_context_pack");
      expect(advertised).toEqual([productionEntry]);
      for (const entry of snapshot.captures) {
        const result = await client.callTool({ name: "build_context_pack", arguments: entry.input });
        expect(result).toEqual(toToolResult(entry.result));
        expect(JSON.stringify(result)).not.toContain("snapshotSha256");
      }
      for (const patch of [{ organizationId: "foreign" }, { task: "different" }, { includeUser: false }, { limit: 9 }, { projectKey: "other" }, { userScopeId: "other" }, { maxOutputBytes: 4096 }]) {
        const result = await client.callTool({ name: "build_context_pack", arguments: { ...snapshot.captures[0]!.input, ...patch } });
        expect(result.isError).toBe(true);
      }
      const extraInput = { ...snapshot.captures[0]!.input, extra: true };
      expect(() => replayClientContextPack(snapshot, extraInput)).toThrow("exact captured");
      // Production SDK normalization strips unknown fields; raw client traces still reject them.
      expect(await client.callTool({ name: "build_context_pack", arguments: extraInput })).toEqual(toToolResult(snapshot.captures[0]!.result));
    } finally {
      await client.close(); await server.close();
      await productionClient.close(); await production.close();
    }
    const command = clientAbReplayMcpServer({ snapshotPath: "/tmp/snapshot.json", snapshotSha256: "a".repeat(64), sha: experiment.sourceSha, fixturePath: "fixture.json" });
    expect(command.command).toBe(process.execPath);
    expect(command.args.slice(0, 2)).toEqual(["--import", import.meta.resolve("tsx")]);
    expect(command.env).toBeUndefined();
  });
});

const answers: Record<string, string> = {
  canonical_store: "postgres", vector_recovery: "rebuild_from_postgres", default_language: "korean",
  logging_rule: "never_log_raw_memory_content", source_diversity: "preserve_source_diversity", chunk_policy: "800_tokens_120_overlap",
};
function answer(task: PreparedClientTask): string {
  return JSON.stringify({ claims: Object.fromEntries(task.claimKeys.map((key) => [key, answers[key]])) });
}

describe("client raw evidence", () => {
  it("rejects extra arguments in the raw client trace after SDK normalization", async () => {
    const capture = snapshot.captures[0]!;
    await expect(runClientAb({
      experiment, vendor: "codex", model: "codex-test", effort: "max", resultDir: path.join(root, "extra-argument-run"),
      mcpServer: { command: process.execPath, args: [] }, executePaid: false, executeSubscription: true,
      allowedMemoryIds: snapshot.preflight.allowedMemoryIds,
      readSubscriptionStatus: async () => ({ checkedAt: "2026-10-28T00:00:00.000Z", weeklyRemainingPercent: 80, creditBalance: "12.00" }),
      getCliVersion: async () => "codex 0.test",
      execute: async (command) => {
        const on = command.args.some((arg) => arg.includes("mcp_servers.akasha.command="));
        const events = on ? [{ type: "item.completed", item: {
          type: "mcp_tool_call", server: "akasha", tool: "build_context_pack", status: "completed", error: null,
          arguments: { ...capture.input, extra: true }, result: { structured_content: capture.result },
        } }] : [];
        return { stdout: [...events, { type: "turn.completed", usage: { input_tokens: 200 } }].map((event) => JSON.stringify(event)).join("\n") + "\n", stderr: "", finalOutput: answer(experiment.tasks[0]!) };
      },
    })).rejects.toThrow("exact task and scope arguments");
  });

  it("retains raw completed usage, claims, and safe command manifests when the 15% gate is false", async () => {
    const resultDir = path.join(root, "evidence-run");
    const replay = { mode: "captured-mcp" as const, snapshotSha256: "a".repeat(64), ci: snapshot.ci };
    const summary = await runClientAb({
      experiment, vendor: "codex", model: "codex-test", effort: "max", resultDir,
      mcpServer: { command: process.execPath, args: ["server.ts"], env: { DATABASE_URL: "postgres://credential-must-not-be-saved" } },
      executePaid: false, executeSubscription: true, replay, allowedMemoryIds: snapshot.preflight.allowedMemoryIds,
      readSubscriptionStatus: async () => ({ checkedAt: "2026-10-28T00:00:00.000Z", weeklyRemainingPercent: 80, creditBalance: "12.00" }),
      getCliVersion: async () => "codex 0.test",
      execute: async (command) => {
        const task = experiment.tasks.find((entry) => command.stdin.includes(entry.task))!;
        const on = command.args.some((arg) => arg.includes("mcp_servers.akasha.command="));
        const input = on ? JSON.parse(command.stdin.split("\n").find((line) => line.startsWith('{"organizationId"'))!) : undefined;
        const events = on ? [{ type: "item.completed", item: { type: "mcp_tool_call", server: "akasha", tool: "build_context_pack", arguments: input, status: "completed", error: null, result: { structured_content: replayClientContextPack(snapshot, input) } } }] : [];
        return { stdout: [...events, { type: "turn.completed", usage: { input_tokens: 200, cached_input_tokens: 40 } }].map((event) => JSON.stringify(event)).join("\n") + "\n", stderr: "", finalOutput: answer(task) };
      },
    });
    expect(summary).toMatchObject({ aggregate: { passed: false, allPairsSuccessful: true, medianInputTokenReduction: 0 }, model: { requested: "codex-test", observed: null }, effort: "max", replay });
    const resultPath = path.join(resultDir, "codex-canonical-state-r1-on.json");
    const result = JSON.parse(await readFile(resultPath, "utf8"));
    const file = path.join(resultDir, result.evidencePath);
    const evidence = JSON.parse(await readFile(file, "utf8"));
    expect(evidence.stdout).toContain('"type":"turn.completed","usage":{"input_tokens":200,"cached_input_tokens":40}');
    expect(JSON.parse(evidence.finalOutput)).toEqual(JSON.parse(answer(experiment.tasks[0]!)));
    expect(evidence.manifest).toMatchObject({ binary: "codex", model: "codex-test", effort: "max", cliVersion: "codex 0.test", replay });
    expect(JSON.stringify(evidence.manifest)).not.toContain("credential-must-not-be-saved");
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    await expect(access(evidence.manifest.cwd)).rejects.toThrow();
  });

  it("retains partial raw failure events before deleting the attempt workspace", async () => {
    const resultDir = path.join(root, "failed-evidence-run");
    await expect(runClientAb({
      experiment, vendor: "codex", model: "codex-test", effort: "max", resultDir,
      mcpServer: { command: process.execPath, args: [] }, executePaid: false, executeSubscription: true,
      allowedMemoryIds: snapshot.preflight.allowedMemoryIds,
      readSubscriptionStatus: async () => ({ checkedAt: "2026-10-28T00:00:00.000Z", weeklyRemainingPercent: 80, creditBalance: "12.00" }),
      getCliVersion: async () => "codex 0.test",
      execute: async () => { throw new Error("client failed", { cause: { stdout: '{"type":"turn.failed"}\n', stderr: "fixture failure" } }); },
    })).rejects.toThrow("client failed");
    const evidence = JSON.parse(await readFile(path.join(resultDir, "codex-canonical-state-r1-off.json.private-evidence"), "utf8"));
    expect(evidence).toMatchObject({ stdout: '{"type":"turn.failed"}\n', stderr: "fixture failure" });
    await expect(access(evidence.manifest.cwd)).rejects.toThrow();
  });
});
