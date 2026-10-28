import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../../src/store/memory-repository.js";
import type { AddMemoryInput, SearchMemoryResult } from "../../src/types.js";

const scope = { scopeType: "project" as const, scopeId: "project-a" };
const memoryInput: AddMemoryInput = {
  ...scope,
  organizationId: "org-a",
  memoryType: "fact",
  content: "plain memory",
  summary: "plain summary",
  source: { ...scope, sourceType: "document", sourceRef: "fixture" },
};
const updateInput = {
  id: 42,
  organizationId: "org-a",
  content: "updated memory",
  summary: "updated summary",
  tags: ["fresh"],
};

function hydratedMemoryRow() {
  return {
    id: 42,
    organization_id: "org-a",
    scope_type: "project",
    scope_id: "project-a",
    project_key: null,
    kind: "fact",
    title: null,
    content: "plain memory",
    summary: "plain summary",
    durability: "ephemeral",
    importance: 0,
    source_id: 9,
    created_at: "2026-06-26T00:00:00.000Z",
    updated_at: "2026-06-26T00:00:00.000Z",
    source_id_joined: 9,
    source_organization_id: "org-a",
    source_scope_type: "project",
    source_scope_id: "project-a",
    source_type: "document",
    source_ref: '{"sourceRef":"fixture","uri":null}',
    source_title: null,
    source_created_at: "2026-06-26T00:00:00.000Z",
    tags: ["old"],
  };
}

function transactionFixture(
  rowsForQuery: (
    sql: string,
    params: readonly unknown[],
  ) => Record<string, unknown>[],
) {
  const statements: string[] = [];
  const client = {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      statements.push(sql);
      return { rows: rowsForQuery(sql, params) };
    }),
    release: vi.fn(),
  };
  const pool = {
    query: vi.fn(),
    connect: vi.fn().mockResolvedValue(client),
  };
  return {
    client,
    pool,
    statements,
    repository: createMemoryRepository(pool as never),
  };
}

function writeFixture(missing = false) {
  const row = hydratedMemoryRow();
  let updated = false;
  return transactionFixture((sql) => {
    if (sql.includes("FROM sources") || sql.includes("UPDATE sources")) {
      return [row];
    }
    if (sql.includes("INSERT INTO memory_records")) {
      return [row];
    }
    if (sql.includes("UPDATE memory_records")) {
      updated = true;
      return [{ ...row, content: updateInput.content, summary: updateInput.summary }];
    }
    if (sql.includes("FROM memory_records mr")) {
      return missing ? [] : [{
        ...row,
        ...(updated ? {
          content: updateInput.content,
          summary: updateInput.summary,
          tags: updateInput.tags,
        } : {}),
      }];
    }
    return [];
  });
}

describe("canonical write hooks", () => {
  it.each(["add", "update"] as const)(
    "%s invokes the hook once with the complete returned record before committing",
    async (operation) => {
      const fixture = writeFixture();
      const hook = vi.fn(async (record: SearchMemoryResult) => {
        expect(fixture.statements[0]).toBe("BEGIN");
        expect(fixture.statements).not.toContain("COMMIT");
        expect(record).toMatchObject({
          id: 42,
          organizationId: "org-a",
          ...scope,
          content: operation === "add" ? memoryInput.content : updateInput.content,
          tags: operation === "add" ? [] : ["fresh"],
          source: { id: 9, organizationId: "org-a", sourceRef: "fixture" },
        });
        await fixture.client.query("INSERT INTO ingest_jobs VALUES ($1)", [record.id]);
      });

      const record = operation === "add"
        ? await fixture.repository.addMemory(memoryInput, hook)
        : await fixture.repository.updateMemoryRecord(updateInput, hook);

      expect(hook).toHaveBeenCalledTimes(1);
      expect(hook.mock.calls[0]?.[0]).toBe(record);
      expect(fixture.statements.at(-2)).toBe("INSERT INTO ingest_jobs VALUES ($1)");
      expect(fixture.statements.at(-1)).toBe("COMMIT");
      expect(fixture.client.release).toHaveBeenCalledTimes(1);
      expect(fixture.pool.connect).toHaveBeenCalledTimes(1);
      expect(fixture.pool.query).not.toHaveBeenCalled();
    },
  );

  it.each(["add", "update"] as const)(
    "%s rolls back and releases the same client when the hook fails",
    async (operation) => {
      const fixture = writeFixture();
      const failure = new Error("pending job failed");
      const hook = vi.fn(async (record: SearchMemoryResult) => {
        await fixture.client.query("INSERT INTO ingest_jobs VALUES ($1)", [record.id]);
        throw failure;
      });

      const write = operation === "add"
        ? fixture.repository.addMemory(memoryInput, hook)
        : fixture.repository.updateMemoryRecord(updateInput, hook);

      await expect(write).rejects.toBe(failure);
      expect(hook).toHaveBeenCalledTimes(1);
      expect(fixture.statements).not.toContain("COMMIT");
      expect(fixture.statements.at(-1)).toBe("ROLLBACK");
      expect(fixture.client.release).toHaveBeenCalledTimes(1);
      expect(fixture.pool.query).not.toHaveBeenCalled();
    },
  );

  it("does not invoke the update hook when the scoped record is missing", async () => {
    const fixture = writeFixture(true);
    const hook = vi.fn();

    await expect(
      fixture.repository.updateMemoryRecord(updateInput, hook),
    ).resolves.toBeNull();

    expect(hook).not.toHaveBeenCalled();
    expect(fixture.statements).not.toContain("COMMIT");
    expect(fixture.statements.at(-1)).toBe("ROLLBACK");
    expect(fixture.client.release).toHaveBeenCalledTimes(1);
  });
});

