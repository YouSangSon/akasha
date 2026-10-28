import { describe, expect, it, vi } from "vitest";
import { createMemoryArchiveRepository } from "../../src/store/memory-archive-repository.js";
import type { PgPool, PgQueryResult } from "../../src/db/connection.js";

type QueryFn = (text: string, values?: readonly unknown[]) => Promise<PgQueryResult>;

function makeMockPool(handler: QueryFn): { pool: PgPool; query: ReturnType<typeof vi.fn> } {
  const query = vi.fn(handler);
  const pool: PgPool = {
    query: query as unknown as PgPool["query"],
    connect: vi.fn(),
    end: vi.fn(),
  };
  return { pool, query };
}

const RUN_ROW = {
  id: "7",
  organization_id: "org-a",
  status: "pending" as const,
  archived_count: "0",
  duplicate_count: "0",
  decay_count: "0",
  qdrant_failed: "0",
};

function runRow(overrides: Record<string, unknown> = {}) {
  return { ...RUN_ROW, ...overrides };
}

describe("createMemoryArchiveRepository", () => {
  it.each([
    {
      pool: null,
      message: "memory archive pool must be an object",
    },
    {
      pool: { query: "SELECT 1" },
      message: "memory archive pool.query must be a function",
    },
  ])("rejects malformed direct pool inputs", ({ pool, message }) => {
    expect(() => createMemoryArchiveRepository(pool as never)).toThrow(message);
  });
});

describe("MemoryArchiveRepository.createCompactionRun", () => {
  const baseInput = {
    organizationId: "org-a",
    actor: "test",
    scopeType: "project",
    scopeId: "alpha",
    dryRun: false,
    planGeneratedAt: new Date("2026-04-25T12:00:00.000Z"),
    idempotencyKey: "00000000-0000-0000-0000-000000000001",
  };

  it("inserts a new run and maps the returning row", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [RUN_ROW] }));
    const repo = createMemoryArchiveRepository(pool);

    const result = await repo.createCompactionRun({
      organizationId: " org-a ",
      actor: " test ",
      scopeType: "project",
      scopeId: " alpha ",
      dryRun: false,
      planGeneratedAt: new Date("2026-04-25T12:00:00.000Z"),
      idempotencyKey: " 00000000-0000-0000-0000-000000000001 ",
    });

    expect(result).toEqual({
      id: 7,
      organizationId: "org-a",
      status: "pending",
      archivedCount: 0,
      duplicateCount: 0,
      decayCount: 0,
      qdrantFailed: 0,
    });
    const sql = query.mock.calls[0]![0] as string;
    const params = query.mock.calls[0]![1] as unknown[];
    expect(sql).toContain("INSERT INTO compaction_runs");
    expect(sql).toContain("ON CONFLICT (idempotency_key) DO NOTHING");
    expect(params.slice(0, 4)).toEqual(["org-a", "test", "project", "alpha"]);
    expect(params[6]).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("falls back to findRunByIdempotencyKey on insert conflict", async () => {
    let call = 0;
    const { pool } = makeMockPool(async () => {
      call += 1;
      if (call === 1) return { rows: [] }; // insert conflicted
      return { rows: [{ ...RUN_ROW, status: "completed", archived_count: "5" }] };
    });
    const repo = createMemoryArchiveRepository(pool);

    const result = await repo.createCompactionRun({
      organizationId: "org-a",
      actor: "test",
      scopeType: "project",
      scopeId: "alpha",
      dryRun: false,
      planGeneratedAt: new Date(),
      idempotencyKey: "00000000-0000-0000-0000-000000000002",
    });

    expect(result.status).toBe("completed");
    expect(result.archivedCount).toBe(5);
    expect(call).toBe(2);
  });

  it.each([
    {
      idempotencyKey: null,
      message: "idempotencyKey must be a string",
    },
    {
      idempotencyKey: " \n\t ",
      message: "idempotencyKey must contain non-whitespace text",
    },
  ])("rejects malformed direct idempotency keys before querying %#", async ({
    idempotencyKey,
    message,
  }) => {
    const { pool, query } = makeMockPool(async () => ({ rows: [RUN_ROW] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.findRunByIdempotencyKey(idempotencyKey as never),
    ).rejects.toThrow(message);

    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    {
      rowPatch: { organization_id: null },
      message: "compaction run organization_id must be a string",
    },
    {
      rowPatch: { organization_id: " \n\t " },
      message:
        "compaction run organization_id must contain non-whitespace text",
    },
    {
      rowPatch: { id: "0" },
      message: "compaction run id must be a positive safe integer",
    },
    {
      rowPatch: { archived_count: "-1" },
      message: "compaction run archived_count must be a non-negative safe integer",
    },
    {
      rowPatch: { duplicate_count: "1.5" },
      message: "compaction run duplicate_count must be a non-negative safe integer",
    },
    {
      rowPatch: { decay_count: "bad" },
      message: "database number must be finite",
    },
    {
      rowPatch: { qdrant_failed: "-1" },
      message: "compaction run qdrant_failed must be a non-negative safe integer",
    },
    {
      rowPatch: { status: "paused" },
      message: 'compaction run status must be "pending", "completed", or "failed"',
    },
  ])("rejects malformed existing run row values %#", async ({ rowPatch, message }) => {
    const { pool } = makeMockPool(async () => ({ rows: [runRow(rowPatch)] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.findRunByIdempotencyKey("00000000-0000-0000-0000-000000000007"),
    ).rejects.toThrow(message);
  });

  it("throws when insert returns 0 rows AND no existing row found", async () => {
    const { pool } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.createCompactionRun({
        organizationId: "org-a",
        actor: "test",
        scopeType: "project",
        scopeId: "alpha",
        dryRun: false,
        planGeneratedAt: new Date(),
        idempotencyKey: "00000000-0000-0000-0000-000000000003",
      }),
    ).rejects.toThrow(/idempotency_key/);
  });

  it.each([
    {
      input: null,
      message: "create compaction run input must be an object",
    },
    {
      input: [],
      message: "create compaction run input must be an object",
    },
  ])("rejects malformed direct run input objects before querying %#", async ({
    input,
    message,
  }) => {
    const { pool, query } = makeMockPool(async () => ({ rows: [RUN_ROW] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(repo.createCompactionRun(input as never)).rejects.toThrow(
      message,
    );

    expect(query).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only organizationId before querying", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [RUN_ROW] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.createCompactionRun({
        organizationId: " \n\t ",
        actor: "test",
        scopeType: "project",
        scopeId: "alpha",
        dryRun: false,
        planGeneratedAt: new Date(),
        idempotencyKey: "00000000-0000-0000-0000-000000000004",
      }),
    ).rejects.toThrow(/organizationId/);

    expect(query).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only scopeType before querying", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [RUN_ROW] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.createCompactionRun({
        organizationId: "org-a",
        actor: "test",
        scopeType: " \n\t ",
        scopeId: "alpha",
        dryRun: false,
        planGeneratedAt: new Date(),
        idempotencyKey: "00000000-0000-0000-0000-000000000005",
      }),
    ).rejects.toThrow(/scopeType/);

    expect(query).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only scopeId before querying", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [RUN_ROW] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.createCompactionRun({
        organizationId: "org-a",
        actor: "test",
        scopeType: "project",
        scopeId: " \n\t ",
        dryRun: false,
        planGeneratedAt: new Date(),
        idempotencyKey: "00000000-0000-0000-0000-000000000006",
      }),
    ).rejects.toThrow(/scopeId/);

    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    {
      inputPatch: { actor: " \n\t " },
      message: "actor must contain non-whitespace text",
    },
    {
      inputPatch: { scopeType: "team" },
      message: "scopeType must be one of: user, project",
    },
    {
      inputPatch: { dryRun: "false" },
      message: "dryRun must be a boolean",
    },
    {
      inputPatch: { planGeneratedAt: new Date(Number.NaN) },
      message: "planGeneratedAt must be a valid Date",
    },
    {
      inputPatch: { idempotencyKey: " \n\t " },
      message: "idempotencyKey must contain non-whitespace text",
    },
  ])("rejects malformed direct run inputs before querying %#", async ({
    inputPatch,
    message,
  }) => {
    const { pool, query } = makeMockPool(async () => ({ rows: [RUN_ROW] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.createCompactionRun({
        ...baseInput,
        ...inputPatch,
      } as never),
    ).rejects.toThrow(message);

    expect(query).not.toHaveBeenCalled();
  });
});

