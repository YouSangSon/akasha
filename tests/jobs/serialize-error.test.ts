import { describe, expect, it, vi, afterEach } from "vitest";
import { createIngestJobRepository } from "../../src/jobs/ingest-job-repository.js";
import type { IngestJob } from "../../src/types.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function makeValidJobRow(): IngestJob {
  return {
    id: 1,
    memoryRecordId: 42,
    organizationId: "default",
    status: "failed",
    attempts: 1,
    lastError: null,
    qdrantStatus: "pending",
    qdrantAttempts: 0,
    qdrantNextRetryAt: null,
    qdrantLastError: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("serializeError (via markFailed)", () => {
  it("stores error.message, not the stack, in the DB", async () => {
    let capturedParams: unknown[] | undefined;

    const fakePool = {
      query: vi.fn().mockImplementation((_sql: string, params: unknown[]) => {
        capturedParams = params;
        return Promise.resolve({ rows: [makeValidJobRow()] });
      }),
    };

    const jobs = createIngestJobRepository(fakePool as never);
    const err = new Error("something went wrong");
    // Ensure the error has a stack (node always sets one)
    expect(err.stack).toBeDefined();

    await jobs.markFailed(1, err);

    // params[1] is the serialized error stored in last_error column
    const storedError = capturedParams?.[1] as string;
    expect(storedError).toBe("something went wrong");
    expect(storedError).not.toContain("at ");
  });

  it("stores String(error) for non-Error values", async () => {
    let capturedParams: unknown[] | undefined;

    const fakePool = {
      query: vi.fn().mockImplementation((_sql: string, params: unknown[]) => {
        capturedParams = params;
        return Promise.resolve({ rows: [makeValidJobRow()] });
      }),
    };

    const jobs = createIngestJobRepository(fakePool as never);
    await jobs.markFailed(1, "timeout exceeded");

    const storedError = capturedParams?.[1] as string;
    expect(storedError).toBe("timeout exceeded");
  });
});
