import path from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { bootstrapCanonicalServices } from "../../src/mcp/canonical-services.js";
import { createToolRegistry } from "../../src/mcp/tool-registry.js";
import {
  assertPaidClientExecutionAllowed,
  prepareClientAbExperiment,
  runPaidClientAb,
  seedAndPreflightClientAb,
  type ClientVendor,
  type LiveMcpServer,
} from "../../src/eval/client-ab.js";

const FULL_SHA = /^[0-9a-f]{40}$/;
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);

export type ClientAbRunnerArgs = {
  sha: string; fixturePath: string; client?: ClientVendor; model?: string; effort?: string;
  resultDir: string; maxBudgetUsd?: number; executePaid: boolean; preflight: boolean;
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
  let executePaid = false;
  let preflight = false;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--execute-paid" || arg === "--preflight") {
      if (seen.has(arg)) throw new Error(`client A/B runner repeats ${arg}`);
      seen.add(arg);
      if (arg === "--execute-paid") executePaid = true;
      else preflight = true;
      continue;
    }
    if (!["--sha", "--fixture", "--client", "--model", "--effort", "--result-dir", "--max-budget-usd"].includes(arg ?? "")) throw new Error(`unknown client A/B runner argument ${arg}`);
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
    else if (arg === "--effort") {
      if (!EFFORTS.has(value)) throw new Error("client A/B runner --effort must be low, medium, high, xhigh, or max");
      effort = value;
    } else if (arg === "--result-dir") resultDir = value;
    else maxBudgetUsd = decimal(value, "--max-budget-usd");
  }
  if (sha === undefined || !FULL_SHA.test(sha)) throw new Error("client A/B runner requires --sha <full-lowercase-40-character-sha>");
  if (executePaid && (client === undefined || model === undefined)) throw new Error("paid client A/B runner requires --client and --model");
  if (maxBudgetUsd !== undefined && client !== "claude") throw new Error("client A/B runner --max-budget-usd is valid only with --client claude");
  if (maxBudgetUsd !== undefined && maxBudgetUsd > 0.20) throw new Error("client A/B runner --max-budget-usd must be no greater than USD 0.20");
  return { sha, fixturePath, client, model, effort, resultDir, maxBudgetUsd, executePaid, preflight };
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
async function withOwnedRegistry<T>(callback: (registry: ReturnType<typeof createToolRegistry>) => Promise<T>): Promise<T> {
  const services = await bootstrapCanonicalServices();
  try {
    return await callback(createToolRegistry({ cwd: process.cwd(), withCanonicalServices: async (use) => use(services) }));
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

async function main(): Promise<void> {
  const args = parseClientAbArgs(process.argv.slice(2));
  const experiment = prepareClientAbExperiment({
    repoDir: process.cwd(),
    sha: args.sha,
    fixturePath: path.posix.normalize(args.fixturePath),
  });
  const resultDir = path.resolve(process.cwd(), args.resultDir);
  if (args.preflight || args.executePaid) {
    if (args.executePaid) assertPaidClientExecutionAllowed(process.env, true);
    assertLocalPreflightEnvironment(process.env);
    await mkdir(path.dirname(resultDir), { recursive: true });
    await mkdir(resultDir);
    const preflight = await withOwnedRegistry((registry) => seedAndPreflightClientAb({
      experiment,
      registry,
      resultPath: path.join(resultDir, "preflight.json"),
    }));
    if (args.executePaid) {
      const summary = await runPaidClientAb({
        experiment,
        vendor: args.client!,
        model: args.model!,
        effort: args.effort,
        maxBudgetUsd: args.maxBudgetUsd,
        resultDir: path.join(resultDir, args.client!),
        mcpServer: mcpServer(),
        executePaid: true,
        allowedMemoryIds: preflight.allowedMemoryIds,
      });
      process.stdout.write(`${JSON.stringify({ mode: "paid", preflight, summary })}\n`);
      return;
    }
    process.stdout.write(`${JSON.stringify({ mode: "preflight", preflight, paidExecution: false })}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify({
    mode: "dry-run",
    sourceSha: experiment.sourceSha,
    corpusVersion: experiment.corpusVersion,
    targetRecordCount: experiment.targetRecords.length,
    seededRecordCount: experiment.seedRecords.length,
    taskCount: experiment.tasks.length,
    paidExecution: false,
  })}\n`);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "client A/B runner failed"}\n`);
    process.exitCode = 1;
  });
}
