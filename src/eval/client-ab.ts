import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import { chunkText } from "../chunk/chunk-text.js";
import type { ToolRegistry } from "../mcp/types.js";

const FULL_SHA = /^[0-9a-f]{40}$/;
const SAFE_SOURCE_PATHS = [
  "CONTEXT.md", "CONTRACTS.md", "CONTRIBUTING.md", "DECISIONS.md", "DESIGN.md",
  "README.md", "SECURITY.md", "docs/CODEX-NAVIGATION-GUIDE.md", "docs/README.md",
  "docs/api-reference.md", "docs/architecture.md", "docs/deployment.md",
  "docs/migrations/openai-to-transformers.md", "docs/operations.md", "docs/troubleshooting.md",
] as const;
const FOREIGN_SENTINEL_MARKERS = ["orbital_sentinel_9bce"] as const;
const SHARED_PROMPT_SUFFIX = "Return exactly one JSON object matching the supplied schema. The claims object must contain exactly the requested claim keys and string values.";
const GENERIC_OUTPUT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["claims"],
  properties: { claims: { type: "object", additionalProperties: { type: "string" } } },
} as const;

const ANSWER_KEYS: Readonly<Record<string, { alternatives: readonly string[]; required: readonly string[]; contradictions: readonly string[] }>> = {
  canonical_store: { alternatives: ["postgres", "postgresql"], required: [], contradictions: ["qdrant is canonical", "qdrant is the canonical"] },
  vector_recovery: { alternatives: ["rebuild", "rebuilt", "reindex"], required: [], contradictions: ["cannot be rebuilt"] },
  default_language: { alternatives: ["korean", "한국어"], required: [], contradictions: ["english by default", "english is the default"] },
  logging_rule: { alternatives: ["never log", "do not log"], required: [], contradictions: ["raw memory content may be logged"] },
  source_diversity: { alternatives: ["source diversity"], required: [], contradictions: ["one noisy document may crowd out"] },
  chunk_policy: { alternatives: ["800 tokens"], required: ["120-token overlap"], contradictions: ["no overlap"] },
};
const ANSWER_CHOICES: Readonly<Record<string, { expected: string; choices: string[] }>> = {
  canonical_store: { expected: "postgres", choices: ["filesystem", "postgres", "qdrant"] },
  vector_recovery: { expected: "rebuild_from_postgres", choices: ["discard_memory", "rebuild_from_postgres", "restore_vectors_only"] },
  default_language: { expected: "korean", choices: ["english", "japanese", "korean"] },
  logging_rule: { expected: "never_log_raw_memory_content", choices: ["log_full_content", "never_log_raw_memory_content", "redact_after_logging"] },
  source_diversity: { expected: "preserve_source_diversity", choices: ["one_source_only", "preserve_source_diversity", "unrestricted_source_dominance"] },
  chunk_policy: { expected: "800_tokens_120_overlap", choices: ["320_tokens_no_overlap", "800_tokens_120_overlap", "800_tokens_no_overlap"] },
};
const TASK_SEED_REQUIREMENTS: Readonly<Record<string, readonly string[]>> = {
  "canonical-state": ["alpha.canonical-pg"],
  "operator-preferences": ["alice.korean-default", "alpha.no-content-logging"],
  "context-quality": ["alpha.context-pack-diversity", "alpha.chunk-size"],
};

export type ClientVendor = "codex" | "claude";
export type ClientCondition = "off" | "on";
type FixtureTask = { id: string; task: string; claimKeys: string[] };
type Fixture = {
  version: number; corpusVersion: number; organizationId: string; foreignOrganizationId: string;
  projectKey: string; userScopeId: string; rawCorpusTokenCap: number; sourcePaths: string[];
  seedSourcePath: string; chunking: { targetTokens: number; overlapTokens: number };
  foreignSentinel: { id: string; content: string }; tasks: FixtureTask[];
};
export type PreparedClientRecord = {
  id: string; scope: "project" | "user"; kind: "decision" | "fact" | "summary"; content: string; sourceRef: string; organizationId: string;
  chunks: readonly string[]; seedKey?: string;
};
export type PreparedClientTask = FixtureTask & { contextRecords: readonly PreparedClientRecord[] };
export type ClientAbExperiment = {
  sourceSha: string; corpusVersion: number; organizationId: string; foreignOrganizationId: string;
  projectKey: string; userScopeId: string; targetRecords: readonly PreparedClientRecord[];
  seedRecords: readonly PreparedClientRecord[]; tasks: readonly PreparedClientTask[];
  rawCanonicalContext: string; sharedPromptSuffix: string;
};
export type ToolCall = { server: string; name: string; arguments?: unknown; succeeded?: boolean; selectedMemoryIds?: string[] };
export type ClientUsage = { inputTokens: number; cachedInputTokens: number; toolCalls: ToolCall[] };
export type ClaudeStreamResult = ClientUsage & { structuredOutput: unknown; observedModel: string };
export type ClientWorkspace = { rootDir: string; cwd: string; schemaPath: string };
export type ClientPair = {
  vendor: ClientVendor; taskId: string; repeat: number;
  off: { success: boolean; inputTokens: number }; on: { success: boolean; inputTokens: number };
};
export type ClientPairSummary = {
  vendor: ClientVendor; pairCount: number; allPairsSuccessful: boolean;
  medianInputTokenReduction: number; passed: boolean;
};
export type ClientAbRegistry = Pick<ToolRegistry, "add_memory" | "build_context_pack">;
export type ClientAbPreflightTask = {
  taskId: string; selectedMemoryIds: string[]; requiredMemoryIds: string[];
  rawInputWordEstimate: number; contextPackWordEstimate: number; foreignLeakageCount: number;
};
export type ClientAbPreflight = {
  sourceSha: string; corpusVersion: number; seededRecordCount: number;
  rawCanonicalWordEstimate: number; foreignLeakageCount: number; allowedMemoryIds: string[];
  tasks: ClientAbPreflightTask[];
};
export type ClientConditionResult = {
  vendor: ClientVendor; taskId: string; repeat: number; condition: ClientCondition;
  runIndex: number; success: boolean; inputTokens: number; cachedInputTokens: number;
  toolCalls: ToolCall[]; grade: ReturnType<typeof gradeClientAnswer>;
  model: { requested: string; observed: string | null }; cliVersion: string;
};
export type ClientAbRunSummary = {
  vendor: ClientVendor; sourceSha: string; corpusVersion: number; cliVersion: string;
  model: { requested: string; observed: string | null }; pairs: ClientPair[];
  aggregate: ClientPairSummary;
  totals: { offInputTokens: number; onInputTokens: number; offCachedInputTokens: number; onCachedInputTokens: number };
};
export type ClientExecutor = (command: ClientCommand) => Promise<{ stdout: string; stderr: string; finalOutput?: string }>;
export type ClientAbRunInput = {
  experiment: ClientAbExperiment; vendor: ClientVendor; model: string; resultDir: string;
  mcpServer: LiveMcpServer; executePaid: boolean; allowedMemoryIds: readonly string[]; env?: NodeJS.ProcessEnv;
  effort?: string; maxBudgetUsd?: number;
  execute?: ClientExecutor; getCliVersion?: (binary: string) => Promise<string>;
};