describe("archive write hooks", () => {
  it.each([true, false])(
    "commits cleanup work with the archive, including an already-archived retry (changed=%s)",
    async (archived) => {
      const fixture = transactionFixture((sql, params) => {
        if (!sql.includes("WITH target AS")) {
          return [];
        }
        expect(params).toEqual([42, "org-a"]);
        expect(sql).toMatch(/organization_id = \$2/);
        return [{ archived, found: true, qdrant_point_ids: ["point:42"] }];
      });
      const hook = vi.fn(async (recordId: number) => {
        expect(fixture.statements[0]).toBe("BEGIN");
        expect(fixture.statements).not.toContain("COMMIT");
        await fixture.client.query("INSERT INTO ingest_jobs VALUES ($1)", [recordId]);
      });

      await expect(fixture.repository.archiveMemoryRecord({
        id: 42,
        organizationId: " org-a ",
      }, hook)).resolves.toEqual({ archived, qdrantPointIds: ["point:42"] });

      expect(hook).toHaveBeenCalledTimes(1);
      expect(hook).toHaveBeenCalledWith(42);
      expect(fixture.statements.at(-2)).toBe("INSERT INTO ingest_jobs VALUES ($1)");
      expect(fixture.statements.at(-1)).toBe("COMMIT");
      expect(fixture.client.release).toHaveBeenCalledTimes(1);
      expect(fixture.pool.query).not.toHaveBeenCalled();
    },
  );

  it("rolls the archive back when pending cleanup cannot be persisted", async () => {
    const fixture = transactionFixture((sql) => sql.includes("WITH target AS")
      ? [{ archived: true, found: true, qdrant_point_ids: ["point:42"] }]
      : []);
    const failure = new Error("cleanup job failed");
    const hook = vi.fn(async () => { throw failure; });

    await expect(fixture.repository.archiveMemoryRecord({
      id: 42,
      organizationId: "org-a",
    }, hook)).rejects.toBe(failure);

    expect(hook).toHaveBeenCalledTimes(1);
    expect(fixture.statements).not.toContain("COMMIT");
    expect(fixture.statements.at(-1)).toBe("ROLLBACK");
    expect(fixture.client.release).toHaveBeenCalledTimes(1);
  });

  it.each([
    { id: 42, organizationId: "org-b" },
    { id: 999, organizationId: "org-a" },
  ])("does not enqueue cleanup for a foreign or missing record: %j", async (input) => {
    const fixture = transactionFixture((sql, params) => {
      if (!sql.includes("WITH target AS")) {
        return [];
      }
      expect(params).toEqual([input.id, input.organizationId]);
      expect(sql).toMatch(/organization_id = \$2/);
      return [{ archived: false, found: false, qdrant_point_ids: [] }];
    });
    const hook = vi.fn();

    await expect(
      fixture.repository.archiveMemoryRecord(input, hook),
    ).resolves.toEqual({ archived: false, qdrantPointIds: [] });

    expect(hook).not.toHaveBeenCalled();
    expect(fixture.statements.at(-1)).toBe("COMMIT");
    expect(fixture.client.release).toHaveBeenCalledTimes(1);
  });
});

