import { describe, expect, it, vi } from "vitest";
import { unarchiveCompaction, type UnarchiveCompactionDeps } from "../../src/compact/unarchive-compaction.js";
import type { PgPool } from "../../src/db/connection.js";
import { createMemoryWriteCoordinator } from "../../src/store/memory-write-coordinator.js";

const timestamp = "2026-04-25T00:00:00.000Z";
const updatedAt = "2026-04-25T01:00:00.000Z";
const archiveKey = JSON.stringify(["akasha", "archive", "org-a", 50]);
const recordKey = JSON.stringify(["akasha", "record", "org-a", 999]);
const archiveRow = {
  id: "50", organization_id: "org-a", source_record_id: "100", source_id: "200",
  scope_type: "project", scope_id: "alpha", project_key: "alpha", kind: "decision",
  title: null, content: "Decision: ship Friday", summary: null, durability: "durable", importance: 5,
  original_created_at: timestamp, original_updated_at: updatedAt, unarchived_at: null,
};
const memoryRow = {
  ...archiveRow, id: "999", created_at: timestamp, updated_at: updatedAt, tags: [],
  source_id_joined: "200", source_organization_id: "org-a", source_scope_type: "project",
  source_scope_id: "alpha", source_type: "document", source_title: "original source",
  source_ref: '{"sourceRef":"original-source","uri":"https://example.com/original"}',
  source_created_at: timestamp,
};

type State = { canonical: boolean; job: boolean; retryAt: Date | null; unarchivedAt: string | null };

function fixture(options: { failAt?: string; archivePatch?: Record<string, unknown> } = {}) {
  let committed: State = { canonical: false, job: false, retryAt: null, unarchivedAt: null };
  let transaction: State | undefined;
  const events: string[] = [];
  const held = new Set<string>();
  const jobRow = () => ({
    id: "31", memory_record_id: "999", organization_id: "org-a", status: "pending", attempts: 0,
    last_error: null, qdrant_status: "pending", qdrant_attempts: 0,
    qdrant_next_retry_at: (transaction ?? committed).retryAt, qdrant_last_error: null,
    created_at: timestamp, updated_at: timestamp,
  });
  function step(event: string): void {
    events.push(event);
    if (options.failAt === event) throw new Error(`${event} failed`);
  }
  const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    if (sql.includes("pg_advisory_unlock")) {
      held.delete(String(params[0]));
      step(params[0] === recordKey ? "record_unlock" : "archive_unlock");
      return { rows: [{ unlocked: true }] };
    }
    if (sql.includes("pg_advisory_lock")) {
      if (params[0] === recordKey) {
        expect(transaction?.canonical).toBe(true);
        expect(committed.canonical).toBe(false);
        expect(held.has(archiveKey)).toBe(true);
      }
      held.add(String(params[0]));
      step(params[0] === recordKey ? "record_lock" : "archive_lock");
      return { rows: [] };
    }
    if (sql.includes("FROM memory_archive")) {
      expect(held.has(archiveKey)).toBe(true);
      expect(params).toEqual([[50], "org-a"]);
      step("archive_read");
      return { rows: [{ ...archiveRow, unarchived_at: committed.unarchivedAt, ...options.archivePatch }] };
    }
    if (sql === "BEGIN") {
      step("BEGIN");
      expect(transaction).toBeUndefined();
      transaction = { ...committed };
      return { rows: [] };
    }
    if (sql === "COMMIT") {
      step("COMMIT");
      committed = transaction!;
      transaction = undefined;
      return { rows: [] };
    }
    if (sql === "ROLLBACK") {
      step("ROLLBACK");
      transaction = undefined;
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO memory_records")) {
      step("canonical_insert");
      expect(params.slice(-3)).toEqual([200, timestamp, updatedAt]);
      transaction!.canonical = true;
      return { rows: [{ id: "999" }] };
    }
    if (sql.includes("INSERT INTO ingest_jobs")) {
      step("job_insert");
      expect(params).toEqual([999, "org-a"]);
      transaction!.job = true;
      return { rows: [jobRow()] };
    }
    if (sql.includes("UPDATE ingest_jobs")) {
      step("job_pending");
      (transaction ?? committed).retryAt = params[2] as Date;
      return { rows: [jobRow()] };
    }
    if (sql.includes("UPDATE memory_archive")) {
      step("archive_mark");
      expect(params).toEqual([50]);
      transaction!.unarchivedAt = timestamp;
      return { rows: [] };
    }
    if (sql.includes("FROM memory_records mr")) {
      step("canonical_read");
      expect(params).toEqual([999, "org-a"]);
      return { rows: [memoryRow] };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  });
  const release = vi.fn();
  const connect = vi.fn().mockResolvedValue({ query, release });
  const poolQuery = vi.fn(() => { throw new Error("unreserved pool query"); });
  const pool = { query: poolQuery, connect, end: vi.fn() } as unknown as PgPool;
  const embeddings = {
    embed: vi.fn(),
    embedBatch: vi.fn(async (_text: string[]) => {
      step("index");
      expect(transaction).toBeUndefined();
      expect(committed).toMatchObject({ canonical: true, job: true, unarchivedAt: timestamp });
      expect(committed.retryAt).toBeInstanceOf(Date);
      expect([...held]).toEqual([archiveKey, recordKey]);
      throw new Error("embedding unavailable");
    }),
  };
  const vectorIndex = {
    upsert: vi.fn(), query: vi.fn(), delete: vi.fn(), deleteByRecordIds: vi.fn(), ensureCollection: vi.fn(),
  };
  const writes = createMemoryWriteCoordinator({
    pool, embeddings, vectorIndexForPool: () => vectorIndex,
    embedding: { provider: "local", model: "fixture", dimensions: 3, version: "v1", targetTokens: 256, overlapTokens: 32 },
  });
  const deps: UnarchiveCompactionDeps = {
    archiveRepository: { findArchiveByIds: vi.fn(() => { throw new Error("unlocked archive read"); }) } as never,
    chunkRepository: {} as never,
    embeddings, vectorIndex,
    embedding: { provider: "local", model: "fixture", dimensions: 3, version: "v1", targetTokens: 256, overlapTokens: 32 },
    logger: { error: vi.fn() } as never,
    writes,
  };
  return { writes, deps, query, connect, poolQuery, release, events, held, state: () => committed };
}