function object(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`);
}
function text(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-blank string`);
}
function positive(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive safe integer`);
}
function nonNegative(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative safe integer`);
}
function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
}
function trackedPath(value: string, name: string): void {
  text(value, name);
  if (path.posix.isAbsolute(value) || value.split("/").includes("..")) throw new Error(`${name} must be a tracked relative path`);
}
function git(repoDir: string, args: readonly string[]): string {
  try {
    return execFileSync("git", [...args], { cwd: repoDir, encoding: "utf8", maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch (_error: unknown) {
    throw new Error("client A/B evaluation could not inspect the fixed repository SHA");
  }
}
function gitHasTrackedChanges(repoDir: string, args: readonly string[]): boolean {
  try {
    execFileSync("git", [...args], { cwd: repoDir, stdio: "ignore" });
    return false;
  } catch (error: unknown) {
    if ((error as { status?: unknown }).status === 1) return true;
    throw new Error("client A/B evaluation could not inspect tracked repository changes");
  }
}
function readTracked(repoDir: string, sha: string, sourcePath: string): string {
  trackedPath(sourcePath, "client A/B source path");
  return git(repoDir, ["show", `${sha}:${sourcePath}`]);
}

function parseFixture(value: unknown): Fixture {
  object(value, "client A/B fixture");
  const names = ["organizationId", "foreignOrganizationId", "projectKey", "userScopeId", "seedSourcePath"] as const;
  const scalars = {} as Record<(typeof names)[number], string>;
  for (const name of names) {
    const candidate = value[name];
    text(candidate, `client A/B fixture ${name}`);
    scalars[name] = candidate;
  }
  trackedPath(scalars.seedSourcePath, "client A/B fixture seedSourcePath");
  positive(value.version, "client A/B fixture version");
  positive(value.corpusVersion, "client A/B fixture corpusVersion");
  positive(value.rawCorpusTokenCap, "client A/B fixture rawCorpusTokenCap");
  object(value.chunking, "client A/B fixture chunking");
  positive(value.chunking.targetTokens, "client A/B fixture chunking.targetTokens");
  nonNegative(value.chunking.overlapTokens, "client A/B fixture chunking.overlapTokens");
  if (value.chunking.overlapTokens >= value.chunking.targetTokens) throw new Error("client A/B fixture overlapTokens must be smaller than targetTokens");
  if (!Array.isArray(value.sourcePaths) || !value.sourcePaths.every((item) => typeof item === "string") || value.sourcePaths.join("\n") !== [...SAFE_SOURCE_PATHS].join("\n")) {
    throw new Error("client A/B fixture sourcePaths must equal the sorted safe source allowlist");
  }
  if (!Array.isArray(value.tasks) || value.tasks.length !== 3) throw new Error("client A/B fixture must define exactly three tasks");
  object(value.foreignSentinel, "client A/B fixture foreignSentinel");
  const foreignId = value.foreignSentinel.id;
  const foreignContent = value.foreignSentinel.content;
  text(foreignId, "client A/B fixture foreignSentinel.id");
  text(foreignContent, "client A/B fixture foreignSentinel.content");
  const ids = new Set<string>();
  const tasks = value.tasks.map((candidate, index): FixtureTask => {
    object(candidate, `client A/B fixture tasks[${index}]`);
    const id = candidate.id;
    const task = candidate.task;
    text(id, `client A/B fixture tasks[${index}].id`);
    text(task, `client A/B fixture tasks[${index}].task`);
    if (ids.has(id) || TASK_SEED_REQUIREMENTS[id] === undefined) throw new Error(`client A/B fixture tasks[${index}] must use a unique supported task id`);
    ids.add(id);
    if (!Array.isArray(candidate.claimKeys) || candidate.claimKeys.length === 0 || !candidate.claimKeys.every((key) => typeof key === "string" && key.trim()) || new Set(candidate.claimKeys).size !== candidate.claimKeys.length || candidate.claimKeys.some((key) => ANSWER_KEYS[key] === undefined)) {
      throw new Error(`client A/B fixture tasks[${index}] has unsupported or repeated claim keys`);
    }
    return { id, task, claimKeys: [...candidate.claimKeys] };
  });
  if (ids.size !== Object.keys(TASK_SEED_REQUIREMENTS).length) throw new Error("client A/B fixture must cover every fixed task");
  return {
    version: value.version, corpusVersion: value.corpusVersion, organizationId: scalars.organizationId,
    foreignOrganizationId: scalars.foreignOrganizationId, projectKey: scalars.projectKey, userScopeId: scalars.userScopeId,
    rawCorpusTokenCap: value.rawCorpusTokenCap, sourcePaths: [...value.sourcePaths], seedSourcePath: scalars.seedSourcePath,
    chunking: { targetTokens: value.chunking.targetTokens, overlapTokens: value.chunking.overlapTokens },
    foreignSentinel: { id: foreignId, content: foreignContent }, tasks,
  };
}

function parseSeeds(source: string): Array<{ seedKey: string; scope: "project" | "user"; kind: PreparedClientRecord["kind"]; content: string }> {
  const output: Array<{ seedKey: string; scope: "project" | "user"; kind: PreparedClientRecord["kind"]; content: string }> = [];
  const pattern = /seedKey:\s*"([^"\\]+)"[\s\S]*?scopeType:\s*"(project|user)"[\s\S]*?memoryType:\s*"(decision|fact|summary)"[\s\S]*?content:\s*\n\s*"((?:[^"\\]|\\.)*)"/g;
  for (const match of source.matchAll(pattern)) {
    const seedKey = match[1];
    const scope = match[2];
    const kind = match[3];
    const encoded = match[4];
    if (seedKey === undefined || encoded === undefined || (scope !== "project" && scope !== "user") || (kind !== "decision" && kind !== "fact" && kind !== "summary")) throw new Error("client A/B seed source contains an invalid entry");
    let content: unknown;
    try { content = JSON.parse(`"${encoded}"`); } catch (_error: unknown) { throw new Error(`client A/B seed ${seedKey} has invalid string content`); }
    text(content, `client A/B seed ${seedKey} content`);
    output.push({ seedKey, scope, kind, content });
  }
  if (output.length !== 14 || new Set(output.map((entry) => entry.seedKey)).size !== 14) throw new Error("client A/B must use exactly 14 tracked SEED_ENTRIES");
  return output;
}
function makeRecord(input: Omit<PreparedClientRecord, "chunks">, chunking: Fixture["chunking"]): PreparedClientRecord {
  const chunks = chunkText({ text: input.content, ...chunking }).map((chunk) => chunk.content);
  if (chunks.length === 0) throw new Error(`client A/B record ${input.id} produced no deterministic chunks`);
  return { ...input, chunks };
}
function documentRecords(repoDir: string, sha: string, fixture: Fixture): PreparedClientRecord[] {
  const records: PreparedClientRecord[] = [];
  for (const sourcePath of fixture.sourcePaths) {
    const chunks = chunkText({ text: readTracked(repoDir, sha, sourcePath), ...fixture.chunking });
    if (chunks.length === 0) throw new Error(`client A/B tracked source ${sourcePath} produced no chunks`);
    for (const chunk of chunks) {
      records.push(makeRecord({
        id: `doc:${sourcePath}:${chunk.chunkIndex}`, scope: "project", kind: "fact", content: chunk.content,
        sourceRef: `${sourcePath}#chunk-${chunk.chunkIndex}`, organizationId: fixture.organizationId,
      }, fixture.chunking));
    }
  }
  return records;
}
function seedRecords(repoDir: string, sha: string, fixture: Fixture): PreparedClientRecord[] {
  return parseSeeds(readTracked(repoDir, sha, fixture.seedSourcePath)).map((entry) => makeRecord({
    id: `seed:${entry.seedKey}`, seedKey: entry.seedKey, scope: entry.scope, kind: entry.kind, content: entry.content,
    sourceRef: fixture.seedSourcePath, organizationId: fixture.organizationId,
  }, fixture.chunking));
}
function assertContextSelection(task: FixtureTask, records: readonly PreparedClientRecord[], target: readonly PreparedClientRecord[]): void {
  const expected = TASK_SEED_REQUIREMENTS[task.id];
  if (expected === undefined || records.length !== expected.length || records.length >= target.length || records.some((record, index) => record.seedKey !== expected[index])) {
    throw new Error(`client A/B on condition for ${task.id} must be a proper exact-seed subset`);
  }
  const context = normalize(records.map((record) => record.content).join("\n"));
  for (const key of task.claimKeys) {
    const rule = ANSWER_KEYS[key];
    if (rule === undefined || !rule.alternatives.some((literal) => context.includes(normalize(literal))) || !rule.required.every((literal) => context.includes(normalize(literal)))) throw new Error(`client A/B context selection for ${task.id} is missing required anchor ${key}`);
  }
}

export function prepareClientAbExperiment(input: { repoDir: string; sha: string; fixturePath: string }): ClientAbExperiment {
  text(input.repoDir, "repoDir");
  if (!FULL_SHA.test(input.sha)) throw new Error("client A/B evaluation SHA must be a full lowercase 40-character SHA");
  if (git(input.repoDir, ["rev-parse", "HEAD"]).trim() !== input.sha) throw new Error("client A/B evaluation SHA must match HEAD exactly");
  if (gitHasTrackedChanges(input.repoDir, ["diff", "--quiet", "--no-ext-diff", "--"]) || gitHasTrackedChanges(input.repoDir, ["diff", "--cached", "--quiet", "--no-ext-diff", "--"])) throw new Error("client A/B evaluation refuses tracked staged or unstaged changes");
  let fixtureValue: unknown;
  try { fixtureValue = JSON.parse(readTracked(input.repoDir, input.sha, input.fixturePath)); } catch (_error: unknown) { throw new Error("client A/B fixture must be valid JSON at the pinned SHA"); }
  const fixture = parseFixture(fixtureValue);
  const targetRecords = [...documentRecords(input.repoDir, input.sha, fixture), ...seedRecords(input.repoDir, input.sha, fixture)];
  const rawTokenCount = targetRecords.reduce((sum, record) => sum + (record.content.match(/\S+/g)?.length ?? 0), 0);
  if (rawTokenCount > fixture.rawCorpusTokenCap) throw new Error(`client A/B corpus exceeds its versioned ${fixture.rawCorpusTokenCap}-token cap`);
  const rawCanonicalContext = targetRecords.map((record) => record.content).join("\n\n");
  if (FOREIGN_SENTINEL_MARKERS.some((marker) => normalize(rawCanonicalContext).includes(marker))) throw new Error("client A/B foreign sentinel leaked into the target canonical context");
  const bySeed = new Map(targetRecords.flatMap((record) => record.seedKey === undefined ? [] : [[record.seedKey, record] as const]));
  const tasks = fixture.tasks.map((task): PreparedClientTask => {
    const contextRecords = TASK_SEED_REQUIREMENTS[task.id]!.map((key) => {
      const record = bySeed.get(key);
      if (record === undefined) throw new Error(`client A/B task ${task.id} is missing required tracked seed ${key}`);
      return record;
    });
    assertContextSelection(task, contextRecords, targetRecords);
    return { ...task, contextRecords };
  });
  const foreignRecord = makeRecord({
    id: fixture.foreignSentinel.id, scope: "project", kind: "fact", content: fixture.foreignSentinel.content,
    sourceRef: "foreign-sentinel", organizationId: fixture.foreignOrganizationId,
  }, fixture.chunking);
  return {
    sourceSha: input.sha, corpusVersion: fixture.corpusVersion, organizationId: fixture.organizationId,
    foreignOrganizationId: fixture.foreignOrganizationId, projectKey: fixture.projectKey, userScopeId: fixture.userScopeId,
    targetRecords, seedRecords: [...targetRecords, foreignRecord], tasks, rawCanonicalContext, sharedPromptSuffix: SHARED_PROMPT_SUFFIX,
  };
}

export type ClientPromptScope = Pick<ClientAbExperiment, "organizationId" | "projectKey" | "userScopeId">;
export function buildClientPrompt(
  task: Pick<PreparedClientTask, "task" | "claimKeys">,
  condition: ClientCondition,
  options: { rawCanonicalContext?: string; scope?: ClientPromptScope } = {},
): string {
  const prefix = `Task:\n${task.task}\n\nRequired claims (choose one exact value per key):\n${task.claimKeys.map((key) => `- ${key}: ${ANSWER_CHOICES[key]!.choices.join(" | ")}`).join("\n")}\n\n`;
  if (condition === "on") {
    const scope = options.scope;
    if (scope === undefined) throw new Error("client A/B on prompt requires its exact Akasha scope");
    return `${prefix}Use the Akasha MCP server. Call build_context_pack exactly once before answering, with exactly this JSON input and no other tool calls:\n${JSON.stringify({ organizationId: scope.organizationId, projectKey: scope.projectKey, task: task.task, userScopeId: scope.userScopeId, includeUser: true, limit: 10 })}\n\n${SHARED_PROMPT_SUFFIX}`;
  }
  text(options.rawCanonicalContext, "rawCanonicalContext");
  return `${prefix}Raw canonical context:\n${options.rawCanonicalContext}\n\n${SHARED_PROMPT_SUFFIX}`;
}
export async function createClientWorkspace(): Promise<ClientWorkspace> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "akasha-client-ab-"));
  const cwd = path.join(rootDir, "client");
  const schemaPath = path.join(cwd, "result.schema.json");
  await mkdir(cwd);
  await writeFile(schemaPath, `${JSON.stringify(GENERIC_OUTPUT_SCHEMA)}\n`, { mode: 0o600 });
  return { rootDir, cwd, schemaPath };
}
export function verifyToolTrace(condition: ClientCondition, toolCalls: readonly ToolCall[], expectedArguments?: Record<string, unknown>, allowedMemoryIds: readonly string[] = []): void {
  if (condition === "off") {
    if (toolCalls.length !== 0) throw new Error("client A/B off condition must not make tool calls");
    return;
  }
  if (toolCalls.length !== 1 || toolCalls[0]?.server !== "akasha" || toolCalls[0]?.name !== "build_context_pack") throw new Error("client A/B on condition requires exactly one Akasha build_context_pack call");
  if (expectedArguments === undefined || !isDeepStrictEqual(toolCalls[0].arguments, expectedArguments)) throw new Error("client A/B tool call must use the exact task and scope arguments");
  if (toolCalls[0].succeeded !== true) throw new Error("client A/B tool call must return a successful nonempty context pack");
  if (!toolCalls[0].selectedMemoryIds?.length || toolCalls[0].selectedMemoryIds.some((id) => !allowedMemoryIds.includes(id))) throw new Error("client A/B context pack selected records outside the preflight target scope");
}
function contextPackMemoryIds(value: unknown): string[] | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const result = value as Record<string, unknown>;
  if (result.ok !== true || typeof result.packMarkdown !== "string" || !result.packMarkdown.trim() ||
      FOREIGN_SENTINEL_MARKERS.some((marker) => normalize(result.packMarkdown as string).includes(marker)) ||
      !Array.isArray(result.selectedMemoryIds) || result.selectedMemoryIds.length === 0 ||
      !result.selectedMemoryIds.every((id) => typeof id === "string" && id.trim())) return undefined;
  return result.selectedMemoryIds;
}
function textResultMemoryIds(content: unknown): string[] | undefined {
  const textContent = typeof content === "string" ? content : Array.isArray(content)
    ? content.filter((block) => typeof block === "object" && block !== null && block.type === "text").map((block) => block.text).join("\n") : "";
  try { return contextPackMemoryIds(JSON.parse(textContent)); } catch (_error: unknown) { return undefined; }
}
function jsonLines(value: string, label: string): Record<string, unknown>[] {
  const lines = value.split("\n").filter((line) => line.trim());
  if (lines.length === 0) throw new Error(`${label} emitted no JSON events`);
  return lines.map((line, index) => {
    try {
      const parsed: unknown = JSON.parse(line);
      object(parsed, `${label} event ${index}`);
      return parsed;
    } catch (_error: unknown) {
      throw new Error(`${label} event ${index} must be a JSON object`);
    }
  });
}
function usage(value: unknown, label: string, includesCachedInput: boolean): Pick<ClientUsage, "inputTokens" | "cachedInputTokens"> {
  object(value, `${label} usage`);
  nonNegative(value.input_tokens, `${label} usage.input_tokens`);
  const created = value.cache_creation_input_tokens ?? 0;
  const read = value.cache_read_input_tokens ?? value.cached_input_tokens ?? 0;
  nonNegative(created, `${label} usage.cache_creation_input_tokens`);
  nonNegative(read, `${label} usage.cache_read_input_tokens`);
  return includesCachedInput ? { inputTokens: value.input_tokens, cachedInputTokens: read } : { inputTokens: value.input_tokens + created + read, cachedInputTokens: created + read };
}
export function parseCodexEvents(value: string): ClientUsage {
  const events = jsonLines(value, "Codex");
  if (events.some((event) => event.type === "turn.failed" || event.type === "error" || event.error != null)) {
    throw new Error("Codex emitted a failed turn or top-level error");
  }
  const completed = events.filter((event) => event.type === "turn.completed");
  if (completed.length !== 1) throw new Error("Codex must emit exactly one turn.completed event");
  const toolCalls = events.flatMap<ToolCall>((event) => {
    if (event.type !== "item.completed") return [];
    object(event.item, "Codex item.completed item");
    if (event.item.type === "mcp_tool_call") {
      if (event.item.status !== "completed" || event.item.error != null) throw new Error("Codex MCP tool call did not complete successfully");
      const result = event.item.result;
      object(result, "Codex MCP result");
      const selectedMemoryIds = result.structured_content != null ? contextPackMemoryIds(result.structured_content) : textResultMemoryIds(result.content);
      return [{
        arguments: event.item.arguments,
        succeeded: result.isError !== true && selectedMemoryIds !== undefined,
        selectedMemoryIds,
        server: typeof event.item.server === "string" ? event.item.server : typeof event.item.server_name === "string" ? event.item.server_name : "builtin",
        name: typeof event.item.tool === "string" ? event.item.tool : typeof event.item.name === "string" ? event.item.name : "unknown",
      }];
    }
    if (!["command_execution", "file_change", "web_search", "collab_tool_call", "function_call", "tool_call"].includes(String(event.item.type))) return [];
    return [{
      server: "builtin",
      name: String(event.item.type),
    }];
  });
  return { ...usage(completed[0]!.usage, "Codex", true), toolCalls };
}
export function parseCodexFinalOutput(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (_error: unknown) {
    throw new Error("Codex must leave structured final JSON");
  }
  object(parsed, "Codex structured final JSON");
  object(parsed.claims, "Codex structured final claims object");
  return parsed;
}
export function parseClaudeStream(value: string, expectedModel: string): ClaudeStreamResult {
  text(expectedModel, "expectedModel");
  const events = jsonLines(value, "Claude");
  if (events.some((event) => event.type === "error")) throw new Error("Claude emitted a top-level error event");
  const results = events.filter((event) => event.type === "result");
  if (results.length !== 1) throw new Error("Claude must emit exactly one result event");
  const result = results[0]!;
  if (result.subtype !== "success" || result.is_error !== false) throw new Error("Claude result must explicitly report subtype=success and is_error=false");
  object(result.modelUsage, "Claude result modelUsage");
  const observedModels = Object.keys(result.modelUsage);
  if (observedModels.length !== 1 || observedModels[0] !== expectedModel) throw new Error("Claude modelUsage must contain only the requested model; fallback results are not accepted");
  if (result.structured_output === undefined) throw new Error("Claude result must contain structured_output");
  const toolCalls = events.flatMap<ToolCall>((event) => {
    if (event.type !== "assistant") return [];
    object(event.message, "Claude assistant message");
    if (!Array.isArray(event.message.content)) throw new Error("Claude assistant message content must be an array");
    return event.message.content.flatMap((block) => {
      object(block, "Claude assistant content block");
      if (block.type !== "tool_use") return [];
      text(block.name, "Claude tool_use name");
      const prefix = "mcp__akasha__";
      text(block.id, "Claude tool_use id");
      const matching = events.flatMap((candidate) => {
        if (candidate.type !== "user" && candidate.type !== "assistant") return [];
        object(candidate.message, "Claude tool-result message");
        return Array.isArray(candidate.message.content) ? candidate.message.content.filter((item) => typeof item === "object" && item !== null && item.type === "tool_result" && item.tool_use_id === block.id) : [];
      });
      const selectedMemoryIds = matching.length === 1 && matching[0].is_error !== true ? textResultMemoryIds(matching[0].content) : undefined;
      return [{
        server: block.name.startsWith(prefix) ? "akasha" : "builtin",
        name: block.name.startsWith(prefix) ? block.name.slice(prefix.length) : block.name,
        arguments: block.input,
        succeeded: selectedMemoryIds !== undefined,
        selectedMemoryIds,
      }];
    });
  });
  return { ...usage(result.usage, "Claude", false), toolCalls, structuredOutput: result.structured_output, observedModel: observedModels[0]! };
}
export function gradeClientAnswer(task: Pick<PreparedClientTask, "claimKeys"> & { id?: string }, rawOutput: string): { success: boolean; omissions: string[]; contradictions: string[]; leakage: string[] } {
  let parsed: unknown;
  try { parsed = JSON.parse(rawOutput); } catch (_error: unknown) { return { success: false, omissions: [...task.claimKeys], contradictions: [], leakage: [] }; }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { success: false, omissions: [...task.claimKeys], contradictions: [], leakage: [] };
  const claims = (parsed as Record<string, unknown>).claims;
  if (typeof claims !== "object" || claims === null || Array.isArray(claims)) return { success: false, omissions: [...task.claimKeys], contradictions: [], leakage: [] };
  const claimObject = claims as Record<string, unknown>;
  const exactKeys = Object.keys(claimObject).sort().join("\n") === [...task.claimKeys].sort().join("\n");
  const output = normalize(JSON.stringify(parsed));
  const leakage = FOREIGN_SENTINEL_MARKERS.filter((marker) => output.includes(marker)).map(() => "foreign-sentinel");
  const omissions: string[] = [];
  const contradictions: string[] = [];
  for (const key of task.claimKeys) {
    const expected = ANSWER_CHOICES[key]?.expected;
    const claim = claimObject[key];
    const normalizedClaim = typeof claim === "string" ? normalize(claim) : "";
    if (!normalizedClaim) omissions.push(key);
    else if (expected === undefined || normalizedClaim !== expected) contradictions.push(key);
  }
  return { success: exactKeys && omissions.length === 0 && contradictions.length === 0 && leakage.length === 0, omissions, contradictions, leakage };
}
export function aggregateClientPairs(vendor: ClientVendor, pairs: readonly ClientPair[]): ClientPairSummary {
  if (pairs.some((pair) => pair.vendor !== vendor)) throw new Error(`${vendor} A/B evaluation must not mix vendors`);
  if (pairs.length !== 9) throw new Error(`${vendor} A/B evaluation requires exactly nine paired runs`);
  const seen = new Set<string>();
  const tasks = new Map<string, number>();
  const reductions: number[] = [];
  let allPairsSuccessful = true;
  for (const pair of pairs) {
    text(pair.taskId, "client A/B pair taskId");
    positive(pair.repeat, "client A/B pair repeat");
    nonNegative(pair.off.inputTokens, "client A/B off inputTokens");
    nonNegative(pair.on.inputTokens, "client A/B on inputTokens");
    if (pair.off.inputTokens === 0) throw new Error("client A/B off inputTokens must be greater than zero");
    const key = `${pair.taskId}:${pair.repeat}`;
    if (seen.has(key)) throw new Error(`client A/B evaluation repeats pair ${key}`);
    seen.add(key);
    tasks.set(pair.taskId, (tasks.get(pair.taskId) ?? 0) + 1);
    allPairsSuccessful &&= pair.off.success && pair.on.success;
    reductions.push((pair.off.inputTokens - pair.on.inputTokens) / pair.off.inputTokens);
  }
  if (tasks.size !== 3 || [...tasks.values()].some((count) => count !== 3)) throw new Error(`${vendor} A/B evaluation requires three tasks with three repeats each`);
  reductions.sort((left, right) => left - right);
  const medianInputTokenReduction = reductions[4]!;
  return { vendor, pairCount: 9, allPairsSuccessful, medianInputTokenReduction, passed: allPairsSuccessful && medianInputTokenReduction >= 0.15 };
}

