import { describe, expect, it, vi } from "vitest";
import {
  createGoalRunRepository,
  GoalRunNotActiveError,
} from "../../src/goal-run/goal-run-repository.js";

type SqlQueryCall = { sql: string; params: unknown[] };

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    organization_id: "org-a",
    scope_type: "project",
    scope_id: "proj-x",
    project_key: "proj-x",
    goal: "ship phase 1",
    termination_criteria: "tests pass",
    status: "active",
    iteration_count: 0,
    created_at: "2026-06-27T00:00:00.000Z",
    updated_at: "2026-06-27T00:00:00.000Z",
    closed_at: null,
    ...overrides,
  };
}

describe("createGoalRunRepository", () => {
  it("start inserts a run and maps the row to camelCase", async () => {
    const calls: SqlQueryCall[] = [];
    const pool = {
      query: vi.fn((sql: string, params?: unknown[]) => {
        calls.push({ sql, params: params ?? [] });
        return Promise.resolve({ rows: [runRow()] });
      }),
    };

    const repo = createGoalRunRepository(pool as never);
    const run = await repo.start({
      organizationId: "org-a",
      scopeType: "project",
      scopeId: "proj-x",
      projectKey: "proj-x",
      goal: "ship phase 1",
      terminationCriteria: "tests pass",
    });

    expect(run.id).toBe(7);
    expect(run.scopeType).toBe("project");
    expect(run.iterationCount).toBe(0);
    expect(run.closedAt).toBeNull();
    expect(calls[0]?.sql).toContain("INSERT INTO goal_runs");
    expect(calls[0]?.params).toEqual([
      "org-a",
      "project",
      "proj-x",
      "proj-x",
      "ship phase 1",
      "tests pass",
    ]);
  });

  it("recordIteration bumps the count, inserts the iteration, and links memories", async () => {
    const calls: SqlQueryCall[] = [];
    const client = {
      query: vi.fn((sql: string, params?: unknown[]) => {
        calls.push({ sql, params: params ?? [] });
        if (sql.includes("UPDATE goal_runs")) {
          return Promise.resolve({ rows: [{ iteration_count: 1 }] });
        }
        if (sql.includes("INSERT INTO goal_run_iterations")) {
          return Promise.resolve({
            rows: [
              {
                id: 11,
                goal_run_id: 7,
                organization_id: "org-a",
                iteration_index: 1,
                attempt: "try A",
                outcome: "failure",
                summary: null,
                error: "boom",
                created_at: "2026-06-27T00:01:00.000Z",
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn().mockResolvedValue(client) };

    const repo = createGoalRunRepository(pool as never);
    const iteration = await repo.recordIteration({
      organizationId: "org-a",
      goalRunId: 7,
      attempt: "try A",
      outcome: "failure",
      error: "boom",
      memoryIds: [101, 102],
    });

    expect(iteration.iterationIndex).toBe(1);
    expect(iteration.outcome).toBe("failure");
    const sqls = calls.map((c) => c.sql);
    expect(sqls.some((s) => s === "BEGIN")).toBe(true);
    expect(sqls.some((s) => s === "COMMIT")).toBe(true);
    expect(sqls.some((s) => s.includes("UPDATE memory_records"))).toBe(true);
    const linkCall = calls.find((c) => c.sql.includes("UPDATE memory_records"));
    expect(linkCall?.params).toEqual([7, [101, 102], "org-a"]);
  });

  it("recordIteration on a closed/unknown run rolls back and throws", async () => {
    const calls: SqlQueryCall[] = [];
    const client = {
      query: vi.fn((sql: string) => {
        calls.push({ sql, params: [] });
        if (sql.includes("UPDATE goal_runs")) {
          return Promise.resolve({ rows: [] }); // no active run matched
        }
        return Promise.resolve({ rows: [] });
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn().mockResolvedValue(client) };

    const repo = createGoalRunRepository(pool as never);
    await expect(
      repo.recordIteration({
        organizationId: "org-a",
        goalRunId: 999,
        attempt: "try",
        outcome: "success",
      }),
    ).rejects.toBeInstanceOf(GoalRunNotActiveError);

    expect(calls.some((c) => c.sql === "ROLLBACK")).toBe(true);
    expect(calls.some((c) => c.sql.includes("INSERT INTO goal_run_iterations"))).toBe(
      false,
    );
  });

  it("does not touch memory_records when no memoryIds are supplied", async () => {
    const calls: SqlQueryCall[] = [];
    const client = {
      query: vi.fn((sql: string) => {
        calls.push({ sql, params: [] });
        if (sql.includes("UPDATE goal_runs")) {
          return Promise.resolve({ rows: [{ iteration_count: 1 }] });
        }
        if (sql.includes("INSERT INTO goal_run_iterations")) {
          return Promise.resolve({
            rows: [
              {
                id: 12,
                goal_run_id: 7,
                organization_id: "org-a",
                iteration_index: 1,
                attempt: "try",
                outcome: "success",
                summary: null,
                error: null,
                created_at: "2026-06-27T00:02:00.000Z",
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn().mockResolvedValue(client) };

    const repo = createGoalRunRepository(pool as never);
    await repo.recordIteration({
      organizationId: "org-a",
      goalRunId: 7,
      attempt: "try",
      outcome: "success",
    });

    expect(calls.some((c) => c.sql.includes("UPDATE memory_records"))).toBe(false);
  });

  it("get returns null when the run is not found for the org", async () => {
    const pool = {
      query: vi.fn(() => Promise.resolve({ rows: [] })),
    };
    const repo = createGoalRunRepository(pool as never);
    const result = await repo.get({ organizationId: "org-a", goalRunId: 1 });
    expect(result).toBeNull();
  });

  it("get returns the run with ordered iterations", async () => {
    const pool = {
      query: vi.fn((sql: string) => {
        if (sql.includes("FROM goal_runs")) {
          return Promise.resolve({ rows: [runRow({ iteration_count: 2 })] });
        }
        return Promise.resolve({
          rows: [
            {
              id: 1,
              goal_run_id: 7,
              organization_id: "org-a",
              iteration_index: 1,
              attempt: "a",
              outcome: "failure",
              summary: null,
              error: "e",
              created_at: "2026-06-27T00:01:00.000Z",
            },
          ],
        });
      }),
    };
    const repo = createGoalRunRepository(pool as never);
    const result = await repo.get({ organizationId: "org-a", goalRunId: 7 });
    expect(result?.iterations).toHaveLength(1);
    expect(result?.iterations[0]?.outcome).toBe("failure");
  });

  it("complete closes an active run; throws when none matched", async () => {
    const okPool = {
      query: vi.fn(() =>
        Promise.resolve({
          rows: [runRow({ status: "completed", closed_at: "2026-06-27T01:00:00.000Z" })],
        }),
      ),
    };
    const repo = createGoalRunRepository(okPool as never);
    const closed = await repo.complete({ organizationId: "org-a", goalRunId: 7 });
    expect(closed.status).toBe("completed");
    expect(closed.closedAt).not.toBeNull();

    const emptyPool = { query: vi.fn(() => Promise.resolve({ rows: [] })) };
    const repo2 = createGoalRunRepository(emptyPool as never);
    await expect(
      repo2.abandon({ organizationId: "org-a", goalRunId: 7 }),
    ).rejects.toBeInstanceOf(GoalRunNotActiveError);
  });
});
