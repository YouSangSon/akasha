import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { bootstrapCanonicalServices } from "../../src/mcp/canonical-services.js";
import { createToolRegistry } from "../../src/mcp/tool-registry.js";
import { createPgPool } from "../../src/db/connection.js";
import { prefetchCliContextPack } from "../../src/eval/client-cli-prefetch.js";
import { captureClientAbSnapshot, clientAbSnapshotDigest, loadClientAbSnapshot, CLIENT_AB_SNAPSHOT_BUDGET } from "../../src/eval/client-ab-snapshot.js";
import { clientAbReplayMcpServer } from "./client-ab-replay-server.js";
import type { CanonicalServices } from "../../src/mcp/types.js";
import {
  assertPaidClientExecutionAllowed,
  prepareClientAbExperiment,
  runClientAb,
  seedAndPreflightClientAb,
  type ClientVendor,
  type ClientAbProfile,
  type LiveMcpServer,
} from "../../src/eval/client-ab.js";

const FULL_SHA = /^[0-9a-f]{40}$/;
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

export type ClientAbRunnerArgs = {
  sha: string; fixturePath: string; client?: ClientVendor; model?: string; effort?: string;
  profile: ClientAbProfile;
  resultDir: string; maxBudgetUsd?: number; executePaid: boolean; executeSubscription: boolean; preflight: boolean;
  maxOutputBytes?: number;
  snapshotPath?: string; snapshotSha256?: string; captureSnapshotPath?: string;
};

function requireValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined || !value.trim() || value.startsWith("--")) throw new Error(`client A/B runner ${flag} requires a non-blank value`);
  return value;
}
function decimal(value: string, flag: string): number {
  if (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(value)) throw new Error(`client A/B runner ${flag} must be a decimal number from 0 to 1`);
  return Number(value);
}
export function parseClientAbArgs(args: readonly string[]): ClientAbRunnerArgs {
  let sha: string | undefined;
  let fixturePath = "tests/eval/fixtures/client-ab.json";
  let client: ClientVendor | undefined;
  let model: string | undefined;
  let effort: string | undefined;
  let resultDir = "artifacts/client-ab";
  let maxBudgetUsd: number | undefined;
  let maxOutputBytes: number | undefined;
  let snapshotPath: string | undefined;
  let snapshotSha256: string | undefined;
  let captureSnapshotPath: string | undefined;
  let executePaid = false;
  let executeSubscription = false;
  let preflight = false;
  let profile: ClientAbProfile = "mcp-roundtrip";
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--execute-paid" || arg === "--execute-subscription" || arg === "--preflight") {
      if (seen.has(arg)) throw new Error(`client A/B runner repeats ${arg}`);
      seen.add(arg);
      if (arg === "--execute-paid") executePaid = true;
      else if (arg === "--execute-subscription") executeSubscription = true;
      else preflight = true;
      continue;
    }
    if (!["--sha", "--fixture", "--client", "--model", "--effort", "--result-dir", "--max-budget-usd", "--profile", "--max-output-bytes", "--snapshot", "--snapshot-sha256", "--capture-snapshot"].includes(arg ?? "")) throw new Error(`unknown client A/B runner argument ${arg}`);
    if (seen.has(arg!)) throw new Error(`client A/B runner repeats ${arg}`);
    seen.add(arg!);
    const value = requireValue(args, index, arg!);
    index += 1;
    if (arg === "--sha") sha = value;
    else if (arg === "--fixture") fixturePath = value;
    else if (arg === "--client") {
      if (value !== "codex" && value !== "claude") throw new Error("client A/B runner --client must be codex or claude");
      client = value;
    } else if (arg === "--model") model = value;
    else if (arg === "--profile") {
      if (value !== "mcp-roundtrip" && value !== "cli-prefetch") throw new Error("client A/B --profile must be mcp-roundtrip or cli-prefetch");
      profile = value;
    } else if (arg === "--effort") {
      if (!EFFORTS.has(value)) throw new Error("client A/B runner --effort must be low, medium, high, xhigh, or max");
      effort = value;
    } else if (arg === "--max-output-bytes") {
      maxOutputBytes = /^\d+$/.test(value) ? Number(value) : NaN;
      if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0) throw new Error("--max-output-bytes must be a positive safe integer");
    } else if (arg === "--result-dir") resultDir = value;
    else if (arg === "--snapshot") snapshotPath = value;
    else if (arg === "--snapshot-sha256") snapshotSha256 = value;
    else if (arg === "--capture-snapshot") captureSnapshotPath = value;
    else maxBudgetUsd = decimal(value, "--max-budget-usd");
  }
  if (sha === undefined || !FULL_SHA.test(sha)) throw new Error("client A/B runner requires --sha <full-lowercase-40-character-sha>");
  if ((executePaid || executeSubscription) && (client === undefined || model === undefined)) throw new Error("client A/B runner requires --client and --model");
  if (executeSubscription && (executePaid || client !== "codex" || effort === undefined)) throw new Error("subscription mode requires Codex, explicit --effort, and no paid mode");
  if (maxBudgetUsd !== undefined && client !== "claude") throw new Error("client A/B runner --max-budget-usd is valid only with --client claude");
  if (maxBudgetUsd !== undefined && maxBudgetUsd > 0.20) throw new Error("client A/B runner --max-budget-usd must be no greater than USD 0.20");
  if (profile === "cli-prefetch" && client !== undefined && client !== "codex") throw new Error("CLI prefetch currently supports Codex only");
  if (maxOutputBytes !== undefined && profile !== "mcp-roundtrip") throw new Error("--max-output-bytes is supported only by the MCP roundtrip profile");
  if (snapshotSha256 !== undefined && !/^[0-9a-f]{64}$/.test(snapshotSha256)) throw new Error("--snapshot-sha256 requires a lowercase SHA-256 digest from the trusted artifact receipt");
  if ((snapshotPath === undefined) !== (snapshotSha256 === undefined)) throw new Error("--snapshot and --snapshot-sha256 are required together");
  if (snapshotPath && (captureSnapshotPath || preflight || executePaid || profile !== "mcp-roundtrip" || (client !== undefined && client !== "codex"))) {
    throw new Error("snapshot replay supports only Codex MCP roundtrip dry-run/subscription execution, without capture/preflight/paid mode");
  }
  if (snapshotPath && maxOutputBytes !== undefined && maxOutputBytes !== CLIENT_AB_SNAPSHOT_BUDGET) throw new Error("snapshot replay budget must be exactly 8192 bytes");
  if (captureSnapshotPath && (!preflight || snapshotPath || executePaid || executeSubscription || profile !== "mcp-roundtrip" || maxOutputBytes !== undefined || (client !== undefined && client !== "codex"))) {
    throw new Error("snapshot capture requires --preflight alone in the MCP roundtrip profile");
  }
  return { sha, fixturePath, client, model, effort, profile, resultDir, maxBudgetUsd, executePaid, executeSubscription, preflight, snapshotPath, snapshotSha256, captureSnapshotPath, ...(maxOutputBytes === undefined ? {} : { maxOutputBytes }) };
}
function mcpEnvironment(env: NodeJS.ProcessEnv): Record<string, string> {
  const names = [
    "DATABASE_URL", "QDRANT_URL", "QDRANT_API_KEY", "QDRANT_COLLECTION_NAME",
    "VECTOR_BACKEND", "EMBEDDING_PROVIDER", "EMBEDDING_DIMENSIONS", "EMBEDDING_MODEL",
    "TRANSFORMERS_EMBEDDING_MODEL",
  ];
  const result: Record<string, string> = { DMO_CWD: process.cwd() };
  for (const name of names) if (typeof env[name] === "string") result[name] = env[name]!;
  return result;
}
function mcpServer(): LiveMcpServer {
  return {
    command: process.execPath,
    args: [path.join(process.cwd(), "dist", "src", "mcp", "server.js")],
    env: mcpEnvironment(process.env),
  };
}
async function withOwnedRegistry<T>(callback: (registry: ReturnType<typeof createToolRegistry>, services: CanonicalServices) => Promise<T>): Promise<T> {
  const services = await bootstrapCanonicalServices();
  try {
    return await callback(createToolRegistry({ cwd: process.cwd(), withCanonicalServices: async (use) => use(services) }), services);
  } finally {
    await services.close?.();
  }
}
export function assertLocalPreflightEnvironment(env: NodeJS.ProcessEnv): void {
  if (env.EMBEDDING_PROVIDER !== "transformers" || env.VECTOR_BACKEND !== "qdrant") {
    throw new Error("client A/B preflight requires local transformers and Qdrant");
  }
  const database = new URL(env.DATABASE_URL ?? "");
  const qdrant = new URL(env.QDRANT_URL ?? "");
  const local = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (!["postgres:", "postgresql:"].includes(database.protocol) || !local.has(database.hostname) ||
      database.search !== "" || database.hash !== "" || qdrant.search !== "" || qdrant.hash !== "" ||
      qdrant.pathname !== "/" || qdrant.username !== "" || qdrant.password !== "" ||
      qdrant.protocol !== "http:" || !local.has(qdrant.hostname) ||
      !/^\/akasha_eval_[0-9]+$/.test(database.pathname) || env.QDRANT_COLLECTION_NAME !== database.pathname.slice(1)) {
    throw new Error("client A/B preflight requires the disposable local eval database and matching collection");
  }
}

