import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../../src/store/memory-repository.js";

const scopeRef = { scopeType: "project" as const, scopeId: "proj-x" };

describe("listMemory goal-run compaction pin", () => {
  it("excludes active-goal-run records when excludePinnedGoalRuns is set", async () => {
    let capturedSql = "";
    const pool = {
      query: vi.fn((sql: string) => {
        capturedSql = sql;
        return Promise.resolve({ rows: [] });
      }),
    };

    const repo = createMemoryRepository(pool as never);
    await repo.listMemory(scopeRef, {
      organizationId: "org-a",
      excludePinnedGoalRuns: true,
    });

    expect(capturedSql).toContain("mr.goal_run_id IS NULL");
    expect(capturedSql).toContain(
      "SELECT id FROM goal_runs WHERE status = 'active'",
    );
  });

  it("does not add the pin clause for normal review listing", async () => {
    let capturedSql = "";
    const pool = {
      query: vi.fn((sql: string) => {
        capturedSql = sql;
        return Promise.resolve({ rows: [] });
      }),
    };

    const repo = createMemoryRepository(pool as never);
    await repo.listMemory(scopeRef, { organizationId: "org-a" });

    expect(capturedSql).not.toContain("goal_run_id");
  });
});