describe("MemoryArchiveRepository.applyCompactionRecord", () => {
  const baseInput = {
    runId: 7,
    organizationId: "org-a",
    recordId: 100,
    reason: "decay" as const,
    planGeneratedAt: new Date("2026-04-25T12:00:00.000Z"),
  };

  it("returns archived=true with archiveId and qdrantPointIds on success", async () => {
    const { pool, query } = makeMockPool(async () => ({
      rows: [{ archive_id: "42", qdrant_point_ids: ["p1", "p2"] }],
    }));
    const repo = createMemoryArchiveRepository(pool);

    const result = await repo.applyCompactionRecord({
      runId: 7,
      organizationId: " org-a ",
      recordId: 100,
      reason: "duplicate",
      keptRecordId: 99,
      planGeneratedAt: new Date("2026-04-25T12:00:00.000Z"),
    });

    expect(result).toEqual({
      archived: true,
      archiveId: 42,
      qdrantPointIds: ["p1", "p2"],
    });
    const sql = query.mock.calls[0]![0] as string;
    expect(sql).toContain("WITH deleted AS");
    expect(sql).toContain("updated_at <= $7"); // TOCTOU guard
    expect(sql).toContain("organization_id = $2"); // org isolation
    expect(sql).toMatch(/NOT EXISTS\s*\(\s*SELECT 1 FROM goal_runs gr/);
    expect(sql).toContain("gr.id = memory_records.goal_run_id");
    expect(sql).toContain("gr.organization_id = $2");
    expect(sql).toContain("gr.status = 'active'");
    expect(sql).toContain("dwp.qdrant_point_ids, NOW()");
    expect(sql).toContain("ON CONFLICT (compaction_run_id, source_record_id) DO NOTHING");
    const params = query.mock.calls[0]![1] as unknown[];
    expect(params[1]).toBe("org-a");
  });

  it("returns archived=false when canonical DELETE matches 0 rows (TOCTOU / org mismatch)", async () => {
    const { pool } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    const result = await repo.applyCompactionRecord({
      runId: 7,
      organizationId: "org-a",
      recordId: 100,
      reason: "decay",
      decayScore: 0.1,
      planGeneratedAt: new Date(),
    });

    expect(result).toEqual({ archived: false, qdrantPointIds: [] });
  });

  it("rejects whitespace-only organizationId before querying", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.applyCompactionRecord({
        runId: 7,
        organizationId: " \n\t ",
        recordId: 100,
        reason: "decay",
        planGeneratedAt: new Date(),
      }),
    ).rejects.toThrow(/organizationId/);

    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    {
      input: null,
      message: "apply compaction record input must be an object",
    },
    {
      input: [],
      message: "apply compaction record input must be an object",
    },
  ])("rejects malformed direct apply input objects before querying %#", async ({
    input,
    message,
  }) => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(repo.applyCompactionRecord(input as never)).rejects.toThrow(
      message,
    );

    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    {
      inputPatch: { runId: 0 },
      message: "runId must be a positive safe integer",
    },
    {
      inputPatch: { recordId: 0 },
      message: "recordId must be a positive safe integer",
    },
    {
      inputPatch: { reason: "manual" },
      message: 'reason must be "duplicate" or "decay"',
    },
    {
      inputPatch: { keptRecordId: 0 },
      message: "keptRecordId must be a positive safe integer",
    },
    {
      inputPatch: { decayScore: Number.POSITIVE_INFINITY },
      message: "decayScore must be a finite number when provided",
    },
    {
      inputPatch: { planGeneratedAt: new Date(Number.NaN) },
      message: "planGeneratedAt must be a valid Date",
    },
  ])("rejects malformed direct apply inputs before querying %#", async ({
    inputPatch,
    message,
  }) => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.applyCompactionRecord({
        ...baseInput,
        ...inputPatch,
      } as never),
    ).rejects.toThrow(message);

    expect(query).not.toHaveBeenCalled();
  });

  it("returns archived=true with empty qdrantPointIds when record has no chunks", async () => {
    const { pool } = makeMockPool(async () => ({
      rows: [{ archive_id: 1, qdrant_point_ids: [] }],
    }));
    const repo = createMemoryArchiveRepository(pool);

    const result = await repo.applyCompactionRecord({
      runId: 7,
      organizationId: "org-a",
      recordId: 100,
      reason: "decay",
      planGeneratedAt: new Date(),
    });

    expect(result.archived).toBe(true);
    expect(result.qdrantPointIds).toEqual([]);
  });

  it("rejects malformed returned archive id rows", async () => {
    const { pool } = makeMockPool(async () => ({
      rows: [{ archive_id: "0", qdrant_point_ids: [] }],
    }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.applyCompactionRecord({
        runId: 7,
        organizationId: "org-a",
        recordId: 100,
        reason: "decay",
        planGeneratedAt: new Date(),
      }),
    ).rejects.toThrow("memory archive id must be a positive safe integer");
  });

  it.each([
    {
      qdrantPointIds: null,
      message: "memory archive qdrant_point_ids must be an array",
    },
    {
      qdrantPointIds: [42],
      message: "memory archive qdrant_point_ids[0] must be a string",
    },
    {
      qdrantPointIds: [" \n\t "],
      message:
        "memory archive qdrant_point_ids[0] must contain non-whitespace text",
    },
  ])("rejects malformed returned qdrant point rows %#", async ({
    qdrantPointIds,
    message,
  }) => {
    const { pool } = makeMockPool(async () => ({
      rows: [{ archive_id: "42", qdrant_point_ids: qdrantPointIds }],
    }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.applyCompactionRecord({
        runId: 7,
        organizationId: "org-a",
        recordId: 100,
        reason: "decay",
        planGeneratedAt: new Date(),
      }),
    ).rejects.toThrow(message);
  });
});

