import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import {
  access,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  decryptFile,
  encryptManifestArtifacts,
  loadBackupEncryptionKeyFromEnv,
  parseEncryptionKey,
} from "../../scripts/backup-encryption.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("backup encryption", () => {
  it("encrypts manifest artifacts and rewrites checksums to ciphertext", async () => {
    const backupDir = await mkdtemp(path.join(os.tmpdir(), "akasha-backup-encryption-"));
    tempDirs.push(backupDir);
    const postgresPlain = "postgres logical dump";
    const qdrantPlain = "qdrant snapshot bytes";
    const manifestPath = path.join(backupDir, "manifest-20260626-1200.json");
    await writeFile(path.join(backupDir, "postgres-20260626-1200.sql.gz"), postgresPlain);
    await writeFile(path.join(backupDir, "qdrant-20260626-1200.snapshot"), qdrantPlain);
    await writeFile(path.join(backupDir, "qdrant-memory_chunks_v1-20260626-1200.json"), "{}\n");
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          createdAt: "2026-06-26T12:00:00.000Z",
          vectorBackend: "qdrant",
          postgres: {
            fileName: "postgres-20260626-1200.sql.gz",
            sha256: sha256Text(postgresPlain),
          },
          qdrant: {
            fileName: "qdrant-20260626-1200.snapshot",
            sha256: sha256Text(qdrantPlain),
            metadataFileName: "qdrant-memory_chunks_v1-20260626-1200.json",
            collectionName: "memory_chunks_v1",
          },
        },
        null,
        2,
      )}\n`,
    );
    const key = Buffer.alloc(32, 7);

    const manifest = await encryptManifestArtifacts({
      backupDir,
      manifestPath,
      key,
      now: new Date("2026-06-26T12:30:00.000Z"),
      randomBytes: (size) => Buffer.alloc(size, 3),
    });

    expect(manifest.encryption).toEqual({
      algorithm: "AES-256-GCM",
      keySource: "BACKUP_ENCRYPTION_KEY_FILE",
      encryptedAt: "2026-06-26T12:30:00.000Z",
      artifacts: ["postgres", "qdrant"],
    });
    expect(manifest.postgres.fileName).toBe("postgres-20260626-1200.sql.gz.enc");
    expect(manifest.qdrant?.fileName).toBe("qdrant-20260626-1200.snapshot.enc");
    expect(await exists(path.join(backupDir, "postgres-20260626-1200.sql.gz"))).toBe(false);
    expect(await exists(path.join(backupDir, "qdrant-20260626-1200.snapshot"))).toBe(false);

    const encryptedPostgresPath = path.join(backupDir, manifest.postgres.fileName);
    const encryptedQdrantPath = path.join(backupDir, manifest.qdrant!.fileName);
    expect(manifest.postgres.sha256).toBe(await sha256File(encryptedPostgresPath));
    expect(manifest.qdrant?.sha256).toBe(await sha256File(encryptedQdrantPath));
    expect((await readFile(encryptedPostgresPath, "utf8")).startsWith("AKASHA-BACKUP-ENC v1\n")).toBe(true);

    const restoredPostgres = path.join(backupDir, "postgres.restored.sql.gz");
    const restoredQdrant = path.join(backupDir, "qdrant.restored.snapshot");
    await decryptFile({
      inputPath: encryptedPostgresPath,
      outputPath: restoredPostgres,
      key,
    });
    await decryptFile({
      inputPath: encryptedQdrantPath,
      outputPath: restoredQdrant,
      key,
    });

    expect(await readFile(restoredPostgres, "utf8")).toBe(postgresPlain);
    expect(await readFile(restoredQdrant, "utf8")).toBe(qdrantPlain);
    expect((await stat(path.join(backupDir, "qdrant-memory_chunks_v1-20260626-1200.json"))).isFile()).toBe(true);
  });

  it("parses hex, base64, and raw 32-byte data keys", () => {
    const raw = Buffer.alloc(32, 1);

    expect(parseEncryptionKey(Buffer.from(raw.toString("hex")))).toEqual(raw);
    expect(parseEncryptionKey(Buffer.from(raw.toString("base64")))).toEqual(raw);
    expect(parseEncryptionKey(raw)).toEqual(raw);
  });

  it("omits unset BACKUP_ENCRYPTION_KEY_FILE", async () => {
    await expect(loadBackupEncryptionKeyFromEnv({})).resolves.toBeNull();
  });

  it("trims BACKUP_ENCRYPTION_KEY_FILE before reading the key", async () => {
    const backupDir = await mkdtemp(path.join(os.tmpdir(), "akasha-backup-encryption-"));
    tempDirs.push(backupDir);
    const keyPath = path.join(backupDir, "data-key");
    const key = Buffer.alloc(32, 2);
    await writeFile(keyPath, key);

    await expect(
      loadBackupEncryptionKeyFromEnv({
        BACKUP_ENCRYPTION_KEY_FILE: ` ${keyPath} `,
      }),
    ).resolves.toEqual(key);
  });

  it("rejects whitespace-only BACKUP_ENCRYPTION_KEY_FILE", async () => {
    await expect(
      loadBackupEncryptionKeyFromEnv({
        BACKUP_ENCRYPTION_KEY_FILE: " \n\t ",
      }),
    ).rejects.toThrow(
      "BACKUP_ENCRYPTION_KEY_FILE must contain non-whitespace text",
    );
  });
});

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
