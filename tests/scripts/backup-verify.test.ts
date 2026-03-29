import { describe, expect, it } from "vitest";
import { verifyBackups } from "../../scripts/backup-verify.js";

describe("verifyBackups", () => {
  it("fails when the newest snapshot is older than 24 hours", async () => {
    await expect(
      verifyBackups({
        now: new Date("2026-03-30T00:00:00.000Z"),
        latestBackupAt: new Date("2026-03-28T00:00:00.000Z"),
        localArtifactsPresent: true,
        remoteArtifactsPresent: true,
        checksumsMatch: true,
      }),
    ).rejects.toThrow("latest successful backup is older than 24 hours");
  });
});