describe("MemoryArchiveRepository.markQdrantStatus", () => {
  it.each([
    {
      call: (repo: ReturnType<typeof createMemoryArchiveRepository>) =>
        repo.markQdrantStatus(0, "deleted"),
      message: "archiveId must be a positive safe integer",
    },
    {
      call: (repo: ReturnType<typeof createMemoryArchiveRepository>) =>
        repo.markQdrantStatus(42, "cleaned" as never),
      message: 'status must be "pending", "deleted", or "failed"',
    },
    {
      call: (repo: ReturnType<typeof createMemoryArchiveRepository>) =>
        repo.markQdrantStatus(42, "failed", 503 as never),
      message: "errorMessage must be a string when provided",
    },
  ])("rejects malformed direct status inputs before querying", async ({ call, message }) => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(call(repo)).rejects.toThrow(message);

    expect(query).not.toHaveBeenCalled();
  });

  it("uses the deleted-specific SQL when status='deleted'", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await repo.markQdrantStatus(42, "deleted");

    const sql = query.mock.calls[0]![0] as string;
    expect(sql).toContain("qdrant_status = 'deleted'");
    expect(sql).toContain("qdrant_cleaned_at = NOW()");
  });

  it("records error message when status='failed'", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await repo.markQdrantStatus(42, "failed", " Qdrant 503 ");

    const sql = query.mock.calls[0]![0] as string;
    const params = query.mock.calls[0]![1] as unknown[];
    expect(sql).toContain("qdrant_status = 'failed'");
    expect(sql).toContain("qdrant_next_retry_at = NULL");
    expect(params).toEqual([42, "Qdrant 503"]);
  });

  it("schedules the next retry when status='pending'", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await repo.markQdrantStatus(42, "pending", " Qdrant 503 ");

    const sql = query.mock.calls[0]![0] as string;
    const params = query.mock.calls[0]![1] as unknown[];
    expect(sql).toContain("qdrant_status = 'pending'");
    expect(sql).toContain("qdrant_next_retry_at = NOW() + INTERVAL '30 seconds'");
    expect(params).toEqual([42, "Qdrant 503"]);
  });

  it("stores blank qdrant error messages as null", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await repo.markQdrantStatus(42, "failed", " \n\t ");

    const params = query.mock.calls[0]![1] as unknown[];
    expect(params).toEqual([42, null]);
  });
});

