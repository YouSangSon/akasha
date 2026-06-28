import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

const MAGIC = "AKASHA-BACKUP-ENC v1";
const AUTH_TAG_BYTES = 16;

type BackupArtifact = {
  fileName: string;
  sha256: string;
};

type BackupManifest = {
  createdAt: string;
  vectorBackend?: "qdrant" | "pgvector";
  postgres: BackupArtifact;
  qdrant?: BackupArtifact & {
    metadataFileName?: string;
    collectionName?: string;
  };
  encryption?: {
    algorithm: "AES-256-GCM";
    keySource: "BACKUP_ENCRYPTION_KEY_FILE";
    encryptedAt: string;
    artifacts: string[];
  };
};

export type EncryptManifestArtifactsInput = {
  backupDir: string;
  manifestPath: string;
  key: Buffer;
  now?: Date;
  keepPlaintext?: boolean;
  randomBytes?: (size: number) => Buffer;
};

export async function encryptManifestArtifacts(
  input: EncryptManifestArtifactsInput,
): Promise<BackupManifest> {
  const manifest = parseManifest(
    await fsp.readFile(input.manifestPath, "utf8"),
  );

  if (manifest.encryption) {
    return manifest;
  }

  const encryptedArtifacts: string[] = [];
  manifest.postgres = await encryptManifestArtifact({
    backupDir: input.backupDir,
    artifact: manifest.postgres,
    label: "postgres",
    key: input.key,
    keepPlaintext: input.keepPlaintext ?? false,
    randomBytes: input.randomBytes,
  });
  encryptedArtifacts.push("postgres");

  if (manifest.qdrant) {
    manifest.qdrant = {
      ...manifest.qdrant,
      ...(await encryptManifestArtifact({
        backupDir: input.backupDir,
        artifact: manifest.qdrant,
        label: "qdrant",
        key: input.key,
        keepPlaintext: input.keepPlaintext ?? false,
        randomBytes: input.randomBytes,
      })),
    };
    encryptedArtifacts.push("qdrant");
  }

  manifest.encryption = {
    algorithm: "AES-256-GCM",
    keySource: "BACKUP_ENCRYPTION_KEY_FILE",
    encryptedAt: (input.now ?? new Date()).toISOString(),
    artifacts: encryptedArtifacts,
  };

  await fsp.writeFile(input.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function parseManifest(raw: string): BackupManifest {
  const parsed = JSON.parse(raw) as Partial<BackupManifest> | null;
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("backup manifest must be a JSON object");
  }

  const vectorBackend = optionalManifestVectorBackend(parsed.vectorBackend);
  const createdAt = requireManifestText(parsed.createdAt, "createdAt");
  const postgresFileName = requireManifestText(
    parsed.postgres?.fileName,
    "postgres.fileName",
  );
  const postgresSha256 = requireManifestText(
    parsed.postgres?.sha256,
    "postgres.sha256",
  );

  let qdrant: BackupManifest["qdrant"];
  if (parsed.qdrant !== undefined || vectorBackend !== "pgvector") {
    const metadataFileName = optionalManifestText(
      parsed.qdrant?.metadataFileName,
      "qdrant.metadataFileName",
    );
    const collectionName = optionalManifestText(
      parsed.qdrant?.collectionName,
      "qdrant.collectionName",
    );

    qdrant = {
      ...(parsed.qdrant ?? {}),
      fileName: requireManifestText(
        parsed.qdrant?.fileName,
        "qdrant.fileName",
      ),
      sha256: requireManifestText(parsed.qdrant?.sha256, "qdrant.sha256"),
      ...(metadataFileName !== undefined ? { metadataFileName } : {}),
      ...(collectionName !== undefined ? { collectionName } : {}),
    };
  }

  return {
    ...parsed,
    ...(vectorBackend !== undefined ? { vectorBackend } : {}),
    createdAt,
    postgres: {
      ...(parsed.postgres ?? {}),
      fileName: postgresFileName,
      sha256: postgresSha256,
    },
    ...(qdrant !== undefined ? { qdrant } : {}),
  };
}

function optionalManifestVectorBackend(
  value: unknown,
): BackupManifest["vectorBackend"] {
  if (value === undefined) {
    return undefined;
  }
  if (value === "qdrant" || value === "pgvector") {
    return value;
  }
  throw new Error("backup manifest vectorBackend must be qdrant or pgvector");
}

function requireManifestText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`backup manifest ${name} must contain non-whitespace text`);
  }
  return value;
}

function optionalManifestText(
  value: unknown,
  name: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireManifestText(value, name);
}

async function encryptManifestArtifact(input: {
  backupDir: string;
  artifact: BackupArtifact;
  label: string;
  key: Buffer;
  keepPlaintext: boolean;
  randomBytes?: (size: number) => Buffer;
}): Promise<BackupArtifact> {
  const plainPath = path.join(input.backupDir, input.artifact.fileName);
  const encryptedFileName = `${input.artifact.fileName}.enc`;
  const encryptedPath = path.join(input.backupDir, encryptedFileName);

  await encryptFile({
    inputPath: plainPath,
    outputPath: encryptedPath,
    key: input.key,
    randomBytes: input.randomBytes,
  });
  const sha256 = await sha256File(encryptedPath);
  await fsp.writeFile(`${encryptedPath}.sha256`, `${sha256}  ${encryptedFileName}\n`);

  if (!input.keepPlaintext) {
    await fsp.rm(plainPath, { force: true });
    await fsp.rm(`${plainPath}.sha256`, { force: true });
  }

  return {
    fileName: encryptedFileName,
    sha256,
  };
}

