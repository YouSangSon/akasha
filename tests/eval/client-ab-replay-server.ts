import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareClientAbExperiment, type LiveMcpServer } from "../../src/eval/client-ab.js";
import { loadClientAbSnapshot, replayClientContextPack, type ClientAbSnapshot } from "../../src/eval/client-ab-snapshot.js";
import { descriptorForTool } from "../../src/mcp/tool-schemas.js";
import { toToolResult } from "../../src/mcp/tool-result.js";

export function createClientAbReplayServer(snapshot: ClientAbSnapshot): McpServer {
  const server = new McpServer({ name: "developer-memory-os", version: "0.1.0" });
  const descriptor = descriptorForTool("build_context_pack");
  server.registerTool(descriptor.name, {
    description: descriptor.description,
    inputSchema: descriptor.inputSchema,
    outputSchema: descriptor.outputSchema,
  }, async (input) => toToolResult(replayClientContextPack(snapshot, input)));
  return server;
}

export function clientAbReplayMcpServer(input: {
  snapshotPath: string; snapshotSha256: string; sha: string; fixturePath: string;
}): LiveMcpServer {
  return {
    command: process.execPath,
    args: [
      "--import", import.meta.resolve("tsx"), fileURLToPath(import.meta.url),
      "--snapshot", path.resolve(input.snapshotPath), "--snapshot-sha256", input.snapshotSha256,
      "--sha", input.sha, "--fixture", input.fixturePath,
    ],
  };
}

async function main(): Promise<void> {
  const values = new Map<string, string>();
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag || !["--snapshot", "--snapshot-sha256", "--sha", "--fixture"].includes(flag) ||
        !value?.trim() || value.startsWith("--") || values.has(flag)) throw new Error("invalid snapshot replay server arguments");
    values.set(flag, value);
  }
  if (values.size !== 4) throw new Error("snapshot replay server requires snapshot, digest, SHA, and fixture");
  const experiment = prepareClientAbExperiment({
    repoDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
    sha: values.get("--sha")!, fixturePath: values.get("--fixture")!,
  });
  const snapshot = await loadClientAbSnapshot({
    snapshotPath: values.get("--snapshot")!, snapshotSha256: values.get("--snapshot-sha256")!, experiment,
  });
  await createClientAbReplayServer(snapshot).connect(new StdioServerTransport());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "snapshot replay failed"}\n`);
    process.exitCode = 1;
  });
}