describe("MemoryArchiveRepository.completeCompactionRun", () => {
  const baseInput = {
    runId: 7,
    status: "completed" as const,
    archivedCount: 3,
    duplicateCount: 1,
    decayCount: 2,
    qdrantFailed: 0,
  };

  it("updates run outcome counters and optional error message", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await repo.completeCompactionRun({
      ...baseInput,
      status: "failed",
      errorMessage: " qdrant cleanup failed ",
    });

    const sql = query.mock.calls[0]![0] as string;
    const params = query.mock.calls[0]![1] as unknown[];
    expect(sql).toContain("UPDATE compaction_runs");
    expect(sql).toContain("completed_at = NOW()");
    expect(params).toEqual([
      7,
      "failed",
      3,
      1,
      2,
      0,
      "qdrant cleanup failed",
    ]);
  });

  it("stores blank completion error messages as null", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await repo.completeCompactionRun({
      ...baseInput,
      status: "failed",
      errorMessage: " \n\t ",
    });

    const params = query.mock.calls[0]![1] as unknown[];
    expect(params[6]).toBeNull();
  });

  it.each([
    {
      input: null,
      message: "complete compaction run input must be an object",
    },
    {
      input: [],
      message: "complete compaction run input must be an object",
    },
  ])("rejects malformed direct completion input objects before querying %#", async ({
    input,
    message,
  }) => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(repo.completeCompactionRun(input as never)).rejects.toThrow(
      message,
    );

    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    {
      inputPatch: { runId: 0 },
      message: "runId must be a positive safe integer",
    },
    {
      inputPatch: { status: "paused" },
      message: 'status must be "pending", "completed", or "failed"',
    },
    {
      inputPatch: { archivedCount: -1 },
      message: "archivedCount must be a non-negative safe integer",
    },
    {
      inputPatch: { duplicateCount: 1.5 },
      message: "duplicateCount must be a non-negative safe integer",
    },
    {
      inputPatch: { decayCount: Number.NaN },
      message: "decayCount must be a non-negative safe integer",
    },
    {
      inputPatch: { qdrantFailed: -1 },
      message: "qdrantFailed must be a non-negative safe integer",
    },
    {
      inputPatch: { errorMessage: 503 },
      message: "errorMessage must be a string when provided",
    },
  ])("rejects malformed direct completion inputs before querying %#", async ({
    inputPatch,
    message,
  }) => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.completeCompactionRun({
        ...baseInput,
        ...inputPatch,
      } as never),
    ).rejects.toThrow(message);

    expect(query).not.toHaveBeenCalled();
  });
});

