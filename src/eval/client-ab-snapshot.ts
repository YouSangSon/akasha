import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import * as z from "zod/v4";
import { descriptorForTool } from "../mcp/tool-schemas.js";
import type { BuildContextPackToolInput, BuildContextPackToolResult } from "../mcp/types.js";
import {
  assertClientContextPack, preflightInput, seedAndPreflightClientAb,
  type ClientAbExperiment, type ClientAbPreflight, type ClientAbRegistry, type ClientAbReplayProvenance, type PreparedClientRecord,
} from "./client-ab.js";
import { assertObservedPackBudget } from "./payload-metrics.js";

export const CLIENT_AB_SNAPSHOT_BUDGET = 8192;
const sha = z.string().regex(/^[0-9a-f]{40}$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const nonNegative = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const strings = z.array(z.string().min(1));
const ciSchema = z.object({
  repository: z.literal("YouSangSon/akasha"), runId: z.string().regex(/^[1-9]\d*$/),
  runAttempt: z.string().regex(/^[1-9]\d*$/), job: z.string().min(1), headSha: sha,
}).strict();
const preflightSchema = z.object({
  sourceSha: sha, corpusVersion: positive, seededRecordCount: positive, rawCanonicalWordEstimate: positive,
  foreignLeakageCount: z.literal(0), allowedMemoryIds: strings,
  tasks: z.array(z.object({
    taskId: z.string(), selectedMemoryIds: strings, requiredMemoryIds: strings,
    rawInputWordEstimate: positive, contextPackWordEstimate: positive, foreignLeakageCount: z.literal(0),
    rawCanonicalUtf8Bytes: positive.optional(), contextPackMarkdownUtf8Bytes: positive.optional(),
    contextPackStructuredJsonUtf8Bytes: positive.optional(),
  }).strict()).length(3),
}).strict();
const snapshotSchema = z.object({
  version: z.literal(1), sourceSha: sha, corpusVersion: positive,
  scope: z.object({ organizationId: z.string(), projectKey: z.string(), userScopeId: z.string() }).strict(),
  capture: z.object({
    provider: z.literal("transformers"), model: z.string().trim().min(1), dimensions: positive,
    version: z.literal("v1"), chunkTargetTokens: positive, chunkOverlapTokens: nonNegative,
    vectorBackend: z.literal("qdrant"),
  }).strict(),
  ci: ciSchema, preflight: preflightSchema,
  captures: z.array(z.object({ taskId: z.string(), input: z.unknown(), result: z.unknown(), sha256: digest }).strict()).length(6),
}).strict();
const descriptor = descriptorForTool("build_context_pack");
const resultSchema = z.object(descriptor.outputSchema).strict();

export type ClientAbSnapshot = {
  version: 1; sourceSha: string; corpusVersion: number;
  scope: { organizationId: string; projectKey: string; userScopeId: string };
  capture: z.infer<typeof snapshotSchema>["capture"];
  ci: ClientAbReplayProvenance["ci"];
  preflight: ClientAbPreflight;
  captures: Array<{ taskId: string; input: BuildContextPackToolInput; result: BuildContextPackToolResult; sha256: string }>;
};

export function clientAbSnapshotDigest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function captureDigest(input: BuildContextPackToolInput, result: BuildContextPackToolResult): string {
  return clientAbSnapshotDigest(JSON.stringify({ input, result }));
}

export async function captureClientAbSnapshot(input: {
  experiment: ClientAbExperiment; registry: ClientAbRegistry;
  capture: ClientAbSnapshot["capture"]; ci: ClientAbSnapshot["ci"];
}): Promise<ClientAbSnapshot> {
  ciSchema.parse(input.ci);
  snapshotSchema.shape.capture.parse(input.capture);
  if (input.ci.headSha !== input.experiment.sourceSha) throw new Error("snapshot CI head differs from the pinned source SHA");
  const captures: ClientAbSnapshot["captures"] = [];
  const registry: ClientAbRegistry = {
    add_memory: (memory) => input.registry.add_memory(memory),
    async build_context_pack(request) {
      const result = await input.registry.build_context_pack(request);
      const task = input.experiment.tasks.find((candidate) => candidate.task === request.task);
      if (!task) throw new Error("snapshot capture received an unexpected task");
      captures.push({ taskId: task.id, input: structuredClone(request), result: structuredClone(result), sha256: captureDigest(request, result) });
      return result;
    },
  };
  // Capture the unbudgeted results during this single seed/preflight pass.
  const preflight = await seedAndPreflightClientAb({ experiment: input.experiment, registry });
  for (const task of input.experiment.tasks) {
    await registry.build_context_pack(preflightInput(input.experiment, task, CLIENT_AB_SNAPSHOT_BUDGET));
  }
  return validateClientAbSnapshot({
    version: 1, sourceSha: input.experiment.sourceSha, corpusVersion: input.experiment.corpusVersion,
    scope: { organizationId: input.experiment.organizationId, projectKey: input.experiment.projectKey, userScopeId: input.experiment.userScopeId },
    capture: input.capture, ci: input.ci, preflight, captures,
  }, input.experiment);
}

export function validateClientAbSnapshot(value: unknown, experiment: ClientAbExperiment): ClientAbSnapshot {
  snapshotSchema.parse(value);
  const snapshot = value as ClientAbSnapshot;
  if (snapshot.sourceSha !== experiment.sourceSha || snapshot.corpusVersion !== experiment.corpusVersion ||
      snapshot.corpusVersion < 4 || snapshot.ci.headSha !== experiment.sourceSha ||
      snapshot.preflight.sourceSha !== experiment.sourceSha || snapshot.preflight.corpusVersion !== experiment.corpusVersion) {
    throw new Error("snapshot source SHA/corpus/CI head does not match the pinned experiment");
  }
  if (!isDeepStrictEqual(snapshot.scope, {
    organizationId: experiment.organizationId, projectKey: experiment.projectKey, userScopeId: experiment.userScopeId,
  })) throw new Error("snapshot scope does not match the pinned experiment");
  if (snapshot.capture.chunkOverlapTokens >= snapshot.capture.chunkTargetTokens) throw new Error("snapshot capture chunk overlap is invalid");
  if (JSON.stringify(snapshot).normalize("NFKC").toLowerCase().includes("orbital_sentinel_9bce")) {
    throw new Error("snapshot contains the foreign sentinel");
  }
  const allowed = snapshot.preflight.allowedMemoryIds;
  if (allowed.length !== experiment.targetRecords.length || new Set(allowed).size !== allowed.length ||
      snapshot.preflight.seededRecordCount !== experiment.seedRecords.length) throw new Error("snapshot seeded ID coverage is invalid");
  const records = new Map(allowed.map((id, index) => {
    const record = experiment.targetRecords[index]!;
    const prefix = `${record.scope}:${record.scope === "project" ? experiment.projectKey : experiment.userScopeId}:`;
    const numericId = id.slice(prefix.length);
    if (!id.startsWith(prefix) || !/^[1-9]\d*$/.test(numericId) || !Number.isSafeInteger(Number(numericId))) {
      throw new Error("snapshot allowed memory ID has an invalid scope or record id");
    }
    return [id, record] as const;
  }));
  if (new Set(snapshot.preflight.tasks.map((task) => task.taskId)).size !== 3) throw new Error("snapshot preflight repeats a task");
  assertSnapshotCaptures(snapshot, experiment, records);
  return snapshot;
}

function assertSnapshotCaptures(snapshot: ClientAbSnapshot, experiment: ClientAbExperiment, records: ReadonlyMap<string, PreparedClientRecord>): void {
  const allowed = snapshot.preflight.allowedMemoryIds;
  const seen = new Set<string>();
  for (const capture of snapshot.captures) {
    const task = experiment.tasks.find((candidate) => candidate.id === capture.taskId);
    if (!task) throw new Error("snapshot has an unsupported task");
    const budget = capture.input?.maxOutputBytes;
    if (budget !== undefined && budget !== CLIENT_AB_SNAPSHOT_BUDGET) throw new Error("snapshot budget must be exactly 8192 bytes");
    if (!isDeepStrictEqual(capture.input, preflightInput(experiment, task, budget))) throw new Error("snapshot input does not match the exact task and scope");
    const key = `${task.id}:${budget ?? "unbudgeted"}`;
    if (seen.has(key)) throw new Error("snapshot repeats a task/budget capture");
    seen.add(key);
    if (capture.sha256 !== captureDigest(capture.input, capture.result)) throw new Error("snapshot capture content digest differs");
    resultSchema.parse(capture.result);
    if (capture.result.projectKey !== experiment.projectKey) throw new Error("snapshot output project scope differs");
    assertSnapshotOutputScope(capture.result, experiment);
    assertObservedPackBudget(capture.result, budget);
    if (budget === undefined && capture.result.budget !== undefined) throw new Error("snapshot unbudgeted output must not have budget metadata");
    const required = task.contextRecords.map((record) => allowed[experiment.targetRecords.findIndex((target) => target.id === record.id)]!);
    const preflightTask = snapshot.preflight.tasks.find((candidate) => candidate.taskId === task.id);
    if (!preflightTask || !isDeepStrictEqual(preflightTask.requiredMemoryIds, required) ||
        (budget === undefined && !isDeepStrictEqual(preflightTask.selectedMemoryIds, capture.result.selectedMemoryIds))) {
      throw new Error("snapshot required/selected preflight IDs differ from the seeded corpus");
    }
    assertClientContextPack(task, capture.result, allowed, required);
    assertSnapshotResultIds(capture.result, experiment, records);
  }
}

function assertSnapshotResultIds(result: BuildContextPackToolResult, experiment: ClientAbExperiment, records: ReadonlyMap<string, PreparedClientRecord>): void {
  const sectionRecords = Object.entries(result.sections).flatMap(([section, entries]) => entries.map((record) => ({ section, record })));
  const ids = sectionRecords.map(({ record }) => `${record.scopeType}:${record.scopeId}:${record.id}`);
  if (new Set(ids).size !== ids.length || !isDeepStrictEqual([...ids].sort(), [...result.selectedMemoryIds].sort())) {
    throw new Error("snapshot section IDs differ from selected memory IDs");
  }
  for (const { record } of sectionRecords) {
    const original = records.get(`${record.scopeType}:${record.scopeId}:${record.id}`);
    if (!original || record.organizationId !== experiment.organizationId || record.content !== original.content ||
        record.source?.organizationId !== experiment.organizationId || record.source.scopeType !== original.scope ||
        record.source.scopeId !== (original.scope === "project" ? experiment.projectKey : experiment.userScopeId)) {
      throw new Error("snapshot section record/source is outside the seeded organization and scope");
    }
  }
  if (result.selectionRationale.length !== ids.length || new Set(result.selectionRationale.map((entry) => entry.memoryId)).size !== ids.length) {
    throw new Error("snapshot rationale ID coverage differs from sections");
  }
  for (const rationale of result.selectionRationale) {
    const selected = sectionRecords.find(({ section, record }) => section === rationale.section &&
      record.id === rationale.recordId && `${record.scopeType}:${record.scopeId}:${record.id}` === rationale.memoryId);
    if (!selected || rationale.scopeType !== selected.record.scopeType || rationale.scopeId !== selected.record.scopeId ||
        rationale.sourceType !== selected.record.source.sourceType || rationale.sourceTitle !== selected.record.source.title ||
        !Number.isSafeInteger(rationale.inputRank) || rationale.inputRank < 1 || rationale.inputRank > 10) {
      throw new Error("snapshot rationale points outside its selected section record");
    }
  }
}

function assertSnapshotOutputScope(value: unknown, experiment: ClientAbExperiment): void {
  if (Array.isArray(value)) {
    for (const entry of value) assertSnapshotOutputScope(entry, experiment);
  } else if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    for (const key of ["organizationId", "organization_id"]) {
      if (key in record && record[key] !== experiment.organizationId) throw new Error("snapshot output contains a foreign organization");
    }
    if ("scopeType" in record && !((record.scopeType === "project" && record.scopeId === experiment.projectKey) ||
        (record.scopeType === "user" && record.scopeId === experiment.userScopeId))) throw new Error("snapshot output contains a foreign scope");
    if (record.projectKey !== undefined && record.projectKey !== null && record.projectKey !== experiment.projectKey) throw new Error("snapshot output contains a foreign project");
    for (const entry of Object.values(record)) assertSnapshotOutputScope(entry, experiment);
  }
}

export async function loadClientAbSnapshot(input: {
  snapshotPath: string; snapshotSha256: string; experiment: ClientAbExperiment;
}): Promise<ClientAbSnapshot> {
  digest.parse(input.snapshotSha256);
  const contents = await readFile(input.snapshotPath);
  // The operator must obtain this digest from the trusted CI artifact receipt.
  if (clientAbSnapshotDigest(contents) !== input.snapshotSha256) throw new Error("snapshot artifact SHA-256 differs from the operator-pinned digest");
  return validateClientAbSnapshot(JSON.parse(contents.toString("utf8")), input.experiment);
}

export function replayClientContextPack(snapshot: ClientAbSnapshot, input: unknown): BuildContextPackToolResult {
  const capture = snapshot.captures.find((candidate) => isDeepStrictEqual(candidate.input, input));
  if (!capture) throw new Error("snapshot replay accepts only exact captured build_context_pack arguments");
  return structuredClone(capture.result);
}