export async function encryptFile(input: {
  inputPath: string;
  outputPath: string;
  key: Buffer;
  randomBytes?: (size: number) => Buffer;
}): Promise<void> {
  validateEncryptionKey(input.key);
  const iv = (input.randomBytes ?? randomBytes)(12);
  const cipher = createCipheriv("aes-256-gcm", input.key, iv);
  const output = fs.createWriteStream(input.outputPath, { flags: "wx" });
  const header = `${MAGIC}\n${JSON.stringify({
    algorithm: "AES-256-GCM",
    iv: iv.toString("base64"),
  })}\n`;

  output.write(header);
  await pipeline(fs.createReadStream(input.inputPath), cipher, output, {
    end: false,
  });
  output.end(cipher.getAuthTag());
  await once(output, "close");
}

export async function decryptFile(input: {
  inputPath: string;
  outputPath: string;
  key: Buffer;
}): Promise<void> {
  validateEncryptionKey(input.key);
  const encrypted = await fsp.readFile(input.inputPath);
  const firstNewline = encrypted.indexOf(0x0a);
  const secondNewline = encrypted.indexOf(0x0a, firstNewline + 1);
  if (
    firstNewline === -1 ||
    secondNewline === -1 ||
    encrypted.slice(0, firstNewline).toString("utf8") !== MAGIC
  ) {
    throw new Error("encrypted backup artifact has an invalid header");
  }

  const header = JSON.parse(
    encrypted.slice(firstNewline + 1, secondNewline).toString("utf8"),
  ) as { algorithm?: string; iv?: string };
  if (header.algorithm !== "AES-256-GCM" || !header.iv) {
    throw new Error("encrypted backup artifact has unsupported metadata");
  }

  const tagStart = encrypted.length - AUTH_TAG_BYTES;
  if (tagStart <= secondNewline) {
    throw new Error("encrypted backup artifact is truncated");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    input.key,
    Buffer.from(header.iv, "base64"),
  );
  decipher.setAuthTag(encrypted.slice(tagStart));

  await pipeline(
    Readable.from([encrypted.slice(secondNewline + 1, tagStart)]),
    decipher,
    fs.createWriteStream(input.outputPath, { flags: "wx" }),
  );
}

export async function loadBackupEncryptionKeyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Buffer | null> {
  const keyFile = env.BACKUP_ENCRYPTION_KEY_FILE;
  if (keyFile === undefined) {
    return null;
  }

  const trimmedKeyFile = keyFile.trim();
  if (trimmedKeyFile.length === 0) {
    throw new Error("BACKUP_ENCRYPTION_KEY_FILE must contain non-whitespace text");
  }

  return parseEncryptionKey(await fsp.readFile(trimmedKeyFile));
}

export function parseEncryptionKey(raw: Buffer): Buffer {
  const text = raw.toString("utf8").trim();
  const key =
    /^[0-9a-f]{64}$/i.test(text)
      ? Buffer.from(text, "hex")
      : maybeBase64Key(text) ?? raw;
  validateEncryptionKey(key);
  return key;
}

function maybeBase64Key(value: string): Buffer | null {
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.length === 32 ? decoded : null;
  } catch {
    return null;
  }
}

function validateEncryptionKey(key: Buffer): void {
  if (key.length !== 32) {
    throw new Error("BACKUP_ENCRYPTION_KEY_FILE must contain a 32-byte key (hex, base64, or raw bytes)");
  }
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = fs.createReadStream(filePath);
  stream.on("data", (chunk) => {
    hash.update(chunk);
  });
  await once(stream, "end");
  return hash.digest("hex");
}

async function main() {
  const command = process.argv[2];
  const key = await loadBackupEncryptionKeyFromEnv();

  if (!key) {
    throw new Error("BACKUP_ENCRYPTION_KEY_FILE is required");
  }

  if (command === "encrypt-manifest") {
    const backupDir = requireEnv("BACKUP_DIR");
    const manifestPath = requireEnv("BACKUP_MANIFEST_PATH");
    await encryptManifestArtifacts({
      backupDir,
      manifestPath,
      key,
      keepPlaintext: process.env.BACKUP_ENCRYPTION_KEEP_PLAINTEXT === "true",
    });
    return;
  }

  if (command === "decrypt-file") {
    const inputPath = requireEnv("BACKUP_ENCRYPTED_INPUT");
    const outputPath = requireEnv("BACKUP_DECRYPTED_OUTPUT");
    await decryptFile({ inputPath, outputPath, key });
    return;
  }

  throw new Error("Usage: backup-encryption encrypt-manifest | decrypt-file");
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