describe("MemoryArchiveRepository.findPendingQdrantCleanup", () => {
  it("rejects malformed direct limits before querying", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(repo.findPendingQdrantCleanup(0)).rejects.toThrow(
      "limit must be a positive safe integer",
    );

    expect(query).not.toHaveBeenCalled();
  });

  it("maps rows to PendingQdrantCleanup shape", async () => {
    const { pool } = makeMockPool(async () => ({
      rows: [
        {
          id: "1",
          organization_id: "org-a",
          source_record_id: "100",
          qdrant_point_ids: ["pa1", "pa2"],
          qdrant_attempt_count: "0",
        },
        {
          id: "2",
          organization_id: "org-b",
          source_record_id: "200",
          qdrant_point_ids: ["pb1"],
          qdrant_attempt_count: "3",
        },
      ],
    }));
    const repo = createMemoryArchiveRepository(pool);

    const pending = await repo.findPendingQdrantCleanup(50);

    expect(pending).toEqual([
      {
        archiveId: 1,
        organizationId: "org-a",
        sourceRecordId: 100,
        qdrantPointIds: ["pa1", "pa2"],
        attemptCount: 0,
      },
      {
        archiveId: 2,
        organizationId: "org-b",
        sourceRecordId: 200,
        qdrantPointIds: ["pb1"],
        attemptCount: 3,
      },
    ]);
  });

  it.each(["0", "1.5"])("rejects malformed pending archive id rows: %s", async (id) => {
    const { pool } = makeMockPool(async () => ({
      rows: [
        {
          id,
          organization_id: "org-a",
          source_record_id: "100",
          qdrant_point_ids: ["pa1"],
          qdrant_attempt_count: "0",
        },
      ],
    }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(repo.findPendingQdrantCleanup(50)).rejects.toThrow(
      "memory archive id must be a positive safe integer",
    );
  });

  it.each([
    {
      attemptCount: "-1",
      message:
        "memory archive qdrant_attempt_count must be a non-negative safe integer",
    },
    {
      attemptCount: "1.5",
      message:
        "memory archive qdrant_attempt_count must be a non-negative safe integer",
    },
    {
      attemptCount: "bad",
      message: "database number must be finite",
    },
  ])(
    "rejects malformed pending cleanup attempt rows: $attemptCount",
    async ({ attemptCount, message }) => {
      const { pool } = makeMockPool(async () => ({
        rows: [
          {
            id: "1",
            organization_id: "org-a",
            source_record_id: "100",
            qdrant_point_ids: ["pa1"],
            qdrant_attempt_count: attemptCount,
          },
        ],
      }));
      const repo = createMemoryArchiveRepository(pool);

      await expect(repo.findPendingQdrantCleanup(50)).rejects.toThrow(message);
    },
  );

  it.each([
    {
      rowPatch: { organization_id: null },
      message: "memory archive organization_id must be a string",
    },
    {
      rowPatch: { organization_id: " \n\t " },
      message:
        "memory archive organization_id must contain non-whitespace text",
    },
    {
      rowPatch: { qdrant_point_ids: null },
      message: "memory archive qdrant_point_ids must be an array",
    },
    {
      rowPatch: { qdrant_point_ids: [42] },
      message: "memory archive qdrant_point_ids[0] must be a string",
    },
    {
      rowPatch: { qdrant_point_ids: [" \n\t "] },
      message:
        "memory archive qdrant_point_ids[0] must contain non-whitespace text",
    },
  ])("rejects malformed pending cleanup row metadata %#", async ({
    rowPatch,
    message,
  }) => {
    const { pool } = makeMockPool(async () => ({
      rows: [
        {
          id: "1",
          organization_id: "org-a",
          source_record_id: "100",
          qdrant_point_ids: ["pa1"],
          qdrant_attempt_count: "0",
          ...rowPatch,
        },
      ],
    }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(repo.findPendingQdrantCleanup(50)).rejects.toThrow(message);
  });

  it("filters due pending rows without claiming locks", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await repo.findPendingQdrantCleanup(10);

    const sql = query.mock.calls[0]![0] as string;
    expect(sql).toContain("qdrant_status = 'pending'");
    expect(sql).toContain("qdrant_next_retry_at <= NOW()");
    expect(sql).toContain("source_record_id");
    expect(sql).not.toContain("array_length(qdrant_point_ids");
    expect(sql).not.toContain("FOR UPDATE SKIP LOCKED");
  });
});

describe("MemoryArchiveRepository.claimPendingQdrantCleanup", () => {
  it.each([
    {
      input: null,
      message: "qdrant cleanup claim input must be an object",
    },
    {
      input: { limit: 0, now: new Date() },
      message: "limit must be a positive safe integer",
    },
    {
      input: { limit: 10, now: new Date(Number.NaN) },
      message: "now must be a valid Date",
    },
  ])("rejects malformed direct claim inputs before querying", async ({ input, message }) => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.claimPendingQdrantCleanup(input as never),
    ).rejects.toThrow(message);

    expect(query).not.toHaveBeenCalled();
  });

  it("claims rows with one UPDATE using FOR UPDATE SKIP LOCKED and retry visibility", async () => {
    const now = new Date("2026-06-25T00:00:00.000Z");
    const { pool, query } = makeMockPool(async () => ({
      rows: [
        {
          id: "1",
          organization_id: "org-a",
          source_record_id: "100",
          qdrant_point_ids: ["pa1"],
          qdrant_attempt_count: "2",
        },
      ],
    }));
    const repo = createMemoryArchiveRepository(pool);

    const result = await repo.claimPendingQdrantCleanup({ limit: 10, now });

    expect(result).toEqual([
      {
        archiveId: 1,
        organizationId: "org-a",
        sourceRecordId: 100,
        qdrantPointIds: ["pa1"],
        attemptCount: 2,
      },
    ]);
    const sql = query.mock.calls[0]![0] as string;
    const params = query.mock.calls[0]![1] as unknown[];
    expect(sql).toContain("UPDATE memory_archive");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("qdrant_next_retry_at = $3");
    expect(sql).toContain("archived_at < $1::timestamptz - INTERVAL '60 seconds'");
    expect(sql).toContain("source_record_id");
    expect(sql).not.toContain("array_length(qdrant_point_ids");
    expect(params[0]).toBe(now.toISOString());
    expect(params[1]).toBe(10);
    expect(params[2]).toBe("2026-06-25T00:01:00.000Z");
  });

  it("rejects malformed claimed archive id rows", async () => {
    const { pool } = makeMockPool(async () => ({
      rows: [
        {
          id: "1.5",
          organization_id: "org-a",
          source_record_id: "100",
          qdrant_point_ids: ["pa1"],
          qdrant_attempt_count: "2",
        },
      ],
    }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.claimPendingQdrantCleanup({
        limit: 10,
        now: new Date("2026-06-25T00:00:00.000Z"),
      }),
    ).rejects.toThrow("memory archive id must be a positive safe integer");
  });

  it.each(["find", "claim"] as const)("%s includes record cleanup when no point ids were mapped", async (operation) => {
    const { pool } = makeMockPool(async () => ({ rows: [{
      id: "1",
      organization_id: "org-a",
      source_record_id: "100",
      qdrant_point_ids: [],
      qdrant_attempt_count: "0",
    }] }));
    const repo = createMemoryArchiveRepository(pool);

    const rows = operation === "find"
      ? await repo.findPendingQdrantCleanup(1)
      : await repo.claimPendingQdrantCleanup({ limit: 1, now: new Date("2026-06-25T00:00:00.000Z") });

    expect(rows).toEqual([{
      archiveId: 1,
      organizationId: "org-a",
      sourceRecordId: 100,
      qdrantPointIds: [],
      attemptCount: 0,
    }]);
  });

  it("rejects malformed claimed cleanup attempt rows", async () => {
    const { pool } = makeMockPool(async () => ({
      rows: [
        {
          id: "1",
          organization_id: "org-a",
          source_record_id: "100",
          qdrant_point_ids: ["pa1"],
          qdrant_attempt_count: "1.5",
        },
      ],
    }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.claimPendingQdrantCleanup({
        limit: 10,
        now: new Date("2026-06-25T00:00:00.000Z"),
      }),
    ).rejects.toThrow(
      "memory archive qdrant_attempt_count must be a non-negative safe integer",
    );
  });

  it.each([
    {
      rowPatch: { organization_id: null },
      message: "memory archive organization_id must be a string",
    },
    {
      rowPatch: { source_record_id: "0" },
      message: "memory archive source_record_id must be a positive safe integer",
    },
    {
      rowPatch: { qdrant_point_ids: null },
      message: "memory archive qdrant_point_ids must be an array",
    },
  ])("rejects malformed claimed cleanup row metadata %#", async ({
    rowPatch,
    message,
  }) => {
    const { pool } = makeMockPool(async () => ({
      rows: [
        {
          id: "1",
          organization_id: "org-a",
          source_record_id: "100",
          qdrant_point_ids: ["pa1"],
          qdrant_attempt_count: "2",
          ...rowPatch,
        },
      ],
    }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.claimPendingQdrantCleanup({
        limit: 10,
        now: new Date("2026-06-25T00:00:00.000Z"),
      }),
    ).rejects.toThrow(message);
  });
});

describe("MemoryArchiveRepository.countRecentApplyRuns", () => {
  it("rejects whitespace-only organizationId before querying", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [{ count: 0 }] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.countRecentApplyRuns(" \n\t ", 60_000),
    ).rejects.toThrow(/organizationId/);

    expect(query).not.toHaveBeenCalled();
  });

  it("trims organizationId before counting recent apply runs", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [{ count: 0 }] }));
    const repo = createMemoryArchiveRepository(pool);

    await repo.countRecentApplyRuns(" org-a ", 60_000);

    const params = query.mock.calls[0]![1] as unknown[];
    expect(params).toEqual(["org-a", 60]);
  });

  it.each([
    {
      windowMs: 0,
      message: "windowMs must be a positive safe integer",
    },
    {
      windowMs: -1,
      message: "windowMs must be a positive safe integer",
    },
    {
      windowMs: 1.5,
      message: "windowMs must be a positive safe integer",
    },
    {
      windowMs: Number.NaN,
      message: "windowMs must be a positive safe integer",
    },
    {
      windowMs: "60000",
      message: "windowMs must be a positive safe integer",
    },
  ])("rejects malformed direct apply-run windows before querying %#", async ({
    windowMs,
    message,
  }) => {
    const { pool, query } = makeMockPool(async () => ({ rows: [{ count: 0 }] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.countRecentApplyRuns("org-a", windowMs as never),
    ).rejects.toThrow(message);

    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    { count: 0, expected: 0 },
    { count: "0", expected: 0 },
    { count: "42", expected: 42 },
  ])("maps count rows without coercion drift: $count", async ({ count, expected }) => {
    const { pool } = makeMockPool(async () => ({ rows: [{ count }] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(repo.countRecentApplyRuns("org-a", 60_000)).resolves.toBe(
      expected,
    );
  });

  it("returns zero when the count query returns no row", async () => {
    const { pool } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(repo.countRecentApplyRuns("org-a", 60_000)).resolves.toBe(0);
  });

  it.each(["1abc", "1.5", "", " \n\t ", Number.NaN, -1, 1.5, null, false])(
    "rejects malformed count rows: %s",
    async (count) => {
      const { pool } = makeMockPool(async () => ({ rows: [{ count }] }));
      const repo = createMemoryArchiveRepository(pool);

      await expect(repo.countRecentApplyRuns("org-a", 60_000)).rejects.toThrow(
        "recent apply run count must be a non-negative safe integer",
      );
    },
  );
});

describe("MemoryArchiveRepository.findArchiveByIds", () => {
  function archiveRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "50",
      organization_id: "org-a",
      source_record_id: "100",
      source_id: "200",
      scope_type: "project",
      scope_id: "alpha",
      project_key: "alpha",
      kind: "decision",
      title: null,
      content: "Decision: ship Friday",
      summary: null,
      durability: "durable",
      importance: "5",
      original_created_at: new Date("2026-04-25T00:00:00.000Z"),
      original_updated_at: "2026-04-25T01:00:00.000Z",
      unarchived_at: null,
      ...overrides,
    };
  }

  it("returns empty array when no ids supplied", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    const result = await repo.findArchiveByIds([], "org-a");

    expect(result).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("filters by id list AND organization_id", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await repo.findArchiveByIds([1, 2, 3], "org-a");

    const sql = query.mock.calls[0]![0] as string;
    const params = query.mock.calls[0]![1] as unknown[];
    expect(sql).toContain("id = ANY($1::bigint[])");
    expect(sql).toContain("organization_id = $2");
    expect(params).toEqual([[1, 2, 3], "org-a"]);
  });

  it("trims organizationId before querying archive rows", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await repo.findArchiveByIds([1, 2, 3], " org-a ");

    const params = query.mock.calls[0]![1] as unknown[];
    expect(params).toEqual([[1, 2, 3], "org-a"]);
  });

  it("rejects whitespace-only organizationId before querying", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.findArchiveByIds([1, 2, 3], " \n\t "),
    ).rejects.toThrow(/organizationId/);

    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    {
      archiveIds: null,
      message: "archiveIds must be an array",
    },
    {
      archiveIds: [0],
      message: "archiveIds[0] must be a positive safe integer",
    },
    {
      archiveIds: [1.5],
      message: "archiveIds[0] must be a positive safe integer",
    },
    {
      archiveIds: [Number.MAX_SAFE_INTEGER + 1],
      message: "archiveIds[0] must be a positive safe integer",
    },
  ])("rejects malformed direct archive id lists before querying %#", async ({
    archiveIds,
    message,
  }) => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.findArchiveByIds(archiveIds as never, "org-a"),
    ).rejects.toThrow(message);

    expect(query).not.toHaveBeenCalled();
  });

  it("maps rows including null source_id and unarchived_at", async () => {
    const { pool } = makeMockPool(async () => ({
      rows: [archiveRow()],
    }));
    const repo = createMemoryArchiveRepository(pool);

    const result = await repo.findArchiveByIds([50], "org-a");

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(50);
    expect(result[0]!.sourceId).toBe(200);
    expect(result[0]!.originalCreatedAt).toBe("2026-04-25T00:00:00.000Z");
    expect(result[0]!.originalUpdatedAt).toBe("2026-04-25T01:00:00.000Z");
    expect(result[0]!.unarchivedAt).toBeNull();
  });

  it.each([
    {
      rowPatch: { id: "0" },
      message: "memory archive id must be a positive safe integer",
    },
    {
      rowPatch: { source_record_id: "1.5" },
      message: "memory archive source_record_id must be a positive safe integer",
    },
    {
      rowPatch: { source_id: "0" },
      message: "memory archive source_id must be a positive safe integer",
    },
    {
      rowPatch: { source_id: "bad" },
      message: "database number must be finite",
    },
  ])("rejects malformed archive record id rows %#", async ({ rowPatch, message }) => {
    const { pool } = makeMockPool(async () => ({
      rows: [archiveRow(rowPatch)],
    }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(repo.findArchiveByIds([50], "org-a")).rejects.toThrow(message);
  });

  it.each([
    {
      rowPatch: { organization_id: null },
      message: "memory archive organization_id must be a string",
    },
    {
      rowPatch: { scope_id: " \n\t " },
      message: "memory archive scope_id must contain non-whitespace text",
    },
    {
      rowPatch: { project_key: 42 },
      message: "memory archive project_key must be a string or null",
    },
    {
      rowPatch: { title: 42 },
      message: "memory archive title must be a string or null",
    },
    {
      rowPatch: { content: null },
      message: "memory archive content must be a string",
    },
    {
      rowPatch: { content: " \n\t " },
      message: "memory archive content must contain non-whitespace text",
    },
    {
      rowPatch: { summary: 42 },
      message: "memory archive summary must be a string or null",
    },
  ])("rejects malformed archive scalar rows %#", async ({
    rowPatch,
    message,
  }) => {
    const { pool } = makeMockPool(async () => ({
      rows: [archiveRow(rowPatch)],
    }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(repo.findArchiveByIds([50], "org-a")).rejects.toThrow(message);
  });

  it.each([
    {
      importance: "1.5",
      message: "memory archive importance must be a Postgres integer",
    },
    {
      importance: "2147483648",
      message: "memory archive importance must be a Postgres integer",
    },
    {
      importance: "bad",
      message: "database number must be finite",
    },
  ])("rejects malformed archive importance rows %#", async ({
    importance,
    message,
  }) => {
    const { pool } = makeMockPool(async () => ({
      rows: [archiveRow({ importance })],
    }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(repo.findArchiveByIds([50], "org-a")).rejects.toThrow(message);
  });

  it.each([
    {
      rowPatch: { scope_type: "team" },
      message: "memory archive scope_type must be one of: user, project",
    },
    {
      rowPatch: { kind: "note" },
      message: "memory archive kind must be one of: decision, summary, fact",
    },
    {
      rowPatch: { durability: "permanent" },
      message:
        "memory archive durability must be one of: ephemeral, durable, archived",
    },
  ])("rejects malformed archive enum rows %#", async ({ rowPatch, message }) => {
    const { pool } = makeMockPool(async () => ({
      rows: [archiveRow(rowPatch)],
    }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(repo.findArchiveByIds([50], "org-a")).rejects.toThrow(message);
  });
});

describe("MemoryArchiveRepository.restoreToCanonical", () => {
  function makeArchive(overrides: Record<string, unknown> = {}) {
    return {
      id: 50,
      organizationId: "org-a",
      sourceRecordId: 100,
      sourceId: 200,
      scopeType: "project",
      scopeId: "alpha",
      projectKey: "alpha",
      kind: "decision",
      title: null,
      content: "x",
      summary: null,
      durability: "durable",
      importance: 5,
      originalCreatedAt: "2026-04-25T00:00:00.000Z",
      originalUpdatedAt: "2026-04-25T01:00:00.000Z",
      unarchivedAt: null,
      ...overrides,
    } as Parameters<ReturnType<typeof createMemoryArchiveRepository>["restoreToCanonical"]>[0];
  }

  it("INSERTs into memory_records preserving original timestamps + source_id", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [{ id: "999" }] }));
    const repo = createMemoryArchiveRepository(pool);

    const result = await repo.restoreToCanonical(makeArchive(), "org-a");

    expect(result).toEqual({ restoredRecordId: 999 });
    const sql = query.mock.calls[0]![0] as string;
    const params = query.mock.calls[0]![1] as unknown[];
    expect(sql).toContain("INSERT INTO memory_records");
    expect(sql).toContain("created_at, updated_at");
    expect(params).toContain("2026-04-25T00:00:00.000Z");
    expect(params).toContain(200); // source_id
  });

  it.each([false, true])("runs the precommit hook on the transaction client and rolls back on failure=%s", async (fail) => {
    const failure = new Error("restore hook failed");
    const client = {
      query: vi.fn(async (sql: string) => ({
        rows: sql.includes("INSERT INTO memory_records") ? [{ id: "999" }] : [],
      })),
      release: vi.fn(),
    };
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    vi.mocked(pool.connect).mockResolvedValue(client as never);
    const repo = createMemoryArchiveRepository(pool);
    const hook = vi.fn(async (id: number) => {
      expect(id).toBe(999);
      expect(client.query.mock.calls.map(([sql]) => sql)).not.toContain("COMMIT");
      await client.query("restore intent");
      if (fail) throw failure;
    });

    const result = repo.restoreToCanonical(makeArchive(), "org-a", hook);
    if (fail) await expect(result).rejects.toBe(failure);
    else await expect(result).resolves.toEqual({ restoredRecordId: 999 });

    expect(hook).toHaveBeenCalledOnce();
    expect(client.query.mock.calls[0]![0]).toBe("BEGIN");
    expect(client.query.mock.calls.at(-2)![0]).toBe("restore intent");
    expect(client.query.mock.calls.at(-1)![0]).toBe(fail ? "ROLLBACK" : "COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
    expect(query).not.toHaveBeenCalled();
  });

  it("trims organizationId before checking org ownership and restoring", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [{ id: "999" }] }));
    const repo = createMemoryArchiveRepository(pool);

    const result = await repo.restoreToCanonical(makeArchive(), " org-a ");

    expect(result).toEqual({ restoredRecordId: 999 });
    const params = query.mock.calls[0]![1] as unknown[];
    expect(params[0]).toBe("org-a");
  });

  it.each(["0", "1.5"])(
    "rejects malformed restored memory id rows: %s",
    async (id) => {
      const { pool } = makeMockPool(async () => ({ rows: [{ id }] }));
      const repo = createMemoryArchiveRepository(pool);

      await expect(
        repo.restoreToCanonical(makeArchive(), "org-a"),
      ).rejects.toThrow("restored memory id must be a positive safe integer");
    },
  );

  it("rejects when archive.organizationId disagrees with caller org (cross-tenant guard)", async () => {
    const { pool } = makeMockPool(async () => ({ rows: [{ id: 1 }] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.restoreToCanonical(makeArchive(), "org-b"),
    ).rejects.toThrow(/org mismatch/);
  });

  it("rejects whitespace-only organizationId before querying", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [{ id: 1 }] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.restoreToCanonical(
        makeArchive({ organizationId: " \n\t " }),
        " \n\t ",
      ),
    ).rejects.toThrow(/organizationId/);

    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    {
      archive: null,
      message: "restore archive must be an object",
    },
    {
      archive: makeArchive({ id: 0 }),
      message: "memory archive id must be a positive safe integer",
    },
    {
      archive: makeArchive({ scopeType: "team" }),
      message: "memory archive scope_type must be one of: user, project",
    },
    {
      archive: makeArchive({ kind: "note" }),
      message: "memory archive kind must be one of: decision, summary, fact",
    },
    {
      archive: makeArchive({ durability: "permanent" }),
      message:
        "memory archive durability must be one of: ephemeral, durable, archived",
    },
    {
      archive: makeArchive({ originalUpdatedAt: "not-a-date" }),
      message: "database timestamp must be a valid timestamp",
    },
  ])("rejects malformed direct restore archive inputs before querying %#", async ({
    archive,
    message,
  }) => {
    const { pool, query } = makeMockPool(async () => ({ rows: [{ id: 1 }] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.restoreToCanonical(archive as never, "org-a"),
    ).rejects.toThrow(message);

    expect(query).not.toHaveBeenCalled();
  });

  it("rejects when archive has no sourceId", async () => {
    const { pool } = makeMockPool(async () => ({ rows: [{ id: 1 }] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.restoreToCanonical(makeArchive({ sourceId: null }), "org-a"),
    ).rejects.toThrow(/no source_id/);
  });
});

describe("MemoryArchiveRepository.deleteRestoredCanonicalRecord", () => {
  it("deletes only the restored canonical record for the caller organization", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await repo.deleteRestoredCanonicalRecord(999, "org-a");

    const sql = query.mock.calls[0]![0] as string;
    const params = query.mock.calls[0]![1] as unknown[];
    expect(sql).toContain("DELETE FROM memory_records");
    expect(sql).toContain("WHERE id = $1");
    expect(sql).toContain("AND organization_id = $2");
    expect(params).toEqual([999, "org-a"]);
  });

  it("trims organizationId before deleting restored canonical records", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await repo.deleteRestoredCanonicalRecord(999, " org-a ");

    const params = query.mock.calls[0]![1] as unknown[];
    expect(params).toEqual([999, "org-a"]);
  });

  it("rejects whitespace-only organizationId before querying", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.deleteRestoredCanonicalRecord(999, " \n\t "),
    ).rejects.toThrow(/organizationId/);

    expect(query).not.toHaveBeenCalled();
  });

  it("rejects malformed direct record IDs before querying", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.deleteRestoredCanonicalRecord(0, "org-a"),
    ).rejects.toThrow("recordId must be a positive safe integer");

    expect(query).not.toHaveBeenCalled();
  });
});

