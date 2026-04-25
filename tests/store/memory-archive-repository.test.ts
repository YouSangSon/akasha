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
  id: 7,
  organization_id: "org-a",
  status: "pending" as const,
  archived_count: 0,
  duplicate_count: 0,
  decay_count: 0,
  qdrant_failed: 0,
};

describe("MemoryArchiveRepository.createCompactionRun", () => {
  it("inserts a new run and maps the returning row", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [RUN_ROW] }));
    const repo = createMemoryArchiveRepository(pool);

    const result = await repo.createCompactionRun({
      organizationId: "org-a",
      actor: "test",
      scopeType: "project",
      scopeId: "alpha",
      dryRun: false,
      planGeneratedAt: new Date("2026-04-25T12:00:00.000Z"),
      idempotencyKey: "00000000-0000-0000-0000-000000000001",
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
    expect(sql).toContain("INSERT INTO compaction_runs");
    expect(sql).toContain("ON CONFLICT (idempotency_key) DO NOTHING");
  });

  it("falls back to findRunByIdempotencyKey on insert conflict", async () => {
    let call = 0;
    const { pool } = makeMockPool(async () => {
      call += 1;
      if (call === 1) return { rows: [] }; // insert conflicted
      return { rows: [{ ...RUN_ROW, status: "completed", archived_count: 5 }] };
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
});

describe("MemoryArchiveRepository.applyCompactionRecord", () => {
  it("returns archived=true with archiveId and qdrantPointIds on success", async () => {
    const { pool, query } = makeMockPool(async () => ({
      rows: [{ archive_id: 42, qdrant_point_ids: ["p1", "p2"] }],
    }));
    const repo = createMemoryArchiveRepository(pool);

    const result = await repo.applyCompactionRecord({
      runId: 7,
      organizationId: "org-a",
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
    expect(sql).toContain("ON CONFLICT (compaction_run_id, source_record_id) DO NOTHING");
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
});

describe("MemoryArchiveRepository.markQdrantStatus", () => {
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

    await repo.markQdrantStatus(42, "failed", "Qdrant 503");

    const params = query.mock.calls[0]![1] as unknown[];
    expect(params).toEqual([42, "failed", "Qdrant 503"]);
  });
});

describe("MemoryArchiveRepository.findPendingQdrantCleanup", () => {
  it("maps rows to PendingQdrantCleanup shape", async () => {
    const { pool } = makeMockPool(async () => ({
      rows: [
        {
          id: 1,
          organization_id: "org-a",
          qdrant_point_ids: ["pa1", "pa2"],
          qdrant_attempt_count: 0,
        },
        {
          id: 2,
          organization_id: "org-b",
          qdrant_point_ids: ["pb1"],
          qdrant_attempt_count: 3,
        },
      ],
    }));
    const repo = createMemoryArchiveRepository(pool);

    const pending = await repo.findPendingQdrantCleanup(50);

    expect(pending).toEqual([
      {
        archiveId: 1,
        organizationId: "org-a",
        qdrantPointIds: ["pa1", "pa2"],
        attemptCount: 0,
      },
      {
        archiveId: 2,
        organizationId: "org-b",
        qdrantPointIds: ["pb1"],
        attemptCount: 3,
      },
    ]);
  });

  it("filters by qdrant_status='pending' and skips locked rows", async () => {
    const { pool, query } = makeMockPool(async () => ({ rows: [] }));
    const repo = createMemoryArchiveRepository(pool);

    await repo.findPendingQdrantCleanup(10);

    const sql = query.mock.calls[0]![0] as string;
    expect(sql).toContain("qdrant_status = 'pending'");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
  });
});

describe("MemoryArchiveRepository.findArchiveByIds (P19.1)", () => {
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

  it("maps rows including null source_id and unarchived_at", async () => {
    const { pool } = makeMockPool(async () => ({
      rows: [
        {
          id: 50,
          organization_id: "org-a",
          source_record_id: 100,
          source_id: 200,
          scope_type: "project",
          scope_id: "alpha",
          project_key: "alpha",
          kind: "decision",
          title: null,
          content: "Decision: ship Friday",
          summary: null,
          durability: "durable",
          importance: 5,
          original_created_at: new Date("2026-04-25T00:00:00.000Z"),
          original_updated_at: "2026-04-25T01:00:00.000Z",
          unarchived_at: null,
        },
      ],
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
});

describe("MemoryArchiveRepository.restoreToCanonical (P19.1)", () => {
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
    const { pool, query } = makeMockPool(async () => ({ rows: [{ id: 999 }] }));
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

  it("rejects when archive.organizationId disagrees with caller org (cross-tenant guard)", async () => {
    const { pool } = makeMockPool(async () => ({ rows: [{ id: 1 }] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.restoreToCanonical(makeArchive(), "org-b"),
    ).rejects.toThrow(/org mismatch/);
  });

  it("rejects when archive predates P19.1 (sourceId is null)", async () => {
    const { pool } = makeMockPool(async () => ({ rows: [{ id: 1 }] }));
    const repo = createMemoryArchiveRepository(pool);

    await expect(
      repo.restoreToCanonical(makeArchive({ sourceId: null }), "org-a"),
    ).rejects.toThrow(/no source_id/);
  });
});

describe("MemoryArchiveRepository.markUnarchived (P19.1)", () => {
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
});