describe("canonical record discovery for indexing", () => {
  it("discovers ascending org-scoped IDs with a bounded page and a pre-limit maximum", async () => {
    const query = vi.fn(async (_sql: string, _params: readonly unknown[]) => ({
      rows: [{ id: "2", through_id: "80" }, { id: "4", through_id: "80" }],
    }));
    const repository = createMemoryRepository({ query } as never);

    await expect(repository.listMemoryRecordIdsForIndexing!(" org-a ", [
      { ...scope, scopeId: " project-a " },
      { scopeType: "user", scopeId: "alice" },
    ])).resolves.toEqual({ ids: [2, 4], throughId: 80 });

    const [sql, params] = query.mock.calls[0]!;
    expect(params).toEqual(["org-a", "project", "project-a", "user", "alice", 0, 500]);
    expect(sql).toMatch(/MAX\(mr.id\) OVER \(\)/);
    expect(sql).toMatch(/WHERE mr.organization_id = \$1/);
    expect(sql.match(/mr.scope_type = \$\d+ AND mr.scope_id = \$\d+/g)).toHaveLength(2);
    expect(sql).toMatch(/ORDER BY mr.id ASC\s+LIMIT \$\d+/);
    expect(sql).not.toMatch(/JOIN|durability|memory_chunks/);
  });

  it("keeps the supplied cutoff when later pages have a lower remaining maximum", async () => {
    const query = vi.fn(async (_sql: string, _params: readonly unknown[]) => ({
      rows: [{ id: "9", through_id: "9" }],
    }));
    const repository = createMemoryRepository({ query } as never);

    await expect(repository.listMemoryRecordIdsForIndexing!("org-a", [scope], {
      afterId: 4,
      throughId: 80,
      limit: 2,
    })).resolves.toEqual({ ids: [9], throughId: 80 });

    const [sql, params] = query.mock.calls[0]!;
    expect(params).toEqual(["org-a", "project", "project-a", 4, 80, 2]);
    expect(sql).toMatch(/mr.id > \$4/);
    expect(sql).toMatch(/mr.id <= \$5/);
    expect(sql).toMatch(/LIMIT \$6/);
  });

  it.each([undefined, 0, 80])("returns a stable cutoff for an empty page: %s", async (throughId) => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = createMemoryRepository({ query } as never);

    await expect(repository.listMemoryRecordIdsForIndexing!("org-a", [scope], {
      throughId,
    })).resolves.toEqual({ ids: [], throughId: throughId ?? 0 });
  });

  it("never falls back to an unscoped scan for empty scopes", async () => {
    const query = vi.fn();
    const repository = createMemoryRepository({ query } as never);

    await expect(repository.listMemoryRecordIdsForIndexing!("org-a", [], {
      throughId: 80,
    })).resolves.toEqual({ ids: [], throughId: 80 });
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    { organizationId: "  ", message: "organizationId" },
    { scopes: null, message: "scopes must be an array" },
    { scopes: [null], message: "scopes[0].scopeType" },
    { scopes: [{ scopeType: "team", scopeId: "a" }], message: "scopes[0].scopeType" },
    { scopes: [{ ...scope, scopeId: "  " }], message: "scopes[0].scopeId" },
    { options: { afterId: -1 }, message: "afterId" },
    { options: { afterId: "1" }, message: "afterId" },
    { options: { afterId: Number.MAX_SAFE_INTEGER + 1 }, message: "afterId" },
    { options: { throughId: -1 }, message: "throughId" },
    { options: { throughId: null }, message: "throughId" },
    { options: { throughId: 1.5 }, message: "throughId" },
    { options: { limit: 0 }, message: "limit" },
    { options: { limit: 1.5 }, message: "limit" },
    { options: { limit: 5001 }, message: "limit" },
  ])("rejects malformed discovery inputs before querying: %j", async ({ message, ...patch }) => {
    const query = vi.fn();
    const repository = createMemoryRepository({ query } as never);
    const input = { organizationId: "org-a", scopes: [scope], options: undefined, ...patch };

    await expect(repository.listMemoryRecordIdsForIndexing!(
      input.organizationId,
      input.scopes as never,
      input.options as never,
    )).rejects.toThrow(message);
    expect(query).not.toHaveBeenCalled();
  });
});
