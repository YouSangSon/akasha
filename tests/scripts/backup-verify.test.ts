import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  access,
  chmod,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveBackupTargetDir,
  verifyBackups,
} from "../../scripts/backup-verify.js";

const tempDirs: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("verifyBackups", () => {
  it("passes when the newest manifest matches local and off-box artifacts", async () => {
    const { localDir, remoteDir } = await createBackupFixture();

    await expect(
      verifyBackups({
        now: new Date("2026-03-29T20:00:00.000Z"),
        backupDir: localDir,
        remoteReadTextFile(fileName) {
          return readFile(path.join(remoteDir, fileName), "utf8");
        },
        remoteFileExists(fileName) {
          return exists(path.join(remoteDir, fileName));
        },
        remoteSha256File(fileName) {
          return sha256(path.join(remoteDir, fileName));
        },
      }),
    ).resolves.toMatchObject({
      manifestFileName: "manifest-20260329-1200.json",
    });
  });

  it("fails when the off-box snapshot is missing", async () => {
    const { localDir, remoteDir } = await createBackupFixture();

    await rm(path.join(remoteDir, "qdrant-20260329-1200.snapshot"));

    await expect(
      verifyBackups({
        now: new Date("2026-03-29T20:00:00.000Z"),
        backupDir: localDir,
        remoteReadTextFile(fileName) {
          return readFile(path.join(remoteDir, fileName), "utf8");
        },
        remoteFileExists(fileName) {
          return exists(path.join(remoteDir, fileName));
        },
        remoteSha256File(fileName) {
          return sha256(path.join(remoteDir, fileName));
        },
      }),
    ).rejects.toThrow("latest off-box qdrant snapshot is missing");
  });

  it("passes pgvector manifests without Qdrant artifacts", async () => {
    const { localDir, remoteDir } = await createBackupFixture({
      vectorBackend: "pgvector",
    });

    await expect(
      verifyBackups({
        now: new Date("2026-03-29T20:00:00.000Z"),
        backupDir: localDir,
        remoteReadTextFile(fileName) {
          return readFile(path.join(remoteDir, fileName), "utf8");
        },
        remoteFileExists(fileName) {
          return exists(path.join(remoteDir, fileName));
        },
        remoteSha256File(fileName) {
          return sha256(path.join(remoteDir, fileName));
        },
      }),
    ).resolves.toMatchObject({
      manifest: {
        vectorBackend: "pgvector",
        postgres: {
          fileName: "postgres-20260329-1200.sql.gz",
        },
      },
    });
  });

  it("fails when the newest manifest is older than 24 hours", async () => {
    const { localDir, remoteDir } = await createBackupFixture({
      createdAt: "2026-03-27T00:00:00.000Z",
    });

    await expect(
      verifyBackups({
        now: new Date("2026-03-29T20:00:00.000Z"),
        backupDir: localDir,
        remoteReadTextFile(fileName) {
          return readFile(path.join(remoteDir, fileName), "utf8");
        },
        remoteFileExists(fileName) {
          return exists(path.join(remoteDir, fileName));
        },
        remoteSha256File(fileName) {
          return sha256(path.join(remoteDir, fileName));
        },
      }),
    ).rejects.toThrow("latest successful backup is older than 24 hours");
  });
});

describe("resolveBackupTargetDir", () => {
  it("defaults to BACKUP_DIR when BACKUP_TARGET_DIR is unset", () => {
    expect(resolveBackupTargetDir({}, "/backups/local")).toBe("/backups/local");
  });

  it("returns configured target directories unchanged", () => {
    expect(
      resolveBackupTargetDir(
        { BACKUP_TARGET_DIR: "/remote/backups with spaces" },
        "/backups/local",
      ),
    ).toBe("/remote/backups with spaces");
  });

  it("rejects whitespace-only BACKUP_TARGET_DIR before remote path construction", () => {
    expect(() =>
      resolveBackupTargetDir(
        { BACKUP_TARGET_DIR: " \n\t " },
        "/backups/local",
      ),
    ).toThrow("BACKUP_TARGET_DIR must contain non-whitespace text");
  });
});

