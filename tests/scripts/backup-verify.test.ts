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
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("preserves optional Qdrant metadata on pgvector manifests", async () => {
    const { localDir, remoteDir } = await createBackupFixture({
      vectorBackend: "pgvector",
      includeQdrantManifestMetadata: true,
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
        qdrant: {
          fileName: "qdrant-20260329-1200.snapshot",
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

  it.each([
    ["createdAt", { createdAt: " \n\t " }],
    ["postgres.fileName", { postgres: { fileName: " \n\t " } }],
    ["postgres.sha256", { postgres: { sha256: " \n\t " } }],
    ["qdrant.fileName", { qdrant: { fileName: " \n\t " } }],
    ["qdrant.sha256", { qdrant: { sha256: " \n\t " } }],
  ])(
    "rejects blank manifest %s before artifact checks",
    async (label, override) => {
      const fileExists = vi.fn().mockResolvedValue(true);
      const sha256File = vi.fn().mockResolvedValue("sha");
      const remoteReadTextFile = vi.fn().mockResolvedValue("{}");
      const remoteFileExists = vi.fn().mockResolvedValue(true);
      const remoteSha256File = vi.fn().mockResolvedValue("sha");

      await expect(
        verifyBackups({
          now: new Date("2026-03-29T20:00:00.000Z"),
          backupDir: "/backups",
          readDir: async () => ["manifest-20260329-1200.json"],
          readTextFile: async () =>
            JSON.stringify(mergeManifest(baseManifest(), override)),
          fileExists,
          sha256File,
          remoteReadTextFile,
          remoteFileExists,
          remoteSha256File,
        }),
      ).rejects.toThrow(
        `backup manifest ${label} must contain non-whitespace text`,
      );

      expect(fileExists).not.toHaveBeenCalled();
      expect(sha256File).not.toHaveBeenCalled();
      expect(remoteReadTextFile).not.toHaveBeenCalled();
      expect(remoteFileExists).not.toHaveBeenCalled();
      expect(remoteSha256File).not.toHaveBeenCalled();
    },
  );
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

describe("required backup shell environment guards", () => {
  const sideEffectMarkers = ["pg_dump:", "curl:", "ssh:", "scp:"];

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["whitespace", " \n\t "],
  ])("rejects %s BACKUP_DIR before command side effects", async (_label, backupDir) => {
    for (const scriptPath of [
      "scripts/backup-postgres.sh",
      "scripts/snapshot-qdrant.sh",
      "scripts/create-backup.sh",
    ]) {
      const result = await runBackupShellScript(scriptPath, {
        BACKUP_DIR: backupDir,
      });

      expect(result.ok).toBe(false);
      expect(result.stderr).toContain("BACKUP_DIR is required");
      for (const marker of sideEffectMarkers) {
        expect(result.log).not.toContain(marker);
      }
    }
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["whitespace", " \n\t "],
  ])("rejects %s DATABASE_URL before pg_dump or remote side effects", async (_label, databaseUrl) => {
    const result = await runBackupShellScript("scripts/backup-postgres.sh", {
      DATABASE_URL: databaseUrl,
    });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("DATABASE_URL is required");
    for (const marker of sideEffectMarkers) {
      expect(result.log).not.toContain(marker);
    }
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["whitespace", " \n\t "],
  ])("rejects %s QDRANT_URL before curl or remote side effects", async (_label, qdrantUrl) => {
    const result = await runBackupShellScript("scripts/snapshot-qdrant.sh", {
      QDRANT_URL: qdrantUrl,
    });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("QDRANT_URL is required");
    for (const marker of sideEffectMarkers) {
      expect(result.log).not.toContain(marker);
    }
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

  it("uses valid Qdrant snapshot response names unchanged", async () => {
    const result = await runBackupShellScript("scripts/snapshot-qdrant.sh", {
      STUB_QDRANT_SNAPSHOT_RESPONSE: JSON.stringify({
        result: { name: "snapshot-custom" },
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.log).toContain(
      "curl:-fsS http://qdrant.local:6333/collections/memory_chunks_v1/snapshots/snapshot-custom --output",
    );
  });

  it.each([
    ["missing", JSON.stringify({ result: {} })],
    ["null", JSON.stringify({ result: { name: null } })],
    ["number", JSON.stringify({ result: { name: 42 } })],
    ["object", JSON.stringify({ result: { name: { file: "snapshot-one" } } })],
    ["empty", JSON.stringify({ result: { name: "" } })],
    ["whitespace", JSON.stringify({ result: { name: " \n\t " } })],
  ])("rejects %s snapshot names before download or scp", async (_label, response) => {
    const result = await runBackupShellScript("scripts/snapshot-qdrant.sh", {
      STUB_QDRANT_SNAPSHOT_RESPONSE: response,
    });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("Snapshot name missing in Qdrant response");
    expect(result.log.trim().split("\n")).toEqual([
      "curl:-fsS -X POST http://qdrant.local:6333/collections/memory_chunks_v1/snapshots",
    ]);
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

describe("backup encryption key file shell guards", () => {
  it.each([
    "scripts/backup-postgres.sh",
    "scripts/snapshot-qdrant.sh",
    "scripts/create-backup.sh",
  ])("%s rejects whitespace-only BACKUP_ENCRYPTION_KEY_FILE", async (scriptPath) => {
    const script = await readFile(scriptPath, "utf8");

    expect(script).toContain(
      "BACKUP_ENCRYPTION_KEY_FILE must contain non-whitespace text",
    );
    expect(script).toContain("tr -d '[:space:]'");
  });

  it.each([
    ["empty", ""],
    ["whitespace", " \n\t "],
  ])(
    "rejects %s BACKUP_ENCRYPTION_KEY_FILE under sh -eu",
    async (_label, keyFile) => {
      for (const scriptPath of [
        "scripts/backup-postgres.sh",
        "scripts/snapshot-qdrant.sh",
        "scripts/create-backup.sh",
      ]) {
        const result = await runBackupShellScript(scriptPath, {
          BACKUP_ENCRYPTION_KEY_FILE: keyFile,
        });

        expect(result.ok).toBe(false);
        expect(result.stderr).toContain(
          "BACKUP_ENCRYPTION_KEY_FILE must contain non-whitespace text",
        );
        expect(result.log).not.toContain("ssh:");
        expect(result.log).not.toContain("scp:");
      }
    },
  );

  it("preserves valid BACKUP_ENCRYPTION_KEY_FILE values under sh -eu", async () => {
    const keyDir = await mkdtemp(path.join(os.tmpdir(), "akasha-backup-key-"));
    tempDirs.push(keyDir);
    const keyPath = path.join(keyDir, "data-key");
    await writeFile(keyPath, Buffer.alloc(32, 8));

    const result = await runBackupShellScript("scripts/create-backup.sh", {
      BACKUP_ENCRYPTION_KEY_FILE: keyPath,
    });

    expect(result.ok).toBe(true);
    const manifest = JSON.parse(
      await readFile(
        path.join(result.backupDir, "manifest-20260329-1200.json"),
        "utf8",
      ),
    );
    expect(manifest).toMatchObject({
      encryption: {
        algorithm: "AES-256-GCM",
        keySource: "BACKUP_ENCRYPTION_KEY_FILE",
        artifacts: ["postgres"],
      },
      postgres: {
        fileName: "postgres-20260329-1200.sql.gz.enc",
      },
    });
    await expect(
      exists(path.join(result.backupDir, "postgres-20260329-1200.sql.gz.enc")),
    ).resolves.toBe(true);
    await expect(
      exists(path.join(result.backupDir, "postgres-20260329-1200.sql.gz")),
    ).resolves.toBe(false);
    expect(result.log).toContain(`remote.example:${result.backupDir}/`);
  });

  it("rejects blank encrypted manifest artifact metadata before scp", async () => {
    const keyDir = await mkdtemp(path.join(os.tmpdir(), "akasha-backup-key-"));
    tempDirs.push(keyDir);
    const keyPath = path.join(keyDir, "data-key");
    await writeFile(keyPath, Buffer.alloc(32, 8));

    const result = await runBackupShellScript("scripts/create-backup.sh", {
      BACKUP_ENCRYPTION_KEY_FILE: keyPath,
      STUB_BLANK_POSTGRES_FILE_NAME: "1",
    });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain(
      "backup manifest postgres.fileName must contain non-whitespace text",
    );
    expect(result.log).toContain("ssh:");
    expect(result.log).not.toContain("scp:");
  });

  it("rejects missing encrypted Qdrant manifest artifacts before scp", async () => {
    const keyDir = await mkdtemp(path.join(os.tmpdir(), "akasha-backup-key-"));
    tempDirs.push(keyDir);
    const keyPath = path.join(keyDir, "data-key");
    await writeFile(keyPath, Buffer.alloc(32, 8));

    const result = await runBackupShellScript("scripts/create-backup.sh", {
      BACKUP_ENCRYPTION_KEY_FILE: keyPath,
      STUB_DROP_QDRANT: "1",
      VECTOR_BACKEND: "qdrant",
    });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain(
      "backup manifest qdrant.fileName must contain non-whitespace text",
    );
    expect(result.log).toContain("ssh:");
    expect(result.log).not.toContain("scp:");
  });

  it("rejects present-but-empty pgvector Qdrant manifest artifacts before scp", async () => {
    const keyDir = await mkdtemp(path.join(os.tmpdir(), "akasha-backup-key-"));
    tempDirs.push(keyDir);
    const keyPath = path.join(keyDir, "data-key");
    await writeFile(keyPath, Buffer.alloc(32, 8));

    const result = await runBackupShellScript("scripts/create-backup.sh", {
      BACKUP_ENCRYPTION_KEY_FILE: keyPath,
      STUB_EMPTY_QDRANT: "1",
      VECTOR_BACKEND: "pgvector",
    });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain(
      "backup manifest qdrant.fileName must contain non-whitespace text",
    );
    expect(result.log).toContain("ssh:");
    expect(result.log).not.toContain("scp:");
  });
});

describe("backup manifest writer shell guards", () => {
  it.each([
    ["array", "[]\n"],
    ["null", "null\n"],
  ])("rejects existing %s manifests before mutation", async (_label, manifestJson) => {
    for (const scriptPath of [
      "scripts/backup-postgres.sh",
      "scripts/snapshot-qdrant.sh",
      "scripts/create-backup.sh",
    ]) {
      const result = await runBackupShellScript(scriptPath, {
        STUB_EXISTING_MANIFEST: manifestJson,
        ...(scriptPath === "scripts/create-backup.sh"
          ? { STUB_CORRUPT_MANIFEST_AFTER_POSTGRES: "1" }
          : {}),
      });

      expect(result.ok).toBe(false);
      expect(result.stderr).toContain("backup manifest must be a JSON object");
    }
  });
});

async function runBackupShellScript(
  scriptPath: string,
  envOverrides: Record<string, string | undefined>,
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
    STUB_REAL_NODE: process.execPath,
    ...envOverrides,
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete env[key];
    }
  }
  if (
    envOverrides.STUB_EXISTING_MANIFEST !== undefined &&
    envOverrides.STUB_CORRUPT_MANIFEST_AFTER_POSTGRES !== "1"
  ) {
    await writeFile(
      path.join(backupDir, "manifest-20260329-1200.json"),
      envOverrides.STUB_EXISTING_MANIFEST,
    );
  }

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
      path.join(binDir, "node"),
      `#!/usr/bin/env sh
if [ "$#" -gt 0 ]; then
  exec "$STUB_REAL_NODE" "$@"
fi
script_file="$(mktemp)"
cat > "$script_file"
"$STUB_REAL_NODE" < "$script_file"
status="$?"
if [ "$status" -eq 0 ] &&
  [ "\${STUB_CORRUPT_MANIFEST_AFTER_POSTGRES:-}" = "1" ] &&
  grep -q 'manifest.postgres =' "$script_file"; then
  printf '%s' "\${STUB_EXISTING_MANIFEST:-[]}" > "\${BACKUP_DIR}/manifest-\${BACKUP_TIMESTAMP}.json"
fi
rm -f "$script_file"
exit "$status"
`,
    ),
    writeExecutable(
      path.join(binDir, "pg_dump"),
      "#!/usr/bin/env sh\nprintf 'pg_dump:%s\\n' \"$*\" >> \"$STUB_LOG\"\nprintf 'postgres dump bytes'\n",
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
elif [ "\${STUB_QDRANT_SNAPSHOT_RESPONSE+x}" = "x" ]; then
  printf '%s' "$STUB_QDRANT_SNAPSHOT_RESPONSE"
else
  printf '{"result":{"name":"snapshot-one"}}'
fi
`,
    ),
    writeExecutable(
      path.join(binDir, "ssh"),
      `#!/usr/bin/env sh
printf 'ssh:%s\\n' "$*" >> "$STUB_LOG"
if [ "\${STUB_BLANK_POSTGRES_FILE_NAME:-}" = "1" ]; then
  node - "\${BACKUP_DIR}/manifest-\${BACKUP_TIMESTAMP}.json" <<'NODE'
const fs = require("node:fs");
const manifestPath = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.postgres.fileName = " \\n\\t ";
fs.writeFileSync(manifestPath, \`\${JSON.stringify(manifest, null, 2)}\\n\`);
NODE
fi
if [ "\${STUB_DROP_QDRANT:-}" = "1" ]; then
  node - "\${BACKUP_DIR}/manifest-\${BACKUP_TIMESTAMP}.json" <<'NODE'
const fs = require("node:fs");
const manifestPath = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
delete manifest.qdrant;
fs.writeFileSync(manifestPath, \`\${JSON.stringify(manifest, null, 2)}\\n\`);
NODE
fi
if [ "\${STUB_EMPTY_QDRANT:-}" = "1" ]; then
  node - "\${BACKUP_DIR}/manifest-\${BACKUP_TIMESTAMP}.json" <<'NODE'
const fs = require("node:fs");
const manifestPath = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.qdrant = {};
fs.writeFileSync(manifestPath, \`\${JSON.stringify(manifest, null, 2)}\\n\`);
NODE
fi
`,
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
  includeQdrantManifestMetadata?: boolean;
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
  const includeQdrantMetadata =
    options.vectorBackend !== "pgvector" ||
    options.includeQdrantManifestMetadata === true;
  const manifestPayload = {
    createdAt: options.createdAt ?? "2026-03-29T12:00:00.000Z",
    ...(options.vectorBackend ? { vectorBackend: options.vectorBackend } : {}),
    postgres: {
      fileName: postgresFileName,
      sha256: sha256Text(postgresContent),
    },
    ...(includeQdrantMetadata
      ? {
          qdrant: {
            fileName: qdrantFileName,
            sha256: sha256Text(qdrantContent),
          },
        }
      : {}),
  };
  const manifest = JSON.stringify(manifestPayload, null, 2);

  const writes = [
    writeFile(path.join(localDir, postgresFileName), postgresContent),
    writeFile(path.join(localDir, manifestFileName), `${manifest}\n`),
    writeFile(path.join(remoteDir, postgresFileName), postgresContent),
    writeFile(path.join(remoteDir, manifestFileName), `${manifest}\n`),
  ];

  if (includeQdrantMetadata) {
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

type TestBackupManifest = {
  createdAt: string;
  vectorBackend?: "qdrant" | "pgvector";
  postgres: {
    fileName: string;
    sha256: string;
  };
  qdrant?: {
    fileName: string;
    sha256: string;
  };
};

type TestBackupManifestOverride = Partial<
  Omit<TestBackupManifest, "postgres" | "qdrant">
> & {
  postgres?: Partial<TestBackupManifest["postgres"]>;
  qdrant?: Partial<NonNullable<TestBackupManifest["qdrant"]>>;
};

function baseManifest(): TestBackupManifest {
  return {
    createdAt: "2026-03-29T12:00:00.000Z",
    postgres: {
      fileName: "postgres-20260329-1200.sql.gz",
      sha256: "postgres-sha",
    },
    qdrant: {
      fileName: "qdrant-20260329-1200.snapshot",
      sha256: "qdrant-sha",
    },
  };
}

function mergeManifest(
  manifest: TestBackupManifest,
  override: TestBackupManifestOverride,
): TestBackupManifest {
  const qdrant =
    override.qdrant === undefined
      ? manifest.qdrant
      : {
          fileName: override.qdrant.fileName ?? manifest.qdrant?.fileName ?? "",
          sha256: override.qdrant.sha256 ?? manifest.qdrant?.sha256 ?? "",
        };

  return {
    ...manifest,
    ...override,
    postgres: {
      ...manifest.postgres,
      ...override.postgres,
    },
    qdrant,
  };
}
