import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyCompaction } from "../../src/compact/apply-compaction.js";
import { runIngestSweep } from "../../src/compact/ingest-sweeper.js";
import { unarchiveCompaction } from "../../src/compact/unarchive-compaction.js";
import {
  createPgPool,
  type PgPool,
  type PgPoolClient,
  type PgQueryable,
  type PgQueryRow,
} from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrate.js";
import { createGoalRunRepository } from "../../src/goal-run/goal-run-repository.js";
import { createIngestJobRepository } from "../../src/jobs/ingest-job-repository.js";
import { rootLogger } from "../../src/logger.js";
import {
  createMemoryChunkRepository,
  refreshCanonicalMemoryIndex,
  writeCanonicalMemory,
  type ChunkEmbeddingConfig,
  type EmbeddingClient,
} from "../../src/store/canonical-indexing.js";
import { createMemoryArchiveRepository } from "../../src/store/memory-archive-repository.js";
import { createMemoryRepository } from "../../src/store/memory-repository.js";
import {
  createMemoryWriteCoordinator,
  createPendingIndexJob,
  type MemoryWriteScope,
} from "../../src/store/memory-write-coordinator.js";
import type { AddMemoryInput, IngestJob } from "../../src/types.js";
import { createPgVectorIndex } from "../../src/vector/pgvector-index.js";
import type { VectorIndex, VectorPoint } from "../../src/vector/vector-index.js";

// CI opts in explicitly; an opted-in connection/migration failure must fail.
// PGVECTOR_TEST_URL selects the pgvector CI service when present.
const ENABLED = process.env.AKASHA_WRITE_CONCURRENCY_TEST === "1";
const HAS_PGVECTOR_URL = Boolean(process.env.PGVECTOR_TEST_URL?.trim());
const scopeRef = { scopeType: "project" as const, scopeId: "write-concurrency" };
const embedding: ChunkEmbeddingConfig = {
  provider: "local",
  model: "deterministic-test",
  dimensions: 3,
  version: "write-concurrency-v1",
  targetTokens: 32,
  overlapTokens: 0,
};

type ClientErrorEvents = Required<Pick<PgPoolClient, "on" | "removeListener">>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function gate() {
  const ready = deferred<void>();
  return { promise: ready.promise, open: () => ready.resolve() };
}

async function beforeTaskEnds<T>(signal: Promise<T>, task: Promise<unknown>): Promise<T> {
  return Promise.race([
    signal,
    task.then(() => { throw new Error("writer ended before reaching the test barrier"); }),
  ]);
}