describe("backup target directory shell guards", () => {
  it.each([
    "scripts/backup-postgres.sh",
    "scripts/snapshot-qdrant.sh",
    "scripts/create-backup.sh",
  ])("%s rejects whitespace-only BACKUP_TARGET_DIR", async (scriptPath) => {
    const script = await readFile(scriptPath, "utf8");

    expect(script).toContain(
      "BACKUP_TARGET_DIR must contain non-whitespace text",
    );
    expect(script).toContain("tr -d '[:space:]'");
    expect(script).not.toContain("${BACKUP_TARGET_DIR:-${BACKUP_DIR}}");
  });

  it.each([
    "scripts/backup-postgres.sh",
    "scripts/snapshot-qdrant.sh",
    "scripts/create-backup.sh",
  ])("%s falls back to BACKUP_DIR when BACKUP_TARGET_DIR is unset", async (scriptPath) => {
    const result = await runBackupShellScript(scriptPath, {});

    expect(result.ok).toBe(true);
    expect(result.log).toContain(`remote.example:${result.backupDir}/`);
  });

  it.each([
    "scripts/backup-postgres.sh",
    "scripts/snapshot-qdrant.sh",
    "scripts/create-backup.sh",
  ])("%s preserves valid BACKUP_TARGET_DIR values", async (scriptPath) => {
    const targetDir = path.join(os.tmpdir(), "akasha backup remote target");
    const result = await runBackupShellScript(scriptPath, {
      BACKUP_TARGET_DIR: targetDir,
    });

    expect(result.ok).toBe(true);
    expect(result.log).toContain(`remote.example:${targetDir}/`);
  });

  it.each([
    ["empty", ""],
    ["whitespace", " \n\t "],
  ])(
    "rejects %s BACKUP_TARGET_DIR under sh -eu",
    async (_label, targetDir) => {
      for (const scriptPath of [
        "scripts/backup-postgres.sh",
        "scripts/snapshot-qdrant.sh",
        "scripts/create-backup.sh",
      ]) {
        const result = await runBackupShellScript(scriptPath, {
          BACKUP_TARGET_DIR: targetDir,
        });

        expect(result.ok).toBe(false);
        expect(result.stderr).toContain(
          "BACKUP_TARGET_DIR must contain non-whitespace text",
        );
        expect(result.log).not.toContain("ssh:");
        expect(result.log).not.toContain("scp:");
      }
    },
  );
});

describe("snapshot Qdrant collection shell guard", () => {
  it("uses the default collection name when QDRANT_COLLECTION_NAME is unset", async () => {
    const result = await runBackupShellScript("scripts/snapshot-qdrant.sh", {});

    expect(result.ok).toBe(true);
    await expect(
      exists(path.join(result.backupDir, "qdrant-memory_chunks_v1-20260329-1200.json")),
    ).resolves.toBe(true);
  });

  it("preserves valid QDRANT_COLLECTION_NAME values", async () => {
    const result = await runBackupShellScript("scripts/snapshot-qdrant.sh", {
      QDRANT_COLLECTION_NAME: "custom_chunks",
    });

    expect(result.ok).toBe(true);
    await expect(
      exists(path.join(result.backupDir, "qdrant-custom_chunks-20260329-1200.json")),
    ).resolves.toBe(true);
  });

  it.each([
    ["empty", ""],
    ["whitespace", " \n\t "],
  ])("rejects %s QDRANT_COLLECTION_NAME before snapshot work", async (_label, collectionName) => {
    const result = await runBackupShellScript("scripts/snapshot-qdrant.sh", {
      QDRANT_COLLECTION_NAME: collectionName,
    });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain(
      "QDRANT_COLLECTION_NAME must contain non-whitespace text",
    );
    expect(result.log).toBe("");
  });
});

async function runBackupShellScript(
  scriptPath: string,
  envOverrides: Record<string, string>,
): Promise<{
  ok: boolean;
  stdout: string;
  stderr: string;
  log: string;
  backupDir: string;
}> {
  const backupDir = await mkdtemp(path.join(os.tmpdir(), "akasha-backup-shell-"));
  const binDir = await mkdtemp(path.join(os.tmpdir(), "akasha-backup-bin-"));
  const logPath = path.join(backupDir, "remote.log");
  tempDirs.push(backupDir, binDir);
  await writeStubCommands(binDir);

  const env: NodeJS.ProcessEnv = {
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    BACKUP_DIR: backupDir,
    BACKUP_TARGET_HOST: "remote.example",
    BACKUP_TIMESTAMP: "20260329-1200",
    DATABASE_URL: "postgres://memory:memory@localhost:5432/memory_os",
    QDRANT_URL: "http://qdrant.local:6333",
    VECTOR_BACKEND: "pgvector",
    STUB_LOG: logPath,
    ...envOverrides,
  };

  try {
    const result = await execFileAsync("sh", [scriptPath], {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
    });
    return {
      ok: true,
      stdout: result.stdout,
      stderr: result.stderr,
      log: await readOptionalText(logPath),
      backupDir,
    };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string };
    return {
      ok: false,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      log: await readOptionalText(logPath),
      backupDir,
    };
  }
}

