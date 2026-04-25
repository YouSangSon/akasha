import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { verifyBackups } from "../../scripts/backup-verify.js";

const tempDirs: string[] = [];

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

async function createBackupFixture(options: { createdAt?: string } = {}) {
  const localDir = await mkdtemp(path.join(os.tmpdir(), "developer-memory-os-backup-local-"));
  const remoteDir = await mkdtemp(path.join(os.tmpdir(), "developer-memory-os-backup-remote-"));
  tempDirs.push(localDir, remoteDir);

  const postgresContent = "postgres backup contents";
  const qdrantContent = "qdrant snapshot contents";
  const postgresFileName = "postgres-20260329-1200.sql.gz";
  const qdrantFileName = "qdrant-20260329-1200.snapshot";
  const manifestFileName = "manifest-20260329-1200.json";
  const manifest = JSON.stringify(
    {
      createdAt: options.createdAt ?? "2026-03-29T12:00:00.000Z",
      postgres: {
        fileName: postgresFileName,
        sha256: sha256Text(postgresContent),
      },
      qdrant: {
        fileName: qdrantFileName,
        sha256: sha256Text(qdrantContent),
      },
    },
    null,
    2,
  );

  await Promise.all([
    writeFile(path.join(localDir, postgresFileName), postgresContent),
    writeFile(path.join(localDir, qdrantFileName), qdrantContent),
    writeFile(path.join(localDir, manifestFileName), `${manifest}\n`),
    writeFile(path.join(remoteDir, postgresFileName), postgresContent),
    writeFile(path.join(remoteDir, qdrantFileName), qdrantContent),
    writeFile(path.join(remoteDir, manifestFileName), `${manifest}\n`),
  ]);

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