async function waitForAdvisoryWait(pool: PgPool, pid: number, task: Promise<unknown>): Promise<void> {
  const ended = task.then(() => { throw new Error("competing writer did not wait for the advisory lock"); });
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await Promise.race([
      pool.query<{ waiting: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_locks
           WHERE pid = $1 AND locktype = 'advisory' AND NOT granted
         ) AS waiting`,
        [pid],
      ),
      ended,
    ]);
    if (result.rows[0]?.waiting) return;
  }
  throw new Error(`backend ${pid} did not expose an advisory-lock wait`);
}

function observeQueries(
  pool: PgPool,
  before: (sql: string, values: readonly unknown[] | undefined, connection: PgQueryable) => Promise<void>,
): PgPool {
  const query = async <TRow extends PgQueryRow = PgQueryRow>(sql: string, values?: readonly unknown[]) => {
    await before(sql, values, pool);
    return pool.query<TRow>(sql, values);
  };
  return {
    query,
    async connect() {
      const client = await pool.connect();
      return {
        async query<TRow extends PgQueryRow = PgQueryRow>(sql: string, values?: readonly unknown[]) {
          await before(sql, values, client);
          return client.query<TRow>(sql, values);
        },
        release: (error?: Error | boolean) => client.release(error),
        ...(client.on ? { on: client.on.bind(client) } : {}),
        ...(client.removeListener ? { removeListener: client.removeListener.bind(client) } : {}),
        ...(client.assertUsable ? { assertUsable: client.assertUsable.bind(client) } : {}),
      };
    },
    end: () => pool.end(),
  };
}

function memoryInput(organizationId: string, content = "initial memory"): AddMemoryInput {
  return {
    ...scopeRef,
    organizationId,
    projectKey: scopeRef.scopeId,
    memoryType: "fact",
    content,
    durability: "durable",
    importance: 0,
    source: { ...scopeRef, sourceType: "document", sourceRef: `test://${randomUUID()}` },
  };
}

function externalVectorStore(makeGate: () => ReturnType<typeof gate>) {
  const points = new Map<string, VectorPoint>();
  let upsertCount = 0;
  let beforeNextUpsert: (() => Promise<void>) | undefined;
  const index: VectorIndex = {
    async ensureCollection() {},
    async query() { return []; },
    async upsert(batch) {
      upsertCount += 1;
      const before = beforeNextUpsert;
      beforeNextUpsert = undefined;
      await before?.();
      for (const point of batch) points.set(point.id, point);
    },
    async delete(ids, options) {
      for (const id of ids) {
        const point = points.get(id);
        if (!options?.organizationId || point?.payload.organization_id === options.organizationId) points.delete(id);
      }
    },
    async deleteByRecordIds(ids, options) {
      for (const [id, point] of points) {
        if (ids.includes(Number(point.payload.memory_record_id)) &&
          (!options?.organizationId || point.payload.organization_id === options.organizationId)) points.delete(id);
      }
    },
  };
  return {
    index,
    points,
    get upsertCount() { return upsertCount; },
    pauseNextUpsert() {
      const entered = makeGate();
      const release = makeGate();
      beforeNextUpsert = async () => { entered.open(); await release.promise; };
      return { entered: entered.promise, release: release.open };
    },
  };
}

function testPool(connectionString: string): PgPool {
  return createPgPool({ connectionString, max: 1, connectionTimeoutMillis: 2_000 });
}

async function withFixture<T>(connectionString: string, work: (test: ReturnType<typeof fixture>) => Promise<T>) {
  const test = fixture(connectionString);
  try {
    return await work(test);
  } finally {
    await test.close();
  }
}

function fixture(connectionString: string) {
  const organizationId = `write-test-${randomUUID()}`;
  const poolA = testPool(connectionString);
  const poolB = testPool(connectionString);
  const observer = testPool(connectionString);
  const gates: ReturnType<typeof gate>[] = [];
  const pending: Promise<unknown>[] = [];
  const embedBatches: string[][] = [];
  const makeGate = () => { const next = gate(); gates.push(next); return next; };
  const vectors = externalVectorStore(makeGate);
  const embeddings: EmbeddingClient = {
    async embed() { return [1, 0, 0]; },
    async embedBatch(texts) { embedBatches.push(texts); return texts.map(() => [1, 0, 0]); },
  };
  function actor(pool: PgPool, vectorIndexForPool = (_pool: PgPool): VectorIndex => vectors.index): MemoryWriteScope {
    return {
      repository: createMemoryRepository(pool),
      chunkRepository: createMemoryChunkRepository(pool),
      ingestJobs: createIngestJobRepository(pool),
      archiveRepository: createMemoryArchiveRepository(pool),
      goalRuns: createGoalRunRepository(pool),
      embedding,
      embeddings,
      vectorIndex: vectorIndexForPool(pool),
      writes: createMemoryWriteCoordinator({ pool, vectorIndexForPool, embedding, embeddings }),
    };
  }
  return {
    organizationId, poolA, poolB, observer, vectors, embedBatches, actor,
    a: actor(poolA), b: actor(poolB), gate: makeGate,
    track<T>(task: Promise<T>): Promise<T> {
      pending.push(task);
      void task.catch(() => undefined);
      return task;
    },
    async pid(pool: PgPool) {
      const result = await pool.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      return result.rows[0]!.pid;
    },
    async close() {
      for (const held of gates) held.open();
      await Promise.allSettled(pending);
      try {
        // Only this case's sources; FK cascades remove its canonical/index jobs.
        await observer.query("DELETE FROM sources WHERE organization_id = $1", [organizationId]);
      } finally {
        await Promise.all([poolA.end(), poolB.end(), observer.end()]);
      }
    },
  };
}

async function updateAndRefresh(scope: MemoryWriteScope, id: number, organizationId: string) {
  let job: IngestJob | undefined;
  const record = await scope.repository.updateMemoryRecord({ id, organizationId, content: "refreshed memory" }, async (updated) => {
    job = await createPendingIndexJob(scope.ingestJobs, updated.id, organizationId);
  });
  if (!record || !job) throw new Error("update did not persist its indexing intent");
  return refreshCanonicalMemoryIndex({ ...scope, record, job });
}

async function archiveAndClean(scope: MemoryWriteScope, id: number, organizationId: string) {
  let job: IngestJob | undefined;
  const result = await scope.repository.archiveMemoryRecord({ id, organizationId }, async (recordId) => {
    job = await createPendingIndexJob(scope.ingestJobs, recordId, organizationId);
  });
  if (!job) throw new Error("archive did not persist its cleanup intent");
  await scope.vectorIndex.deleteByRecordIds([id], { organizationId });
  await scope.ingestJobs.markQdrantCompleted(job.id);
  await scope.ingestJobs.markCompleted(job.id);
  return result;
}

describe.skipIf(!ENABLED)("memory write coordination against real Postgres", () => {
  const databaseName = `akasha_write_${randomUUID().replaceAll("-", "")}`;
  let admin: PgPool | undefined;
  let createdDatabase = false;
  let databaseUrl: string;

  beforeAll(async () => {
    const sourceUrl = process.env.PGVECTOR_TEST_URL ?? process.env.DATABASE_URL;
    if (!sourceUrl?.trim()) throw new Error("write concurrency tests require DATABASE_URL or PGVECTOR_TEST_URL");
    const url = new URL(sourceUrl);
    const adminUrl = new URL(url);
    adminUrl.pathname = "/postgres";
    admin = testPool(adminUrl.toString());
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    createdDatabase = true;
    url.pathname = `/${databaseName}`;
    databaseUrl = url.toString();
    const migrationPool = testPool(databaseUrl);
    try {
      await runMigrations(migrationPool);
    } finally {
      await migrationPool.end();
    }
  }, 15_000);

  afterAll(async () => {
    try {
      if (createdDatabase && admin) await admin.query(`DROP DATABASE "${databaseName}"`);
    } finally {
      await admin?.end();
    }
  }, 15_000);

  it("serializes read plus update across independent single-connection pools", async () => {
    await withFixture(databaseUrl, async (test) => {
      const { organizationId, a, b } = test;
      const record = await a.repository.addMemory(memoryInput(organizationId));
      const firstRead = test.gate();
      const releaseFirst = test.gate();
      const pidB = await test.pid(test.poolB);
      const first = test.track(a.writes.record(organizationId, [record.id], async (scope) => {
        const current = await scope.repository.getMemoryRecordById(record.id, organizationId);
        firstRead.open();
        await releaseFirst.promise;
        await scope.repository.updateMemoryRecord({ id: record.id, organizationId, content: `${current!.content} first` });
      }));
      await beforeTaskEnds(firstRead.promise, first);
      let secondEntered = false;
      const second = test.track(b.writes.record(organizationId, [record.id], async (scope) => {
        secondEntered = true;
        const current = await scope.repository.getMemoryRecordById(record.id, organizationId);
        await scope.repository.updateMemoryRecord({ id: record.id, organizationId, content: `${current!.content} second` });
        return current!.content;
      }));

      await waitForAdvisoryWait(test.observer, pidB, second);
      expect(secondEntered).toBe(false);
      releaseFirst.open();
      const [, secondSnapshot] = await Promise.all([first, second]);
      expect(secondSnapshot).toBe("initial memory first");
      expect((await a.repository.getMemoryRecordById(record.id, organizationId))?.content).toBe("initial memory first second");
    });
  }, 15_000);

  it("locks a new ID before its canonical record and pending intent become visible together", async () => {
    await withFixture(databaseUrl, async (test) => {
      const { organizationId } = test;
      const atCommit = deferred<{ id: number; jobId: number }>();
      const allowCommit = test.gate();
      const committed = test.gate();
      const finishCreate = test.gate();
      const observed = observeQueries(test.poolA, async (sql, _values, connection) => {
        if (sql.trim() !== "COMMIT") return;
        const result = await connection.query<{ id: string; job_id: string; qdrant_status: string; qdrant_next_retry_at: Date | null }>(
          `SELECT mr.id, j.id AS job_id, j.qdrant_status, j.qdrant_next_retry_at
           FROM memory_records mr JOIN ingest_jobs j ON j.memory_record_id = mr.id
           WHERE mr.organization_id = $1`,
          [organizationId],
        );
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]!.qdrant_status).toBe("pending");
        expect(result.rows[0]!.qdrant_next_retry_at).not.toBeNull();
        atCommit.resolve({ id: Number(result.rows[0]!.id), jobId: Number(result.rows[0]!.job_id) });
        await allowCommit.promise;
      });
      const pidB = await test.pid(test.poolB);
      const creating = test.track(test.actor(observed).writes.create(memoryInput(organizationId), async (_scope, record, job) => {
        expect(job.memoryRecordId).toBe(record.id);
        committed.open();
        await finishCreate.promise;
        return record;
      }));
      const ids = await beforeTaskEnds(atCommit.promise, creating);
      const invisible = await test.observer.query<{ records: string; jobs: string }>(
        `SELECT (SELECT count(*) FROM memory_records WHERE organization_id = $1) AS records,
                (SELECT count(*) FROM ingest_jobs WHERE organization_id = $1) AS jobs`, [organizationId],
      );
      expect(invisible.rows[0]).toEqual({ records: "0", jobs: "0" });
      const competing = test.track(test.b.writes.record(organizationId, [ids.id], async (scope) => {
        const record = await scope.repository.getMemoryRecordById(ids.id, organizationId);
        const job = await scope.ingestJobs.getById!(ids.jobId, organizationId);
        expect(record?.id).toBe(ids.id);
        expect(job?.memoryRecordId).toBe(ids.id);
      }));
      await waitForAdvisoryWait(test.observer, pidB, competing);
      allowCommit.open();
      await beforeTaskEnds(committed.promise, creating);
      const visible = await test.observer.query<{ records: string; jobs: string }>(
        `SELECT (SELECT count(*) FROM memory_records WHERE organization_id = $1) AS records,
                (SELECT count(*) FROM ingest_jobs WHERE organization_id = $1
                 AND qdrant_status = 'pending' AND qdrant_next_retry_at IS NOT NULL) AS jobs`, [organizationId],
      );
      expect(visible.rows[0]).toEqual({ records: "1", jobs: "1" });
      await waitForAdvisoryWait(test.observer, pidB, competing);
      finishCreate.open();
      await Promise.all([creating, competing]);
    });
  }, 15_000);

  it("rolls back canonical data when the initial pending intent cannot be stored", async () => {
    await withFixture(databaseUrl, async (test) => {
      const observed = observeQueries(test.poolA, async (sql) => {
        if (sql.includes("INSERT INTO ingest_jobs")) throw new Error("injected initial intent failure");
      });
      await expect(test.actor(observed).writes.create(memoryInput(test.organizationId), async () => undefined))
        .rejects.toThrow("injected initial intent failure");
      const result = await test.observer.query<{ sources: string; records: string; jobs: string }>(
        `SELECT (SELECT count(*) FROM sources WHERE organization_id = $1) AS sources,
                (SELECT count(*) FROM memory_records WHERE organization_id = $1) AS records,
                (SELECT count(*) FROM ingest_jobs WHERE organization_id = $1) AS jobs`, [test.organizationId],
      );
      expect(result.rows[0]).toEqual({ sources: "0", records: "0", jobs: "0" });
    });
  }, 15_000);

  it("finishes a long refresh before archiving and leaves no late external vectors", async () => {
    await withFixture(databaseUrl, async (test) => {
      const { a, b, organizationId } = test;
      const record = await writeCanonicalMemory({ ...a, memory: memoryInput(organizationId) });
      const delayed = test.vectors.pauseNextUpsert();
      const pidB = await test.pid(test.poolB);
      const refresh = test.track(a.writes.record(organizationId, [record.id], (scope) => updateAndRefresh(scope, record.id, organizationId)));
      await beforeTaskEnds(delayed.entered, refresh);
      const archive = test.track(b.writes.record(organizationId, [record.id], (scope) => archiveAndClean(scope, record.id, organizationId)));
      await waitForAdvisoryWait(test.observer, pidB, archive);
      expect((await createMemoryRepository(test.observer).getMemoryRecordById(record.id, organizationId))?.durability).toBe("durable");
      delayed.release();
      const [, archived] = await Promise.all([refresh, archive]);

      expect(archived.archived).toBe(true);
      expect((await a.repository.getMemoryRecordById(record.id, organizationId))?.durability).toBe("archived");
      expect(test.vectors.points.size).toBe(0);
      const jobs = await test.observer.query<{ status: string; qdrant_status: string }>(
        "SELECT status, qdrant_status FROM ingest_jobs WHERE memory_record_id = $1", [record.id],
      );
      expect(jobs.rows.length).toBeGreaterThan(0);
      expect(jobs.rows.every((job) => job.status === "completed" && job.qdrant_status === "completed")).toBe(true);
    });
  }, 15_000);

  it("skips a claimed job that another writer completes while the sweeper waits", async () => {
    await withFixture(databaseUrl, async (test) => {
      const { a, b, organizationId } = test;
      const { record, job } = await a.writes.create(memoryInput(organizationId), async (_scope, record, job) => ({ record, job }));
      await a.ingestJobs.markQdrantPending({ jobId: job.id, attempts: 0, nextRetryAt: new Date(0) });
      const held = test.gate();
      const release = test.gate();
      const pidB = await test.pid(test.poolB);
      const writer = test.track(a.writes.record(organizationId, [record.id], async (scope) => {
        held.open();
        await release.promise;
        await scope.ingestJobs.markQdrantCompleted(job.id);
        await scope.ingestJobs.markCompleted(job.id);
      }));
      await beforeTaskEnds(held.promise, writer);
      const sweep = test.track(runIngestSweep({ ...b, logger: rootLogger }));
      await waitForAdvisoryWait(test.observer, pidB, sweep);
      release.open();
      const [, result] = await Promise.all([writer, sweep]);

      expect(result).toEqual({ scanned: 1, completed: 0, retried: 0, failed: 0 });
      expect(test.embedBatches).toEqual([]);
      expect(test.vectors.upsertCount).toBe(0);
      expect(await b.chunkRepository.getChunksByRecordId(record.id)).toEqual([]);
      expect((await b.ingestJobs.getById!(job.id, organizationId))?.qdrantStatus).toBe("completed");
    });
  }, 15_000);

  it("rejects a lost lock connection before vector upsert and lets another writer recover its pending intent", async () => {
    await withFixture(databaseUrl, async (test) => {
      const { a, b, organizationId } = test;
      const embeddingStarted = test.gate();
      const releaseEmbedding = test.gate();
      const connectionFailure = deferred<Error>();
      const onError = (error: Error) => connectionFailure.resolve(error);
      let writerClient: (PgPoolClient & ClientErrorEvents) | undefined;
      let writerPid = 0;
      const writerPool: PgPool = {
        async query<TRow extends PgQueryRow = PgQueryRow>(sql: string, values?: readonly unknown[]) {
          return test.poolA.query<TRow>(sql, values);
        },
        async connect() {
          const client = await test.poolA.connect() as PgPoolClient & ClientErrorEvents;
          writerClient = client;
          client.on("error", onError);
          try {
            const result = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
            writerPid = result.rows[0]!.pid;
            return client;
          } catch (error: unknown) {
            client.release(true);
            throw error;
          }
        },
        end: () => test.poolA.end(),
      };
      const blockedEmbeddings: EmbeddingClient = {
        ...a.embeddings,
        async embedBatch(texts) {
          embeddingStarted.open();
          await releaseEmbedding.promise;
          return texts.map(() => [1, 0, 0]);
        },
      };
      const writes = createMemoryWriteCoordinator({
        pool: writerPool, embeddings: blockedEmbeddings, embedding,
        vectorIndexForPool: () => test.vectors.index,
      });
      const writer = test.track(writeCanonicalMemory({
        ...a, writes, embeddings: blockedEmbeddings, memory: memoryInput(organizationId),
      }));
      let settled = false;
      void writer.then(() => { settled = true; }, () => { settled = true; });
      try {
        await beforeTaskEnds(embeddingStarted.promise, writer);
        expect(writerPid).toBeGreaterThan(0);
        expect(writerPid).not.toBe(await test.pid(test.observer));
        const committed = await test.observer.query<{
          id: string; job_id: string; qdrant_status: string; chunks: string; locked: boolean;
        }>(
          `SELECT mr.id, j.id AS job_id, j.qdrant_status,
                  (SELECT count(*) FROM memory_chunks WHERE memory_record_id = mr.id) AS chunks,
                  EXISTS (SELECT 1 FROM pg_locks WHERE pid = $2 AND locktype = 'advisory' AND granted) AS locked
           FROM memory_records mr JOIN ingest_jobs j ON j.memory_record_id = mr.id
           WHERE mr.organization_id = $1`, [organizationId, writerPid],
        );
        expect(committed.rows).toHaveLength(1);
        expect(committed.rows[0]).toMatchObject({ qdrant_status: "pending", locked: true });
        expect(Number(committed.rows[0]!.chunks)).toBeGreaterThan(0);
        const recordId = Number(committed.rows[0]!.id);
        const jobId = Number(committed.rows[0]!.job_id);

        // This PID was borrowed by this writer in this suite's private database.
        const terminated = await test.observer.query<{ terminated: boolean }>(
          `SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity
           WHERE pid = $1 AND datname = current_database()`, [writerPid],
        );
        expect(terminated.rows).toEqual([{ terminated: true }]);
        const error = await beforeTaskEnds(connectionFailure.promise, writer);
        expect(error).toBeInstanceOf(Error);
        const pending = await b.ingestJobs.getById!(jobId, organizationId);
        expect(pending).toMatchObject({ status: "pending", qdrantStatus: "pending" });
        expect(pending!.qdrantNextRetryAt).not.toBeNull();
        expect(settled).toBe(false);
        releaseEmbedding.open();
        await expect(writer).rejects.toThrow();

        expect(test.vectors.upsertCount).toBe(0);
        expect(test.vectors.points.size).toBe(0);
        expect(await b.repository.getMemoryRecordById(recordId, organizationId)).toMatchObject({ content: "initial memory" });
        expect(await b.ingestJobs.getById!(jobId, organizationId)).toMatchObject({ status: "pending", qdrantStatus: "pending" });
        await b.ingestJobs.markQdrantPending({ jobId, attempts: 0, nextRetryAt: new Date(0) });

        expect(await runIngestSweep({ ...b, logger: rootLogger }))
          .toEqual({ scanned: 1, completed: 1, retried: 0, failed: 0 });
        expect(test.vectors.upsertCount).toBe(1);
        expect(test.vectors.points.size).toBe(Number(committed.rows[0]!.chunks));
        expect(await b.ingestJobs.getById!(jobId, organizationId)).toMatchObject({ status: "completed", qdrantStatus: "completed" });
      } finally {
        releaseEmbedding.open();
        await Promise.allSettled([writer]);
        writerClient?.removeListener("error", onError);
      }
    });
  }, 15_000);

  it("recovers committed canonical data and a pending intent even when no chunks were written", async () => {
    await withFixture(databaseUrl, async (test) => {
      const { a, b, organizationId } = test;
      const { record, job } = await a.writes.create(memoryInput(organizationId), async (_scope, record, job) => ({ record, job }));
      expect(await a.chunkRepository.getChunksByRecordId(record.id)).toEqual([]);
      await a.ingestJobs.markQdrantPending({ jobId: job.id, attempts: 0, nextRetryAt: new Date(0) });

      const result = await runIngestSweep({ ...b, logger: rootLogger });

      expect(result).toEqual({ scanned: 1, completed: 1, retried: 0, failed: 0 });
      const chunks = await b.chunkRepository.getChunksByRecordId(record.id);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.map((chunk) => chunk.content).join(" ")).toContain(record.content);
      expect([...test.vectors.points.values()].every((point) => point.payload.memory_record_id === record.id)).toBe(true);
      expect(test.vectors.points.size).toBe(chunks.length);
      expect(await b.ingestJobs.getById!(job.id, organizationId)).toMatchObject({ status: "completed", qdrantStatus: "completed" });
    });
  }, 15_000);

  it("restores the same archive exactly once across concurrent writers", async () => {
    await withFixture(databaseUrl, async (test) => {
      const { a, b, organizationId } = test;
      const record = await a.repository.addMemory(memoryInput(organizationId));
      const planGeneratedAt = new Date(Date.now() + 60_000);
      const run = await a.archiveRepository.createCompactionRun({
        organizationId, actor: "integration-test", scopeType: scopeRef.scopeType,
        scopeId: scopeRef.scopeId, dryRun: false, planGeneratedAt, idempotencyKey: randomUUID(),
      });
      const archived = await a.writes.record(organizationId, [record.id], (scope) => scope.archiveRepository.applyCompactionRecord({
        runId: run.id, organizationId, recordId: record.id, reason: "decay", planGeneratedAt,
      }));
      if (!archived.archiveId) throw new Error("fixture record was not archived");
      const archiveId = archived.archiveId;
      const input = { organizationId, archiveIds: [archiveId], actor: "integration-test" };
      const delayed = test.vectors.pauseNextUpsert();
      const pidB = await test.pid(test.poolB);
      const first = test.track(unarchiveCompaction(input, { ...a, logger: rootLogger }));
      await beforeTaskEnds(delayed.entered, first);
      const committed = await test.observer.query<{ restored: string; jobs: string; marked: boolean }>(
        `SELECT (SELECT count(*) FROM memory_records WHERE organization_id = $1) AS restored,
                (SELECT count(*) FROM ingest_jobs WHERE organization_id = $1 AND qdrant_status = 'pending') AS jobs,
                (SELECT unarchived_at IS NOT NULL FROM memory_archive WHERE id = $2) AS marked`,
        [organizationId, archiveId],
      );
      expect(committed.rows[0]).toEqual({ restored: "1", jobs: "1", marked: true });
      const second = test.track(unarchiveCompaction(input, { ...b, logger: rootLogger }));
      await waitForAdvisoryWait(test.observer, pidB, second);
      delayed.release();
      const outcomes = await Promise.all([first, second]);

      expect(outcomes.map((result) => result.restoredCount)).toEqual([1, 0]);
      expect(outcomes.map((result) => result.skippedCount)).toEqual([0, 1]);
      expect(outcomes.every((result) => result.failedCount === 0)).toBe(true);
      expect(outcomes[1]!.outcomes[0]).toMatchObject({ status: "skipped", reason: "already_unarchived" });
      const records = await a.repository.listMemory(scopeRef, { organizationId });
      expect(records).toHaveLength(1);
      expect(records[0]!.id).not.toBe(record.id);
      expect(records[0]!.content).toBe(record.content);
    });
  }, 15_000);

  it("rechecks an active-goal pin under the record lock after compaction planning", async () => {
    await withFixture(databaseUrl, async (test) => {
      const { a, b, organizationId } = test;
      const record = await a.repository.addMemory(memoryInput(organizationId));
      const planned = await a.repository.listMemory(scopeRef, { organizationId, excludePinnedGoalRuns: true });
      expect(planned).toHaveLength(1);
      const goal = await a.goalRuns.start({ ...scopeRef, organizationId, goal: "protect current work" });
      const pinned = test.gate();
      const release = test.gate();
      const pidB = await test.pid(test.poolB);
      const pin = test.track(a.writes.record(organizationId, [record.id], async (scope) => {
        await scope.goalRuns.recordIteration({
          organizationId, goalRunId: goal.id, attempt: "link canonical evidence", outcome: "partial", memoryIds: [record.id],
        });
        pinned.open();
        await release.promise;
      }));
      await beforeTaskEnds(pinned.promise, pin);
      const apply = test.track(applyCompaction({
        records: planned, scope: scopeRef.scopeType, scopeLabel: scopeRef.scopeId,
        organizationId, actor: "integration-test", dryRun: false,
      }, { ...b, logger: rootLogger, applyRateLimit: { windowMs: 0, maxRuns: 1 } }));
      await waitForAdvisoryWait(test.observer, pidB, apply);
      release.open();
      const [, result] = await Promise.all([pin, apply]);

      expect(result.decayCandidates.map((candidate) => candidate.id)).toContain(String(record.id));
      expect(result.applyStats).toMatchObject({ archived: 0, skipped: 1 });
      expect(await a.repository.getMemoryRecordById(record.id, organizationId)).not.toBeNull();
      expect(await a.repository.listMemory(scopeRef, { organizationId, excludePinnedGoalRuns: true })).toEqual([]);
      const archives = await test.observer.query<{ count: string }>("SELECT count(*) FROM memory_archive WHERE organization_id = $1", [organizationId]);
      expect(archives.rows[0]!.count).toBe("0");
    });
  }, 15_000);

  it.skipIf(!HAS_PGVECTOR_URL)("uses the reserved max:1 connection for pgvector indexing and cleanup", async () => {
    await withFixture(databaseUrl, async (test) => {
      await test.observer.query("CREATE EXTENSION IF NOT EXISTS vector");
      const actor = test.actor(test.poolA, (pool) => createPgVectorIndex(pool, { tableName: "write_test_vectors" }));
      await actor.vectorIndex.ensureCollection(embedding.dimensions);

      const record = await writeCanonicalMemory({ ...actor, memory: memoryInput(test.organizationId) });
      await actor.writes.record(test.organizationId, [record.id], (scope) => updateAndRefresh(scope, record.id, test.organizationId));
      const hits = await actor.vectorIndex.query([1, 0, 0], { organizationId: test.organizationId, scopes: [scopeRef] }, 5);

      expect(hits).toHaveLength(1);
      expect(hits[0]!.payload.memory_record_id).toBe(record.id);
      await actor.writes.record(test.organizationId, [record.id], (scope) => archiveAndClean(scope, record.id, test.organizationId));
      expect(await actor.vectorIndex.query([1, 0, 0], { organizationId: test.organizationId, scopes: [scopeRef] }, 5)).toEqual([]);
    });
  }, 15_000);
});