export async function runClientAbRunner(args: ClientAbRunnerArgs, repoDir = process.cwd()) {
  const experiment = prepareClientAbExperiment({
    repoDir,
    sha: args.sha,
    fixturePath: path.posix.normalize(args.fixturePath),
  });
  const resultDir = path.resolve(repoDir, args.resultDir);
  if (args.snapshotPath) {
    const snapshotPath = path.resolve(repoDir, args.snapshotPath);
    const snapshot = await loadClientAbSnapshot({ snapshotPath, snapshotSha256: args.snapshotSha256!, experiment });
    const replay = { mode: "captured-mcp" as const, snapshotSha256: args.snapshotSha256!, ci: snapshot.ci };
    if (!args.executeSubscription) return {
      mode: "snapshot-dry-run", profile: args.profile, sourceSha: experiment.sourceSha,
      corpusVersion: experiment.corpusVersion, captureCount: snapshot.captures.length, replay, paidExecution: false,
    };
    const summary = await runClientAb({
      experiment, vendor: "codex", model: args.model!, effort: args.effort,
      profile: "mcp-roundtrip", resultDir: path.join(resultDir, "codex"),
      mcpServer: clientAbReplayMcpServer({ snapshotPath, snapshotSha256: args.snapshotSha256!, sha: args.sha, fixturePath: args.fixturePath }),
      executePaid: false, executeSubscription: true, maxOutputBytes: args.maxOutputBytes,
      allowedMemoryIds: snapshot.preflight.allowedMemoryIds, replay,
    });
    return { mode: "subscription", preflight: snapshot.preflight, summary };
  }
  if (args.preflight || args.executePaid || args.executeSubscription) {
    if (args.executePaid) assertPaidClientExecutionAllowed(process.env, true);
    assertLocalPreflightEnvironment(process.env);
    await mkdir(path.dirname(resultDir), { recursive: true });
    await mkdir(resultDir);
    if (args.captureSnapshotPath) {
      const snapshot = await withOwnedRegistry((registry, services) => {
        if (services.config.embedding.provider !== "transformers") throw new Error("snapshot capture requires local transformers");
        return captureClientAbSnapshot({
          experiment, registry,
          capture: { ...services.config.embedding, provider: "transformers", vectorBackend: "qdrant" },
          ci: {
            repository: process.env.GITHUB_REPOSITORY ?? "", runId: process.env.GITHUB_RUN_ID ?? "",
            runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "", job: process.env.GITHUB_JOB ?? "", headSha: experiment.sourceSha,
          },
        });
      });
      const contents = `${JSON.stringify(snapshot)}\n`;
      const snapshotPath = path.resolve(repoDir, args.captureSnapshotPath);
      await mkdir(path.dirname(snapshotPath), { recursive: true });
      await writeFile(snapshotPath, contents, { mode: 0o600, flag: "wx" });
      return { mode: "capture", preflight: snapshot.preflight, captureCount: snapshot.captures.length, snapshotPath, snapshotSha256: clientAbSnapshotDigest(contents), ci: snapshot.ci, paidExecution: false };
    }
    const preflight = await withOwnedRegistry((registry) => seedAndPreflightClientAb({
      experiment,
      registry,
      resultPath: path.join(resultDir, "preflight.json"),
      maxOutputBytes: args.maxOutputBytes,
    }));
    if (args.executePaid || args.executeSubscription) {
      const database = args.profile === "cli-prefetch" ? createPgPool({ connectionString: process.env.DATABASE_URL!, max: 1 }) : undefined;
      try {
        const summary = await runClientAb({
          profile: args.profile,
          prefetch: database === undefined ? undefined : (task) => prefetchCliContextPack({ experiment, task, preflight, repoDir: process.cwd(), env: process.env, database }),
          experiment,
          vendor: args.client!,
          model: args.model!,
          effort: args.effort,
          maxBudgetUsd: args.maxBudgetUsd,
          resultDir: path.join(resultDir, args.client!),
          mcpServer: mcpServer(),
          executePaid: args.executePaid,
          executeSubscription: args.executeSubscription,
          maxOutputBytes: args.maxOutputBytes,
          allowedMemoryIds: preflight.allowedMemoryIds,
        });
        return { mode: args.executeSubscription ? "subscription" : "paid", preflight, summary };
      } finally {
        await database?.end();
      }
    }
    return { mode: "preflight", profile: args.profile, preflight, paidExecution: false };
  }
  return {
    mode: "dry-run",
    profile: args.profile,
    sourceSha: experiment.sourceSha,
    corpusVersion: experiment.corpusVersion,
    targetRecordCount: experiment.targetRecords.length,
    seededRecordCount: experiment.seedRecords.length,
    taskCount: experiment.tasks.length,
    ...(args.maxOutputBytes === undefined ? {} : { maxOutputBytes: args.maxOutputBytes }),
    paidExecution: false,
  };
}

async function main(): Promise<void> {
  const result = await runClientAbRunner(parseClientAbArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if ("summary" in result && result.summary) process.exitCode = result.summary.aggregate.passed ? 0 : 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "client A/B runner failed"}\n`);
    process.exitCode = 1;
  });
}
