import { describe, expect, it, vi } from "vitest";
import { runRestoreSmoke } from "../../scripts/restore-smoke.js";

describe("runRestoreSmoke", () => {
  it("restores Postgres and Qdrant, then checks one search and one context pack", async () => {
    const exec = vi.fn().mockResolvedValue(undefined);
    const callSearch = vi.fn().mockResolvedValue([{ id: 12 }]);
    const callPack = vi.fn().mockResolvedValue({ ok: true });

    await runRestoreSmoke({
      exec,
      callSearch,
      callPack,
    });

    expect(exec).toHaveBeenCalledWith("docker", [
      "compose",
      "-p",
      "restore-smoke",
      "up",
      "-d",
    ]);
    expect(callSearch).toHaveBeenCalledTimes(1);
    expect(callPack).toHaveBeenCalledTimes(1);
  });
});
