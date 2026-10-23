import { createHash } from "node:crypto";
import path from "node:path";
import type { PgQueryable } from "../db/connection.js";
import { assertClientContextPack, runClientCommand, type ClientAbExperiment, type ClientAbPreflight, type ClientExecutor, type ClientPrefetchPack, type PreparedClientTask } from "./client-ab.js";

export async function prefetchCliContextPack(input: {
  experiment: ClientAbExperiment; task: PreparedClientTask; preflight: ClientAbPreflight;
  repoDir: string; env: NodeJS.ProcessEnv; database: PgQueryable; execute?: ClientExecutor;
}): Promise<ClientPrefetchPack> {
  const required = input.preflight.tasks.find((task) => task.taskId === input.task.id)?.requiredMemoryIds;
  if (!required?.length) throw new Error("CLI prefetch requires the seeded task identities");
  const before = await input.database.query<{ cursor: string }>("SELECT COALESCE(MAX(id), 0)::text AS cursor FROM context_pack_runs");
  const cursor = before.rows[0]?.cursor;
  if (typeof cursor !== "string" || !/^\d+$/.test(cursor)) throw new Error("CLI prefetch receipt cursor is unavailable");
  const env: NodeJS.ProcessEnv = { DMO_CWD: input.repoDir, NO_COLOR: "1" };
  for (const name of ["PATH", "HOME", "LANG", "LC_ALL", "DATABASE_URL", "QDRANT_URL", "QDRANT_API_KEY", "QDRANT_COLLECTION_NAME", "VECTOR_BACKEND", "EMBEDDING_PROVIDER", "EMBEDDING_DIMENSIONS", "EMBEDDING_MODEL", "TRANSFORMERS_EMBEDDING_MODEL"]) {
    if (input.env[name] !== undefined) env[name] = input.env[name];
  }
  const started = performance.now();
  const output = await (input.execute ?? runClientCommand)({
    binary: process.execPath,
    args: [path.join(input.repoDir, "dist/src/cli.js"), "pack", "--project", input.experiment.projectKey, "--task", input.task.task, "--user", input.experiment.userScopeId, "--organization-id", input.experiment.organizationId],
    env, cwd: input.repoDir, stdin: "", finalOutputPath: "",
  });
  const cliDurationMs = performance.now() - started;
  const after = await input.database.query<{ id: string; selected_memory_ids: string[]; pack_markdown: string }>(
    "SELECT id::text, selected_memory_ids, pack_markdown FROM context_pack_runs WHERE id > $1::bigint AND organization_id = $2 AND project_key = $3 AND task = $4 ORDER BY id LIMIT 2",
    [cursor, input.experiment.organizationId, input.experiment.projectKey, input.task.task],
  );
  const row = after.rows[0];
  if (after.rows.length !== 1 || row === undefined || typeof row.pack_markdown !== "string" || output.stdout !== row.pack_markdown + "\n") {
    throw new Error("CLI prefetch requires exactly one fresh receipt matching stdout byte for byte");
  }
  assertClientContextPack(input.task, { packMarkdown: row.pack_markdown, selectedMemoryIds: row.selected_memory_ids }, input.preflight.allowedMemoryIds, required);
  return {
    packMarkdown: row.pack_markdown,
    receipt: { contextPackRunId: row.id, selectedMemoryIds: row.selected_memory_ids, packSha256: createHash("sha256").update(row.pack_markdown).digest("hex"), cliDurationMs },
  };
}
