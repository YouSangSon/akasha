import { pathToFileURL } from "node:url";

export type VerifyBackupsInput = {
  now: Date;
  latestBackupAt: Date;
  localArtifactsPresent: boolean;
  remoteArtifactsPresent: boolean;
  checksumsMatch: boolean;
};

export async function verifyBackups(input: VerifyBackupsInput) {
  const ageMs = input.now.getTime() - input.latestBackupAt.getTime();
  const maxAgeMs = 24 * 60 * 60 * 1000;

  if (!input.localArtifactsPresent) {
    throw new Error("latest local backup artifacts are missing");
  }

  if (!input.remoteArtifactsPresent) {
    throw new Error("latest off-box backup artifacts are missing");
  }

  if (!input.checksumsMatch) {
    throw new Error("backup checksums do not match");
  }

  if (ageMs > maxAgeMs) {
    throw new Error("latest successful backup is older than 24 hours");
  }
}

function parseBoolean(value: string | undefined, name: string): boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`${name} must be set to true or false`);
}

function parseDate(value: string | undefined, name: string): Date {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${name} must be a valid ISO timestamp`);
  }

  return parsed;
}

async function main() {
  await verifyBackups({
    now: parseDate(process.env.BACKUP_VERIFY_NOW ?? new Date().toISOString(), "BACKUP_VERIFY_NOW"),
    latestBackupAt: parseDate(process.env.LATEST_BACKUP_AT, "LATEST_BACKUP_AT"),
    localArtifactsPresent: parseBoolean(process.env.LOCAL_ARTIFACTS_PRESENT, "LOCAL_ARTIFACTS_PRESENT"),
    remoteArtifactsPresent: parseBoolean(process.env.REMOTE_ARTIFACTS_PRESENT, "REMOTE_ARTIFACTS_PRESENT"),
    checksumsMatch: parseBoolean(process.env.CHECKSUMS_MATCH, "CHECKSUMS_MATCH"),
  });

  console.log("backup verification passed");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
