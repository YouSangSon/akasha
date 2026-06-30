import { describe, expect, it, vi } from "vitest";
import { createAuditLogRepository } from "../../src/audit/audit-log-repository.js";

const MAX_ERROR_MESSAGE_LENGTH = 1024;

describe("createAuditLogRepository — error_message truncation", () => {
  it.each([
    {
      pool: null,
      message: "audit log pool must be an object",
    },
    {
      pool: { query: "SELECT 1" },
      message: "audit log pool.query must be a function",
    },
  ])("rejects malformed direct pool inputs", ({ pool, message }) => {
    expect(() => createAuditLogRepository(pool as never)).toThrow(message);
  });

  it.each([
    {
      entry: null,
      message: "audit log entry must be an object",
    },
    {
      entry: buildAuditEntry({ actor: " \n\t " }),
      message: "actor must contain non-whitespace text",
    },
    {
      entry: buildAuditEntry({ tool: null }),
      message: "tool must be a string",
    },
    {
      entry: buildAuditEntry({ outcome: "skipped" }),
      message: 'outcome must be "ok" or "error"',
    },
    {
      entry: buildAuditEntry({ durationMs: Number.NaN }),
      message: "durationMs must be a non-negative finite number",
    },
    {
      entry: buildAuditEntry({ durationMs: -1 }),
      message: "durationMs must be a non-negative finite number",
    },
    {
      entry: buildAuditEntry({ projectKey: " \n\t " }),
      message: "projectKey must contain non-whitespace text",
    },
    {
      entry: buildAuditEntry({ errorMessage: 42 }),
      message: "errorMessage must be a string when provided",
    },
    {
      entry: buildAuditEntry({ requestId: " \n\t " }),
      message: "requestId must contain non-whitespace text",
    },
  ])(
    "record rejects malformed direct entries before querying",
    async ({ entry, message }) => {
      const fakePool = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      const repo = createAuditLogRepository(fakePool as never);

      await expect(repo.record(entry as never)).rejects.toThrow(message);

      expect(fakePool.query).not.toHaveBeenCalled();
    },
  );

  it("record rejects whitespace-only organizationId before querying", async () => {
    const fakePool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const repo = createAuditLogRepository(fakePool as never);

    await expect(
      repo.record({
        organizationId: " \n\t ",
        actor: "alice",
        tool: "add_memory",
        outcome: "ok",
        durationMs: 5,
      }),
    ).rejects.toThrow(/organizationId/);

    expect(fakePool.query).not.toHaveBeenCalled();
  });

  it("listByOrganization rejects whitespace-only organizationId before querying", async () => {
    const fakePool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const repo = createAuditLogRepository(fakePool as never);

    await expect(
      repo.listByOrganization(" \n\t ", { limit: 10 }),
    ).rejects.toThrow(/organizationId/);

    expect(fakePool.query).not.toHaveBeenCalled();
  });

  it.each([
    {
      options: null,
      message: "audit log list options must be an object",
    },
    {
      options: "limit",
      message: "audit log list options must be an object",
    },
    {
      options: { limit: "10" },
      message: "audit log limit must be a positive integer up to 1000",
    },
  ])(
    "listByOrganization rejects malformed direct options before querying",
    async ({ options, message }) => {
      const fakePool = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      const repo = createAuditLogRepository(fakePool as never);

      await expect(
        repo.listByOrganization("org-1", options as never),
      ).rejects.toThrow(message);

      expect(fakePool.query).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1, 1.5, Number.NaN, 1001])(
    "listByOrganization rejects invalid direct limits before querying: %s",
    async (limit) => {
      const fakePool = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      const repo = createAuditLogRepository(fakePool as never);

      await expect(
        repo.listByOrganization("org-1", { limit }),
      ).rejects.toThrow(
        "audit log limit must be a positive integer up to 1000",
      );

      expect(fakePool.query).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["default", undefined, 100],
    ["minimum", 1, 1],
    ["maximum", 1000, 1000],
  ] as const)(
    "listByOrganization preserves %s direct limits",
    async (_label, limit, expectedLimit) => {
      const fakePool = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      const repo = createAuditLogRepository(fakePool as never);

      await expect(
        repo.listByOrganization(
          "org-1",
          limit === undefined ? undefined : { limit },
        ),
      ).resolves.toEqual([]);

      expect(fakePool.query).toHaveBeenCalledWith(
        expect.any(String),
        ["org-1", expectedLimit],
      );
    },
  );

  it("truncates error_message to 1024 chars before persistence", async () => {
    let capturedParams: unknown[] | undefined;

    const fakePool = {
      query: vi.fn().mockImplementation((_sql: string, params: unknown[]) => {
        capturedParams = params;
        return Promise.resolve({ rows: [] });
      }),
    };

    const repo = createAuditLogRepository(fakePool as never);
    const longMessage = "x".repeat(2000);

    await repo.record({
      organizationId: "org-1",
      actor: "alice",
      tool: "add_memory",
      outcome: "error",
      errorMessage: longMessage,
      durationMs: 42,
    });

    // error_message is the 6th parameter (index 5) in the INSERT VALUES list
    const storedMessage = capturedParams?.[5] as string;
    expect(storedMessage).toHaveLength(MAX_ERROR_MESSAGE_LENGTH);
    expect(storedMessage).toBe("x".repeat(MAX_ERROR_MESSAGE_LENGTH));
  });

  it("preserves error_message at exactly 1024 chars (boundary — no truncation)", async () => {
    let capturedParams: unknown[] | undefined;

    const fakePool = {
      query: vi.fn().mockImplementation((_sql: string, params: unknown[]) => {
        capturedParams = params;
        return Promise.resolve({ rows: [] });
      }),
    };

    const repo = createAuditLogRepository(fakePool as never);
    const exactMessage = "y".repeat(MAX_ERROR_MESSAGE_LENGTH);

    await repo.record({
      organizationId: "org-1",
      actor: "alice",
      tool: "add_memory",
      outcome: "error",
      errorMessage: exactMessage,
      durationMs: 10,
    });

    const storedMessage = capturedParams?.[5] as string;
    expect(storedMessage).toHaveLength(MAX_ERROR_MESSAGE_LENGTH);
  });

  it("passes null error_message through unchanged", async () => {
    let capturedParams: unknown[] | undefined;

    const fakePool = {
      query: vi.fn().mockImplementation((_sql: string, params: unknown[]) => {
        capturedParams = params;
        return Promise.resolve({ rows: [] });
      }),
    };

    const repo = createAuditLogRepository(fakePool as never);

    await repo.record({
      organizationId: "org-1",
      actor: "alice",
      tool: "add_memory",
      outcome: "ok",
      durationMs: 5,
    });

    const storedMessage = capturedParams?.[5];
    expect(storedMessage).toBeNull();
  });
});

function buildAuditEntry(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: "org-1",
    actor: "alice",
    tool: "add_memory",
    outcome: "ok",
    durationMs: 5,
    ...overrides,
  };
}
