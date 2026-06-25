import { describe, expect, it, vi } from "vitest";
import { createToolRegistry } from "../../src/mcp/server.js";
import type { AuditLogRepository } from "../../src/audit/audit-log-repository.js";
import type { CanonicalServices } from "../../src/mcp/types.js";
import type { MemoryRepository, SearchMemoryResult } from "../../src/types.js";

function buildAuditLog(): AuditLogRepository {
  return {
    record: vi.fn().mockResolvedValue(undefined),
    listByOrganization: vi.fn().mockResolvedValue([]),
  };
}

function createRecord(
  overrides: Partial<SearchMemoryResult> = {},
): SearchMemoryResult {
  return {
    id: 1,
    sourceId: 1,
    organizationId: overrides.organizationId ?? "default",
    scopeType: overrides.scopeType ?? "project",
    scopeId: overrides.scopeId ?? "project-alpha",
    memoryType: overrides.memoryType ?? "decision",
    content: overrides.content ?? "x",
    createdAt: "2026-04-25T00:00:00.000Z",
    updatedAt: "2026-04-25T00:00:00.000Z",
    source: {
      id: 1,
      scopeType: overrides.scopeType ?? "project",
      scopeId: overrides.scopeId ?? "project-alpha",
      sourceType: "decision",
      externalId: "ext-1",
      title: "title",
      uri: null,
      createdAt: "2026-04-25T00:00:00.000Z",
    },
  };
}

function buildRepository(): MemoryRepository {
  return {
    addMemory: vi.fn().mockImplementation((input) =>
      createRecord({
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        organizationId: input.organizationId,
      }),
    ),
    searchMemory: vi.fn().mockReturnValue([]),
    listMemory: vi.fn().mockReturnValue([]),
    getMemoryRecordsByIds: vi.fn().mockReturnValue([]),
  };
}

describe("audit logging at the tool boundary", () => {
  it("records an ok audit row for a successful add_memory call", async () => {
    const auditLog = buildAuditLog();
    const repository = buildRepository();
    const registry = createToolRegistry({
      repository,
      auditLog,
      defaultActor: "alice@example.com",
    });

    await registry.add_memory({
      projectKey: "project-alpha",
      organizationId: "dev-team",
      kind: "decision",
      content: "Decision: ship feature X",
    });

    expect(auditLog.record).toHaveBeenCalledTimes(1);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "dev-team",
        actor: "alice@example.com",
        tool: "add_memory",
        projectKey: "project-alpha",
        outcome: "ok",
        durationMs: expect.any(Number),
        requestId: expect.any(String),
      }),
    );
  });

  it("records an error audit row when the tool throws", async () => {
    const auditLog = buildAuditLog();
    const repository = buildRepository();
    (repository.addMemory as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        throw new Error("repository down");
      },
    );

    const registry = createToolRegistry({
      repository,
      auditLog,
    });

    await expect(
      registry.add_memory({
        projectKey: "project-alpha",
        kind: "decision",
        content: "Decision: anything",
      }),
    ).rejects.toThrow(/repository down/);

    expect(auditLog.record).toHaveBeenCalledTimes(1);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: "add_memory",
        outcome: "error",
        errorMessage: "repository down",
      }),
    );
  });

  it("defaults organizationId to 'default' when not provided in input", async () => {
    const auditLog = buildAuditLog();
    const repository = buildRepository();
    const registry = createToolRegistry({ repository, auditLog });

    await registry.add_memory({
      projectKey: "project-alpha",
      kind: "decision",
      content: "no org",
    });

    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "default" }),
    );
  });

  it("does not throw or block when auditLog.record fails (best-effort)", async () => {
    const auditLog: AuditLogRepository = {
      record: vi.fn().mockRejectedValue(new Error("audit infra down")),
      listByOrganization: vi.fn().mockResolvedValue([]),
    };
    const repository = buildRepository();
    const registry = createToolRegistry({ repository, auditLog });

    await expect(
      registry.add_memory({
        projectKey: "project-alpha",
        kind: "decision",
        content: "x",
      }),
    ).resolves.toBeDefined();
  });

  it("does not call record when no auditLog is configured", async () => {
    const repository = buildRepository();
    const registry = createToolRegistry({ repository });

    await expect(
      registry.add_memory({
        projectKey: "project-alpha",
        kind: "decision",
        content: "x",
      }),
    ).resolves.toBeDefined();
    // No assertion needed: absence of an auditLog object means nothing to call.
  });

  it("lists audit rows from canonical services when direct auditLog options are absent", async () => {
    const auditLog: AuditLogRepository = {
      record: vi.fn().mockResolvedValue(undefined),
      listByOrganization: vi.fn().mockResolvedValue([
        {
          id: 42,
          organizationId: "dev-team",
          actor: "alice@example.com",
          tool: "add_memory",
          projectKey: "project-alpha",
          outcome: "ok",
          errorMessage: null,
          durationMs: 12,
          requestId: "req-42",
          createdAt: "2026-04-25T00:00:00.000Z",
        },
      ]),
    };
    const services = { auditLog } as unknown as CanonicalServices;
    const registry = createToolRegistry({
      resolveCanonicalServices: async () => services,
    });

    const result = await registry.list_audit_log({
      organizationId: "dev-team",
      limit: 1,
    });

    expect(auditLog.listByOrganization).toHaveBeenCalledWith("dev-team", {
      limit: 1,
    });
    expect(result.entries).toEqual([
      expect.objectContaining({
        id: 42,
        organizationId: "dev-team",
        actor: "alice@example.com",
        tool: "add_memory",
      }),
    ]);
  });
});