async function writeStubCommands(binDir: string): Promise<void> {
  await Promise.all([
    writeExecutable(
      path.join(binDir, "pg_dump"),
      "#!/usr/bin/env sh\nprintf 'postgres dump bytes'\n",
    ),
    writeExecutable(path.join(binDir, "gzip"), "#!/usr/bin/env sh\ncat\n"),
    writeExecutable(
      path.join(binDir, "sha256sum"),
      "#!/usr/bin/env sh\nprintf 'stubsha  %s\\n' \"$1\"\n",
    ),
    writeExecutable(
      path.join(binDir, "curl"),
      `#!/usr/bin/env sh
printf 'curl:%s\\n' "$*" >> "$STUB_LOG"
out=""
previous=""
for arg do
  if [ "$previous" = "--output" ]; then
    out="$arg"
    previous=""
    continue
  fi
  if [ "$arg" = "--output" ]; then
    previous="--output"
  fi
done
if [ -n "$out" ]; then
  printf 'snapshot bytes' > "$out"
else
  printf '{"result":{"name":"snapshot-one"}}'
fi
`,
    ),
    writeExecutable(
      path.join(binDir, "ssh"),
      "#!/usr/bin/env sh\nprintf 'ssh:%s\\n' \"$*\" >> \"$STUB_LOG\"\n",
    ),
    writeExecutable(
      path.join(binDir, "scp"),
      `#!/usr/bin/env sh
last=""
for arg do
  last="$arg"
done
printf 'scp:%s\\n' "$last" >> "$STUB_LOG"
`,
    ),
  ]);
}

async function writeExecutable(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content);
  await chmod(filePath, 0o755);
}

async function readOptionalText(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function createBackupFixture(options: {
  createdAt?: string;
  vectorBackend?: "qdrant" | "pgvector";
} = {}) {
  const localDir = await mkdtemp(path.join(os.tmpdir(), "developer-memory-os-backup-local-"));
  const remoteDir = await mkdtemp(path.join(os.tmpdir(), "developer-memory-os-backup-remote-"));
  tempDirs.push(localDir, remoteDir);

  const postgresContent = "postgres backup contents";
  const qdrantContent = "qdrant snapshot contents";
  const postgresFileName = "postgres-20260329-1200.sql.gz";
  const qdrantFileName = "qdrant-20260329-1200.snapshot";
  const manifestFileName = "manifest-20260329-1200.json";
  const manifestPayload = {
    createdAt: options.createdAt ?? "2026-03-29T12:00:00.000Z",
    ...(options.vectorBackend ? { vectorBackend: options.vectorBackend } : {}),
    postgres: {
      fileName: postgresFileName,
      sha256: sha256Text(postgresContent),
    },
    ...(options.vectorBackend === "pgvector"
      ? {}
      : {
          qdrant: {
            fileName: qdrantFileName,
            sha256: sha256Text(qdrantContent),
          },
        }),
  };
  const manifest = JSON.stringify(manifestPayload, null, 2);

  const writes = [
    writeFile(path.join(localDir, postgresFileName), postgresContent),
    writeFile(path.join(localDir, manifestFileName), `${manifest}\n`),
    writeFile(path.join(remoteDir, postgresFileName), postgresContent),
    writeFile(path.join(remoteDir, manifestFileName), `${manifest}\n`),
  ];

  if (options.vectorBackend !== "pgvector") {
    writes.push(
      writeFile(path.join(localDir, qdrantFileName), qdrantContent),
      writeFile(path.join(remoteDir, qdrantFileName), qdrantContent),
    );
  }

  await Promise.all(writes);

  return { localDir, remoteDir };
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256(filePath: string) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
