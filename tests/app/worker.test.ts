import { describe, expect, it, vi } from "vitest";
import { runWorkerProcess } from "../../src/app/worker.js";
import type { Logger } from "../../src/logger.js";

describe("runWorkerProcess", () => {
  it("starts background workers in fail-fast mode", async () => {
    const startWorkers = vi.fn().mockRejectedValue(new Error("startup failed"));

    await expect(
      runWorkerProcess({
        logger: buildLogger(),
        startWorkers,
      }),
    ).rejects.toThrow("startup failed");

    expect(startWorkers).toHaveBeenCalledWith(
      expect.objectContaining({ failFast: true }),
    );
  });
});

function buildLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => buildLogger()),
  } as unknown as Logger;
}
