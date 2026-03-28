import os from "node:os";
import path from "node:path";

export type ProjectPathsInput = {
  cwd: string;
  projectKey: string;
};

export function resolveProjectPaths(input: ProjectPathsInput) {
  const stateDir = path.join(
    os.homedir(),
    ".developer-memory-os",
    input.projectKey,
  );

  return {
    cwd: input.cwd,
    projectKey: input.projectKey,
    stateDir,
    dbPath: path.join(stateDir, "memory.db"),
  };
}
