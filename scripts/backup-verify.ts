import fs from "node:fs";
import fsp from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

type BackupManifest = {
  createdAt: string;
  vectorBackend?: "qdrant" | "pgvector";
  postgres: {
    fileName: string;
    sha256: string;
  };
  qdrant?: {
    fileName: string;
    sha256: string;
    metadataFileName?: string;
    collectionName?: string;
  };
};

export type VerifyBackupsInput = {
  now: Date;
  backupDir: string;
  readDir?: (directory: string) => Promise<string[]>;
  readTextFile?: (filePath: string) => Promise<string>;
  fileExists?: (filePath: string) => Promise<boolean>;
  sha256File?: (filePath: string) => Promise<string>;
  remoteReadTextFile: (fileName: string) => Promise<string>;
  remoteFileExists: (fileName: string) => Promise<boolean>;
  remoteSha256File: (fileName: string) => Promise<string>;
};

export async function verifyBackups(
  input: VerifyBackupsInput,
): Promise<{ manifestFileName: string; manifest: BackupManifest }> {
  const readDir = input.readDir ?? ((directory) => fsp.readdir(directory));
  const readTextFile =
    input.readTextFile ?? ((filePath) => fsp.readFile(filePath, "utf8"));
  const fileExists =
    input.fileExists ??
    (async (filePath) => {
      try {
        await fsp.access(filePath, fs.constants.F_OK);
        return true;
      } catch {
        return false;
      }
    });
  const sha256File = input.sha256File ?? computeSha256;
  const manifestFileName = await findLatestManifestFile(input.backupDir, readDir);
  const manifestPath = path.join(input.backupDir, manifestFileName);
  const manifest = parseManifest(await readTextFile(manifestPath));
  const ageMs = input.now.getTime() - new Date(manifest.createdAt).getTime();
  const maxAgeMs = 24 * 60 * 60 * 1000;

  if (Number.isNaN(ageMs)) {
    throw new Error("latest successful backup manifest has an invalid createdAt");
  }

  if (ageMs > maxAgeMs) {
    throw new Error("latest successful backup is older than 24 hours");
  }

  await verifyLocalArtifact({
    backupDir: input.backupDir,
    artifact: manifest.postgres,
    artifactLabel: "Postgres dump",
    fileExists,
    sha256File,
  });
  if (manifest.qdrant) {
    await verifyLocalArtifact({
      backupDir: input.backupDir,
      artifact: manifest.qdrant,
      artifactLabel: "Qdrant snapshot",
      fileExists,
      sha256File,
    });
  }

  const remoteManifest = parseManifest(
    await input.remoteReadTextFile(manifestFileName),
  );

  if (!manifestsEqual(manifest, remoteManifest)) {
    throw new Error("off-box backup manifest does not match the latest local manifest");
  }

  await verifyRemoteArtifact({
    artifact: manifest.postgres,
    artifactLabel: "Postgres dump",
    remoteFileExists: input.remoteFileExists,
    remoteSha256File: input.remoteSha256File,
  });
  if (manifest.qdrant) {
    await verifyRemoteArtifact({
      artifact: manifest.qdrant,
      artifactLabel: "Qdrant snapshot",
      remoteFileExists: input.remoteFileExists,
      remoteSha256File: input.remoteSha256File,
    });
  }

  return {
    manifestFileName,
    manifest,
  };
}

async function verifyLocalArtifact(input: {
  backupDir: string;
  artifact: { fileName: string; sha256: string };
  artifactLabel: string;
  fileExists: (filePath: string) => Promise<boolean>;
  sha256File: (filePath: string) => Promise<string>;
}) {
  const filePath = path.join(input.backupDir, input.artifact.fileName);

  if (!(await input.fileExists(filePath))) {
    throw new Error(`latest local ${input.artifactLabel.toLowerCase()} is missing`);
  }

  const actualSha = await input.sha256File(filePath);

  if (actualSha !== input.artifact.sha256) {
    throw new Error(`${input.artifactLabel} checksum does not match the manifest`);
  }
}

async function verifyRemoteArtifact(input: {
  artifact: { fileName: string; sha256: string };
  artifactLabel: string;
  remoteFileExists: (fileName: string) => Promise<boolean>;
  remoteSha256File: (fileName: string) => Promise<string>;
}) {
  if (!(await input.remoteFileExists(input.artifact.fileName))) {
    throw new Error(`latest off-box ${input.artifactLabel.toLowerCase()} is missing`);
  }

  const remoteSha = await input.remoteSha256File(input.artifact.fileName);

  if (remoteSha !== input.artifact.sha256) {
    throw new Error(`off-box ${input.artifactLabel.toLowerCase()} checksum does not match the manifest`);
  }
}

async function findLatestManifestFile(
  backupDir: string,
  readDir: (directory: string) => Promise<string[]>,
): Promise<string> {
  const files = await readDir(backupDir);
  const manifestFile = files
    .filter((fileName) => /^manifest-\d{8}-\d{4}\.json$/.test(fileName))
    .sort()
    .at(-1);

  if (!manifestFile) {
    throw new Error("no backup manifest found in BACKUP_DIR");
  }

  return manifestFile;
}

function parseManifest(raw: string): BackupManifest {
  const parsed = JSON.parse(raw) as Partial<BackupManifest>;

  if (
    !parsed.createdAt ||
    !parsed.postgres?.fileName ||
    !parsed.postgres?.sha256
  ) {
    throw new Error("backup manifest is missing required artifact metadata");
  }

  if (
    parsed.vectorBackend !== "pgvector" &&
    (!parsed.qdrant?.fileName || !parsed.qdrant?.sha256)
  ) {
    throw new Error("backup manifest is missing required Qdrant artifact metadata");
  }

  return parsed as BackupManifest;
}

function manifestsEqual(left: BackupManifest, right: BackupManifest): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function computeSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = fs.createReadStream(filePath);

  stream.on("data", (chunk) => {
    hash.update(chunk);
  });

  await once(stream, "end");

  return hash.digest("hex");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function runRemote(host: string, command: string): Promise<string> {
  const result = await execFileAsync(
    "ssh",
    [host, "sh", "-lc", command],
    { encoding: "utf8" },
  );

  return result.stdout.trim();
}

async function main() {
  const backupDir = requireEnv("BACKUP_DIR");
  const targetHost = requireEnv("BACKUP_TARGET_HOST");
  const targetDir = process.env.BACKUP_TARGET_DIR ?? backupDir;
  const remotePath = (fileName: string) => path.posix.join(targetDir, fileName);

  await verifyBackups({
    now: new Date(),
    backupDir,
    remoteReadTextFile(fileName) {
      return runRemote(targetHost, `cat ${shellQuote(remotePath(fileName))}`);
    },
    async remoteFileExists(fileName) {
      try {
        await runRemote(
          targetHost,
          `test -f ${shellQuote(remotePath(fileName))} && printf ok`,
        );
        return true;
      } catch {
        return false;
      }
    },
    remoteSha256File(fileName) {
      return runRemote(
        targetHost,
        `if command -v sha256sum >/dev/null 2>&1; then sha256sum ${shellQuote(remotePath(fileName))} | awk '{print $1}'; else shasum -a 256 ${shellQuote(remotePath(fileName))} | awk '{print $1}'; fi`,
      );
    },
  });

  console.log("backup verification passed");
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