export type LiveMcpServer = { command: string; args: readonly string[]; env?: Record<string, string> };
export type ClientCommand = { binary: string; args: string[]; env: NodeJS.ProcessEnv; cwd: string; stdin: string; finalOutputPath: string };
function clientEnvironment(vendor: ClientVendor): NodeJS.ProcessEnv {
  const auth = vendor === "codex"
    ? { OPENAI_API_KEY: process.env.OPENAI_API_KEY, CODEX_API_KEY: process.env.CODEX_API_KEY, CODEX_HOME: process.env.CODEX_HOME }
    : { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
  return { PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG, LC_ALL: process.env.LC_ALL, NO_COLOR: "1", ...auth };
}
function mcpConfigOverrides(server: LiveMcpServer): string[] {
  const overrides = [
    `mcp_servers.akasha.command=${JSON.stringify(server.command)}`,
    `mcp_servers.akasha.args=${JSON.stringify(server.args)}`,
  ];
  for (const [name, value] of Object.entries(server.env ?? {})) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error("client A/B MCP environment name is invalid");
    overrides.push(`mcp_servers.akasha.env.${name}=${JSON.stringify(value)}`);
  }
  return overrides;
}
export async function buildClientCommand(input: { vendor: ClientVendor; condition: ClientCondition; workspace: ClientWorkspace; prompt: string; expectedModel: string; effort?: string; maxBudgetUsd?: number; mcpServer?: LiveMcpServer }): Promise<ClientCommand> {
  text(input.expectedModel, "expectedModel");
  if (input.condition === "on" && input.mcpServer === undefined) throw new Error("client A/B on condition requires an Akasha MCP server configuration");
  const finalOutputPath = path.join(input.workspace.cwd, "final-output.json");
  const mcpServer = input.condition === "on" ? input.mcpServer : undefined;
  if (input.vendor === "codex") {
    const args = ["exec", "--ephemeral", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules", "--sandbox", "read-only", "--json", "--model", input.expectedModel, "--output-schema", input.workspace.schemaPath, "--output-last-message", finalOutputPath];
    if (input.effort !== undefined) args.push("-c", `model_reasoning_effort=${JSON.stringify(input.effort)}`);
    if (mcpServer !== undefined) {
      for (const override of mcpConfigOverrides(mcpServer)) args.push("-c", override);
    }
    args.push("--");
    return { binary: "codex", args, env: clientEnvironment("codex"), cwd: input.workspace.cwd, stdin: input.prompt, finalOutputPath };
  }
  const maxBudget = input.maxBudgetUsd ?? 0.20;
  if (!Number.isFinite(maxBudget) || maxBudget <= 0 || maxBudget > 0.20) throw new Error("Claude client A/B budget must be a positive amount no greater than USD 0.20");
  const args = ["--print", "--bare", "--restricted", "--permission-mode", "dontAsk", "--strict-mcp-config", "--no-session-persistence", "--verbose", "--output-format", "stream-json", "--json-schema", JSON.stringify(GENERIC_OUTPUT_SCHEMA), "--max-budget-usd", String(maxBudget), "--model", input.expectedModel, "--tools", ""];
  if (input.effort !== undefined) args.push("--effort", input.effort);
  if (mcpServer === undefined) {
    args.push("--tools", "");
  } else {
    const configPath = path.join(input.workspace.rootDir, "claude-mcp.json");
    await writeFile(configPath, `${JSON.stringify({ mcpServers: { akasha: mcpServer } })}\n`, { mode: 0o600 });
    args.push("--mcp-config", configPath, "--allowedTools", "mcp__akasha__build_context_pack");
  }
  return { binary: "claude", args, env: clientEnvironment("claude"), cwd: input.workspace.cwd, stdin: input.prompt, finalOutputPath };
}
function signalOwnedChild(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  if (process.platform !== "win32") {
    try { process.kill(-child.pid, signal); return; } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
  child.kill(signal);
}
export async function runClientCommand(command: ClientCommand, timeoutMs = 120_000): Promise<{ stdout: string; stderr: string }> {
  positive(timeoutMs, "client A/B timeoutMs");
  return await new Promise((resolve, reject) => {
    const child = spawn(command.binary, command.args, { cwd: command.cwd, env: command.env, shell: false, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let stopped: Error | undefined;
    let escalation: ReturnType<typeof setTimeout> | undefined;
    const stop = (reason: string) => {
      if (stopped) return;
      stopped = new Error(reason);
      signalOwnedChild(child, "SIGTERM");
      escalation = setTimeout(() => signalOwnedChild(child, "SIGKILL"), 2000);
    };
    const onInterrupt = () => stop("client A/B client command interrupted");
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, onInterrupt);
    const timer = setTimeout(() => stop("client A/B client command timed out"), timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(escalation);
      for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.removeListener(signal, onInterrupt);
    };
    child.stdin.on("error", () => stop("client A/B client stdin failed"));
    child.stdin.end(command.stdin);
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.once("error", (error) => { stopped = error; });
    child.once("close", (code) => {
      // The parent may exit before detached descendants close their own streams.
      signalOwnedChild(child, "SIGKILL");
      cleanup();
      if (stopped) { reject(stopped); return; }
      if (code !== 0) { reject(new Error(`client A/B client command failed with exit code ${code ?? "signal"}`)); return; }
      resolve({ stdout, stderr });
    });
  });
}
export async function writeResultAtomically(destination: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  await rename(temporary, destination);
}
export function assertPaidClientExecutionAllowed(env: NodeJS.ProcessEnv, executePaid: boolean): void {
  if (!executePaid || env.AKASHA_ALLOW_PAID_CLIENT_EVAL !== "1") throw new Error("paid client evaluation requires AKASHA_ALLOW_PAID_CLIENT_EVAL=1 and --execute-paid");
}
function wordEstimate(value: string): number {
  return value.match(/\S+/g)?.length ?? 0;
}
function preflightInput(experiment: ClientAbExperiment, task: PreparedClientTask) {
  return {
    organizationId: experiment.organizationId,
    projectKey: experiment.projectKey,
    task: task.task,
    userScopeId: experiment.userScopeId,
    includeUser: true,
    limit: 10,
  };
}
export async function seedAndPreflightClientAb(input: {
  experiment: ClientAbExperiment; registry: ClientAbRegistry; resultPath?: string;
}): Promise<ClientAbPreflight> {
  const memoryIds = new Map<string, string>();
  try {
    for (const record of input.experiment.seedRecords) {
      const seeded = await input.registry.add_memory({
        organizationId: record.organizationId,
        projectKey: input.experiment.projectKey,
        scope: record.scope,
        userScopeId: record.scope === "user" ? input.experiment.userScopeId : undefined,
        kind: record.kind,
        content: record.content,
      });
      const scopeId = record.scope === "project" ? input.experiment.projectKey : input.experiment.userScopeId;
      memoryIds.set(record.id, `${record.scope}:${scopeId}:${seeded.memoryId}`);
    }
    const foreignMemoryId = memoryIds.get("foreign-sentinel");
    if (foreignMemoryId === undefined) throw new Error("client A/B preflight did not seed its foreign decoy");
    const tasks: ClientAbPreflightTask[] = [];
    for (const task of input.experiment.tasks) {
      const pack = await input.registry.build_context_pack(preflightInput(input.experiment, task));
      const requiredMemoryIds = task.contextRecords.map((record) => {
        const memoryId = memoryIds.get(record.id);
        if (memoryId === undefined) throw new Error(`client A/B preflight is missing seeded memory ${record.id}`);
        return memoryId;
      });
      const selectedMemoryIds = [...pack.selectedMemoryIds];
      const allowed = new Set(input.experiment.targetRecords.map((record) => memoryIds.get(record.id)));
      if (selectedMemoryIds.length === 0 || selectedMemoryIds.length >= input.experiment.targetRecords.length || selectedMemoryIds.some((memoryId) => !allowed.has(memoryId))) {
        throw new Error(`client A/B preflight for ${task.id} selected records outside its proper target subset`);
      }
      if (selectedMemoryIds.includes(foreignMemoryId) || normalize(pack.packMarkdown).includes(FOREIGN_SENTINEL_MARKERS[0])) {
        throw new Error(`client A/B preflight for ${task.id} leaked the foreign sentinel`);
      }
      if (requiredMemoryIds.some((memoryId) => !selectedMemoryIds.includes(memoryId))) {
        throw new Error(`client A/B preflight for ${task.id} missed a required seed memory; required=${requiredMemoryIds.join(",")} selected=${selectedMemoryIds.join(",")}`);
      }
      const normalizedPack = normalize(pack.packMarkdown);
      for (const key of task.claimKeys) {
        const rule = ANSWER_KEYS[key];
        if (rule === undefined || !rule.alternatives.some((literal) => normalizedPack.includes(normalize(literal))) || !rule.required.every((literal) => normalizedPack.includes(normalize(literal)))) {
          throw new Error(`client A/B preflight for ${task.id} missed required anchor ${key}`);
        }
      }
      tasks.push({
        taskId: task.id,
        selectedMemoryIds,
        requiredMemoryIds,
        rawInputWordEstimate: wordEstimate(input.experiment.rawCanonicalContext),
        contextPackWordEstimate: wordEstimate(pack.packMarkdown),
        foreignLeakageCount: 0,
      });
    }
    const result: ClientAbPreflight = {
      sourceSha: input.experiment.sourceSha,
      corpusVersion: input.experiment.corpusVersion,
      seededRecordCount: input.experiment.seedRecords.length,
      rawCanonicalWordEstimate: wordEstimate(input.experiment.rawCanonicalContext),
      allowedMemoryIds: input.experiment.targetRecords.map((record) => memoryIds.get(record.id)!),
      foreignLeakageCount: 0,
      tasks,
    };
    if (input.resultPath !== undefined) await writeResultAtomically(input.resultPath, result);
    return result;
  } catch (error: unknown) {
    if (input.resultPath !== undefined) {
      await writeResultAtomically(input.resultPath, {
        status: "failed",
        sourceSha: input.experiment.sourceSha,
        error: error instanceof Error ? error.message : "client A/B preflight failed",
      });
    }
    throw error;
  }
}
export function clientAbRunPlan(experiment: ClientAbExperiment): Array<{ task: PreparedClientTask; repeat: number; condition: ClientCondition }> {
  const plan: Array<{ task: PreparedClientTask; repeat: number; condition: ClientCondition }> = [];
  for (const task of experiment.tasks) {
    for (const repeat of [1, 2, 3] as const) {
      for (const condition of repeat === 2 ? ["on", "off"] as const : ["off", "on"] as const) plan.push({ task, repeat, condition });
    }
  }
  return plan;
}
function conditionResultPath(resultDir: string, vendor: ClientVendor, taskId: string, repeat: number, condition: ClientCondition): string {
  return path.join(resultDir, `${vendor}-${taskId}-r${repeat}-${condition}.json`);
}
async function cliVersion(binary: string): Promise<string> {
  const command: ClientCommand = { binary, args: ["--version"], env: clientEnvironment(binary === "codex" ? "codex" : "claude"), cwd: process.cwd(), stdin: "", finalOutputPath: "" };
  const result = await runClientCommand(command, 10_000);
  const version = result.stdout.trim();
  if (!version) throw new Error(`${binary} did not report a CLI version`);
  return version;
}
function observedCodexModel(stdout: string): string | null {
  const completed = jsonLines(stdout, "Codex").find((event) => event.type === "turn.completed");
  if (completed === undefined) return null;
  const candidate = typeof completed.model === "string"
    ? completed.model
    : typeof completed.turn === "object" && completed.turn !== null && !Array.isArray(completed.turn) && typeof (completed.turn as Record<string, unknown>).model === "string"
      ? (completed.turn as Record<string, string>).model
      : undefined;
  return candidate ?? null;
}
function assertCodexHardCap(input: ClientAbRunInput): void {
  if (input.execute === undefined) throw new Error("Codex local CLI exposes no documented 2M hard token cap; paid Codex A/B execution fails closed");
}
function assertClientAuthentication(input: ClientAbRunInput): void {
  if (input.execute !== undefined || input.vendor !== "claude") return;
  if (typeof process.env.ANTHROPIC_API_KEY !== "string" || !process.env.ANTHROPIC_API_KEY.trim()) {
    throw new Error("Claude paid client A/B execution requires ANTHROPIC_API_KEY; no alternate credential source is accepted in bare mode");
  }
}
export async function runPaidClientAb(input: ClientAbRunInput): Promise<ClientAbRunSummary> {
  assertPaidClientExecutionAllowed(input.env ?? process.env, input.executePaid);
  text(input.model, "client A/B model");
  text(input.resultDir, "client A/B resultDir");
  if (input.vendor === "codex") assertCodexHardCap(input);
  assertClientAuthentication(input);
  await mkdir(path.dirname(input.resultDir), { recursive: true });
  await mkdir(input.resultDir);
  const execute: ClientExecutor = input.execute ?? (async (command) => runClientCommand(command));
  const getCliVersion = input.getCliVersion ?? cliVersion;
  const version = await getCliVersion(input.vendor);
  const outcomes = new Map<string, ClientConditionResult>();
  let runIndex = 0;
  try {
    for (const entry of clientAbRunPlan(input.experiment)) {
      runIndex += 1;
      const workspace = await createClientWorkspace();
      const resultPath = conditionResultPath(input.resultDir, input.vendor, entry.task.id, entry.repeat, entry.condition);
      try {
        const prompt = buildClientPrompt(entry.task, entry.condition, {
          rawCanonicalContext: input.experiment.rawCanonicalContext,
          scope: input.experiment,
        });
        const command = await buildClientCommand({
          vendor: input.vendor,
          condition: entry.condition,
          workspace,
          prompt,
          expectedModel: input.model,
          effort: input.effort,
          maxBudgetUsd: input.maxBudgetUsd,
          mcpServer: entry.condition === "on" ? input.mcpServer : undefined,
        });
        const executed = await execute(command);
        const parsed = input.vendor === "codex"
          ? parseCodexEvents(executed.stdout)
          : parseClaudeStream(executed.stdout, input.model);
        verifyToolTrace(entry.condition, parsed.toolCalls, preflightInput(input.experiment, entry.task), input.allowedMemoryIds);
        const rawOutput = input.vendor === "codex"
          ? executed.finalOutput ?? await readFile(command.finalOutputPath, "utf8")
          : JSON.stringify((parsed as ClaudeStreamResult).structuredOutput);
        if (input.vendor === "codex") parseCodexFinalOutput(rawOutput);
        const grade = gradeClientAnswer(entry.task, rawOutput);
        const observed = input.vendor === "codex" ? observedCodexModel(executed.stdout) : (parsed as ClaudeStreamResult).observedModel;
        if (observed !== null && observed !== input.model) throw new Error("client A/B observed model differs from the requested model");
        const outcome: ClientConditionResult = {
          vendor: input.vendor, taskId: entry.task.id, repeat: entry.repeat, condition: entry.condition,
          runIndex, success: grade.success, inputTokens: parsed.inputTokens, cachedInputTokens: parsed.cachedInputTokens,
          toolCalls: parsed.toolCalls, grade, model: { requested: input.model, observed }, cliVersion: version,
        };
        await writeResultAtomically(resultPath, outcome);
        if (!outcome.success) throw new Error(`client A/B ${entry.task.id} ${entry.condition} answer failed grading`);
        outcomes.set(`${entry.task.id}:${entry.repeat}:${entry.condition}`, outcome);
      } catch (error: unknown) {
        await writeResultAtomically(resultPath, {
          vendor: input.vendor, taskId: entry.task.id, repeat: entry.repeat, condition: entry.condition, runIndex,
          success: false, cliVersion: version,
          error: error instanceof Error ? error.message : "client A/B condition failed",
        });
        throw error;
      } finally {
        await rm(workspace.rootDir, { recursive: true, force: true });
      }
    }
    const pairs: ClientPair[] = input.experiment.tasks.flatMap((task) => [1, 2, 3].map((repeat) => {
      const off = outcomes.get(`${task.id}:${repeat}:off`);
      const on = outcomes.get(`${task.id}:${repeat}:on`);
      if (off === undefined || on === undefined) throw new Error("client A/B run lost a paired condition result");
      return { vendor: input.vendor, taskId: task.id, repeat, off: { success: off.success, inputTokens: off.inputTokens }, on: { success: on.success, inputTokens: on.inputTokens } };
    }));
    const aggregate = aggregateClientPairs(input.vendor, pairs);
    const all = [...outcomes.values()];
    const model = { requested: input.model, observed: all.every((outcome) => outcome.model.observed === input.model) ? input.model : null };
    const summary: ClientAbRunSummary = {
      vendor: input.vendor, sourceSha: input.experiment.sourceSha, corpusVersion: input.experiment.corpusVersion,
      cliVersion: version, model, pairs, aggregate,
      totals: {
        offInputTokens: all.filter((outcome) => outcome.condition === "off").reduce((sum, outcome) => sum + outcome.inputTokens, 0),
        onInputTokens: all.filter((outcome) => outcome.condition === "on").reduce((sum, outcome) => sum + outcome.inputTokens, 0),
        offCachedInputTokens: all.filter((outcome) => outcome.condition === "off").reduce((sum, outcome) => sum + outcome.cachedInputTokens, 0),
        onCachedInputTokens: all.filter((outcome) => outcome.condition === "on").reduce((sum, outcome) => sum + outcome.cachedInputTokens, 0),
      },
    };
    await writeResultAtomically(path.join(input.resultDir, `${input.vendor}-summary.json`), summary);
    return summary;
  } catch (error: unknown) {
    await writeResultAtomically(path.join(input.resultDir, `${input.vendor}-failure.json`), {
      status: "failed", sourceSha: input.experiment.sourceSha, completedConditions: outcomes.size,
      error: error instanceof Error ? error.message : "client A/B execution failed",
    });
    throw error;
  }
}
