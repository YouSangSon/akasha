import { describe, expect, it, vi } from "vitest";
import { createAuditLogRepository } from "../../src/audit/audit-log-repository.js";

const MAX_ERROR_MESSAGE_LENGTH = 1024;

describe("createAuditLogRepository — error_message truncation", () => {
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
