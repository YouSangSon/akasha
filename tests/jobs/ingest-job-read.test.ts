import { describe, expect, it, vi } from "vitest";
import { createIngestJobRepository } from "../../src/jobs/ingest-job-repository.js";

function row() {
  return {
    id: "91", memory_record_id: "10", organization_id: "org-a",
    status: "pending", attempts: "0", last_error: null,
    qdrant_status: "pending", qdrant_attempts: "2", qdrant_next_retry_at: null,
    qdrant_last_error: null, created_at: "2026-10-28T00:00:00.000Z",
    updated_at: "2026-10-28T00:00:00.000Z",
  };
}

describe("ingest job current-state reads", () => {
  it("reads a job by ID and trimmed organization using the normal job mapper", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [row()] }) };
    const jobs = createIngestJobRepository(pool as never);

    await expect(jobs.getById!(91, " org-a ")).resolves.toMatchObject({
      id: 91, memoryRecordId: 10, organizationId: "org-a", qdrantAttempts: 2,
    });

    expect(pool.query).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("WHERE id = $1 AND organization_id = $2"), [91, "org-a"],
    );
  });

  it("returns null for deleted jobs and jobs outside the organization", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const jobs = createIngestJobRepository(pool as never);

    await expect(jobs.getById!(91, "org-b")).resolves.toBeNull();
  });

  it.each([
    [0, "org-a", "jobId"], [1.5, "org-a", "jobId"],
    [91, " \n ", "organizationId"],
  ] as const)("rejects invalid read boundaries before SQL", async (id, organizationId, field) => {
    const pool = { query: vi.fn() };
    const jobs = createIngestJobRepository(pool as never);

    await expect(jobs.getById!(id, organizationId)).rejects.toThrow(field);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