describe("MemoryArchiveRepository.markUnarchived", () => {
  it("sets unarchived_at = NOW() for the given archive id", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await repo.markUnarchived(50);

    const sql = query.mock.calls[0]![0] as string;
    const params = query.mock.calls[0]![1] as unknown[];
    expect(sql).toContain("UPDATE memory_archive");
    expect(sql).toContain("unarchived_at = NOW()");
    expect(params).toEqual([50]);
  });

  it("rejects malformed direct archive IDs before querying", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(repo.markUnarchived(0)).rejects.toThrow(
      "archiveId must be a positive safe integer",
    );

    expect(query).not.toHaveBeenCalled();
  });
});

describe("MemoryArchiveRepository.acquireScopeLock", () => {
  it("returns true when pg_try_advisory_lock acquires", async () => {
    const { pool } = makeMockPool(async () => ({ rows: [{ acquired: true }] }));
    const repo = createMemoryArchiveRepository(pool);

    const acquired = await repo.acquireScopeLock({
      organizationId: "org-a",
      scopeType: "project",
      scopeId: "alpha",
    });

    expect(acquired).toBe(true);
  });

  it("returns false when lock is already held by another session", async () => {
    const { pool } = makeMockPool(async () => ({ rows: [{ acquired: false }] }));
    const repo = createMemoryArchiveRepository(pool);

    const acquired = await repo.acquireScopeLock({
      organizationId: "org-a",
      scopeType: "project",
      scopeId: "alpha",
    });

    expect(acquired).toBe(false);
  });

  it("trims direct lock scope fields before querying", async () => {
    const { pool, query } = makeMockPool(async () => ({
      rows: [{ acquired: true }],
    }));
    const repo = createMemoryArchiveRepository(pool);

    await repo.acquireScopeLock({
      organizationId: " org-a ",
      scopeType: " project ",
      scopeId: " alpha ",
    });

    expect(query.mock.calls[0]?.[1]).toEqual(["org-a:project:alpha"]);
  });

  it.each([
    {
      input: null,
      message: "scope lock input must be an object",
    },
    {
      input: [],
      message: "scope lock input must be an object",
    },
  ])("rejects malformed direct lock inputs before querying %#", async ({
    input,
    message,
  }) => {
    const { pool, query } = makeMockPool(async () => ({
      rows: [{ acquired: true }],
    }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(repo.acquireScopeLock(input as never)).rejects.toThrow(
      message,
    );

    expect(query).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only organizationId before querying", async () => {
    const { pool, query } = makeMockPool(async () => ({
      rows: [{ acquired: true }],
    }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.acquireScopeLock({
        organizationId: " \n\t ",
        scopeType: "project",
        scopeId: "alpha",
      }),
    ).rejects.toThrow(/organizationId/);

    expect(query).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only scopeType before querying", async () => {
    const { pool, query } = makeMockPool(async () => ({
      rows: [{ acquired: true }],
    }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.acquireScopeLock({
        organizationId: "org-a",
        scopeType: " \n\t ",
        scopeId: "alpha",
      }),
    ).rejects.toThrow(/scopeType/);

    expect(query).not.toHaveBeenCalled();
  });

  it("rejects invalid scopeType before querying", async () => {
    const { pool, query } = makeMockPool(async () => ({
      rows: [{ acquired: true }],
    }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.acquireScopeLock({
        organizationId: "org-a",
        scopeType: "team",
        scopeId: "alpha",
      }),
    ).rejects.toThrow("scopeType must be one of: user, project");

    expect(query).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only scopeId before querying", async () => {
    const { pool, query } = makeMockPool(async () => ({
      rows: [{ acquired: true }],
    }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.acquireScopeLock({
        organizationId: "org-a",
        scopeType: "project",
        scopeId: " \n\t ",
      }),
    ).rejects.toThrow(/scopeId/);

    expect(query).not.toHaveBeenCalled();
  });
});
