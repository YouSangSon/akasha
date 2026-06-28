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
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptFile,
  encryptManifestArtifacts,
  loadBackupEncryptionKeepPlaintextFromEnv,
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

  it("returns already-encrypted manifests without artifact work", async () => {
    const { backupDir, manifestPath, postgresFileName, qdrantFileName } =
      await createManifestFixture({
        postgres: {
          fileName: "postgres-20260626-1200.sql.gz.enc",
          sha256: "encrypted-pg-sha",
        },
        qdrant: {
          fileName: "qdrant-20260626-1200.snapshot.enc",
          sha256: "encrypted-qdrant-sha",
        },
        encryption: {
          algorithm: "AES-256-GCM",
          keySource: "BACKUP_ENCRYPTION_KEY_FILE",
          encryptedAt: "2026-06-26T12:30:00.000Z",
          artifacts: ["postgres", "qdrant"],
        },
      });
    const randomBytes = vi.fn((size: number) => Buffer.alloc(size, 3));

    const manifest = await encryptManifestArtifacts({
      backupDir,
      manifestPath,
      key: Buffer.alloc(32, 7),
      randomBytes,
    });

    expect(manifest.encryption).toMatchObject({
      algorithm: "AES-256-GCM",
      artifacts: ["postgres", "qdrant"],
    });
    expect(randomBytes).not.toHaveBeenCalled();
    expect(await exists(path.join(backupDir, postgresFileName))).toBe(true);
    expect(await exists(path.join(backupDir, qdrantFileName))).toBe(true);
    expect(await exists(path.join(backupDir, `${postgresFileName}.enc`))).toBe(false);
    expect(await exists(path.join(backupDir, `${qdrantFileName}.enc`))).toBe(false);
  });

  it.each([
    ["blank createdAt", "createdAt", { createdAt: " \n\t " }],
    ["non-string createdAt", "createdAt", { createdAt: 123 }],
    ["blank postgres.fileName", "postgres.fileName", { postgres: { fileName: " \n\t " } }],
    ["blank postgres.sha256", "postgres.sha256", { postgres: { sha256: " \n\t " } }],
    ["blank qdrant.fileName", "qdrant.fileName", { qdrant: { fileName: " \n\t " } }],
    ["blank qdrant.sha256", "qdrant.sha256", { qdrant: { sha256: " \n\t " } }],
    ["missing qdrant", "qdrant.fileName", { qdrant: undefined }],
    [
      "missing qdrant for explicit qdrant backend",
      "qdrant.fileName",
      { vectorBackend: "qdrant", qdrant: undefined },
    ],
    [
      "blank qdrant.metadataFileName",
      "qdrant.metadataFileName",
      { qdrant: { metadataFileName: " \n\t " } },
    ],
    [
      "blank qdrant.collectionName",
      "qdrant.collectionName",
      { qdrant: { collectionName: " \n\t " } },
    ],
  ] satisfies Array<[string, string, TestManifestOverride]>)(
    "rejects %s before artifact work",
    async (_case, label, override) => {
      const { backupDir, manifestPath, postgresFileName, qdrantFileName } =
        await createManifestFixture(override);
      const randomBytes = vi.fn((size: number) => Buffer.alloc(size, 3));

      await expect(
        encryptManifestArtifacts({
          backupDir,
          manifestPath,
          key: Buffer.alloc(32, 7),
          randomBytes,
        }),
      ).rejects.toThrow(
        `backup manifest ${label} must contain non-whitespace text`,
      );

      expect(randomBytes).not.toHaveBeenCalled();
      expect(await exists(path.join(backupDir, postgresFileName))).toBe(true);
      expect(await exists(path.join(backupDir, qdrantFileName))).toBe(true);
      expect(await exists(path.join(backupDir, `${postgresFileName}.enc`))).toBe(false);
      expect(await exists(path.join(backupDir, `${qdrantFileName}.enc`))).toBe(false);
    },
  );

  it("allows pgvector manifests without Qdrant metadata", async () => {
    const { backupDir, manifestPath, postgresFileName, qdrantFileName } =
      await createManifestFixture({
        vectorBackend: "pgvector",
        qdrant: undefined,
      });

    const manifest = await encryptManifestArtifacts({
      backupDir,
      manifestPath,
      key: Buffer.alloc(32, 7),
      randomBytes: (size) => Buffer.alloc(size, 3),
    });

    expect(manifest.vectorBackend).toBe("pgvector");
    expect(manifest.encryption?.artifacts).toEqual(["postgres"]);
    expect(manifest.postgres.fileName).toBe(`${postgresFileName}.enc`);
    expect(manifest.qdrant).toBeUndefined();
    expect(await exists(path.join(backupDir, qdrantFileName))).toBe(true);
    expect(await exists(path.join(backupDir, `${qdrantFileName}.enc`))).toBe(false);
  });

  it("rejects unsupported vector backends before artifact work", async () => {
    const { backupDir, manifestPath, postgresFileName, qdrantFileName } =
      await createManifestFixture({
        vectorBackend: "sqlite" as never,
      });
    const randomBytes = vi.fn((size: number) => Buffer.alloc(size, 3));

    await expect(
      encryptManifestArtifacts({
        backupDir,
        manifestPath,
        key: Buffer.alloc(32, 7),
        randomBytes,
      }),
    ).rejects.toThrow(
      "backup manifest vectorBackend must be qdrant or pgvector",
    );

    expect(randomBytes).not.toHaveBeenCalled();
    expect(await exists(path.join(backupDir, postgresFileName))).toBe(true);
    expect(await exists(path.join(backupDir, qdrantFileName))).toBe(true);
    expect(await exists(path.join(backupDir, `${postgresFileName}.enc`))).toBe(false);
    expect(await exists(path.join(backupDir, `${qdrantFileName}.enc`))).toBe(false);
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

  it("defaults unset BACKUP_ENCRYPTION_KEEP_PLAINTEXT to false", () => {
    expect(loadBackupEncryptionKeepPlaintextFromEnv({})).toBe(false);
  });

  it.each([
    ["true", true],
    ["false", false],
    [" TRUE ", true],
    [" False ", false],
  ] satisfies Array<[string, boolean]>)(
    "parses BACKUP_ENCRYPTION_KEEP_PLAINTEXT=%s",
    (value, expected) => {
      expect(
        loadBackupEncryptionKeepPlaintextFromEnv({
          BACKUP_ENCRYPTION_KEEP_PLAINTEXT: value,
        }),
      ).toBe(expected);
    },
  );

  it.each(["", " \n\t ", "yes", "1", "0", "maybe"])(
    "rejects malformed BACKUP_ENCRYPTION_KEEP_PLAINTEXT=%j",
    (value) => {
      expect(() =>
        loadBackupEncryptionKeepPlaintextFromEnv({
          BACKUP_ENCRYPTION_KEEP_PLAINTEXT: value,
        }),
      ).toThrow(
        "BACKUP_ENCRYPTION_KEEP_PLAINTEXT must be true or false when set",
      );
    },
  );
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

type TestManifestPayload = {
  createdAt: unknown;
  vectorBackend: "qdrant" | "pgvector";
  postgres: Record<string, unknown>;
  qdrant?: Record<string, unknown>;
  encryption?: Record<string, unknown>;
};

type TestManifestOverride = Partial<
  Omit<TestManifestPayload, "postgres" | "qdrant">
> & {
  postgres?: Record<string, unknown>;
  qdrant?: Record<string, unknown> | undefined;
};

async function createManifestFixture(
  override: TestManifestOverride = {},
): Promise<{
  backupDir: string;
  manifestPath: string;
  postgresFileName: string;
  qdrantFileName: string;
}> {
  const backupDir = await mkdtemp(path.join(os.tmpdir(), "akasha-backup-encryption-"));
  tempDirs.push(backupDir);
  const postgresPlain = "postgres logical dump";
  const qdrantPlain = "qdrant snapshot bytes";
  const postgresFileName = "postgres-20260626-1200.sql.gz";
  const qdrantFileName = "qdrant-20260626-1200.snapshot";
  const manifestPath = path.join(backupDir, "manifest-20260626-1200.json");

  await writeFile(path.join(backupDir, postgresFileName), postgresPlain);
  await writeFile(path.join(backupDir, qdrantFileName), qdrantPlain);
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      mergeManifestPayload(
        baseManifestPayload(postgresPlain, qdrantPlain),
        override,
      ),
      null,
      2,
    )}\n`,
  );

  return {
    backupDir,
    manifestPath,
    postgresFileName,
    qdrantFileName,
  };
}

function baseManifestPayload(
  postgresPlain: string,
  qdrantPlain: string,
): TestManifestPayload {
  return {
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
  };
}

function mergeManifestPayload(
  manifest: TestManifestPayload,
  override: TestManifestOverride,
): TestManifestPayload {
  const qdrant =
    override.qdrant === undefined
      ? "qdrant" in override
        ? undefined
        : manifest.qdrant
      : {
          ...(manifest.qdrant ?? {}),
          ...override.qdrant,
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