describe("atomic unarchive", () => {
  it("locks the new id before commit and passes the actual canonical row and pending job to indexing", async () => {
    const f = fixture();

    const record = await f.writes.archive("org-a", 50, async (scope) => {
      const [archive] = await scope.archiveRepository.findArchiveByIds([50], "org-a");
      return scope.writes.restore(archive!, "org-a", async (_scope, restored, job) => {
        f.events.push("callback");
        expect([...f.held]).toEqual([archiveKey, recordKey]);
        expect(job).toMatchObject({ id: 31, memoryRecordId: 999, qdrantStatus: "pending" });
        expect(job.qdrantNextRetryAt).not.toBeNull();
        return restored;
      });
    });

    expect(record).toMatchObject({
      id: 999, sourceId: 200, createdAt: timestamp, updatedAt, tags: [],
      source: { id: 200, title: "original source", sourceRef: "original-source", uri: "https://example.com/original" },
    });
    expect(f.events).toEqual([
      "archive_lock", "archive_read", "BEGIN", "canonical_insert", "record_lock",
      "job_insert", "job_pending", "archive_mark", "canonical_read", "COMMIT", "callback",
      "record_unlock", "archive_unlock",
    ]);
    expect(f.connect).toHaveBeenCalledOnce();
    expect(f.poolQuery).not.toHaveBeenCalled();
    expect(f.release).toHaveBeenCalledOnce();
  });

  it("rereads duplicate archive ids under lock and keeps canonical data and its job on index failure", async () => {
    const f = fixture();

    const result = await unarchiveCompaction({ archiveIds: [50, 50], organizationId: "org-a", actor: "test" }, f.deps);

    expect(result).toMatchObject({ restoredCount: 1, skippedCount: 1, failedCount: 0 });
    expect(result.outcomes).toEqual([
      { archiveId: 50, status: "restored", restoredRecordId: 999, sourceRecordId: 100, chunkCount: 0, indexPending: true },
      { archiveId: 50, status: "skipped", reason: "already_unarchived" },
    ]);
    expect(f.state()).toMatchObject({ canonical: true, job: true, unarchivedAt: timestamp });
    expect(f.state().retryAt).toBeInstanceOf(Date);
    expect(f.events.filter((event) => event === "archive_read")).toHaveLength(2);
    expect(f.events.filter((event) => event === "canonical_insert")).toHaveLength(1);
    expect(f.query.mock.calls.some(([sql]) => sql.includes("DELETE FROM memory_records"))).toBe(false);
    expect(f.deps.vectorIndex.delete).not.toHaveBeenCalled();
    expect(f.deps.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "compact.unarchive_index_pending", restoredRecordId: 999 }),
      "canonical memory restored; search indexing is pending retry",
    );
  });

  it.each(["job_insert", "job_pending", "archive_mark", "canonical_read"])("rolls back all restore changes before indexing when %s fails", async (failAt) => {
    const f = fixture({ failAt });

    const result = await unarchiveCompaction({ archiveIds: [50], organizationId: "org-a", actor: "test" }, f.deps);

    expect(result.outcomes).toEqual([{ archiveId: 50, status: "failed", error: `${failAt} failed` }]);
    expect(f.state()).toEqual({ canonical: false, job: false, retryAt: null, unarchivedAt: null });
    expect(f.events).toContain("ROLLBACK");
    expect(f.events).not.toContain("COMMIT");
    expect(f.deps.embeddings.embedBatch).not.toHaveBeenCalled();
    expect(f.deps.vectorIndex.upsert).not.toHaveBeenCalled();
    expect(f.held.size).toBe(0);
  });

  it.each([
    { archivePatch: { organization_id: "org-b" }, reason: "archive_not_found_or_org_mismatch" },
    { archivePatch: { unarchived_at: timestamp }, reason: "already_unarchived" },
    { archivePatch: { source_id: null }, reason: "pre_p19.1_archive_missing_source_id" },
  ])("skips a freshly reread archive without starting a restore transaction: $reason", async ({ archivePatch, reason }) => {
    const f = fixture({ archivePatch });

    const result = await unarchiveCompaction({ archiveIds: [50], organizationId: "org-a", actor: "test" }, f.deps);

    expect(result.outcomes).toEqual([{ archiveId: 50, status: "skipped", reason }]);
    expect(f.events).toEqual(["archive_lock", "archive_read", "archive_unlock"]);
  });
});
