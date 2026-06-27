import { describe, expect, it, vi } from "vitest";
import { createToolRegistry } from "../../src/mcp/tool-registry.js";
import type { CanonicalServices } from "../../src/mcp/types.js";
import { goalRunServicesStub } from "../fixtures/goal-run-stubs.js";

// Drive the real handlers with only the goalRuns service stubbed in. The
// goal-run handlers touch services.goalRuns exclusively, so a partial
// CanonicalServices is enough to exercise scope resolution, org defaults, and
// argument passthrough without Postgres.
function registryWith(goalRuns: ReturnType<typeof goalRunServicesStub>) {
  return createToolRegistry({
    withCanonicalServices: (async (cb: (s: CanonicalServices) => Promise<unknown>) =>
      cb({ goalRuns } as unknown as CanonicalServices)) as never,
  });
}

describe("goal-run handlers", () => {
  it("start_goal_run resolves project scope and defaults the organization", async () => {
    const goalRuns = goalRunServicesStub();
    const registry = registryWith(goalRuns);

    await registry.start_goal_run({
      projectKey: "proj-x",
      goal: "ship phase 1",
      terminationCriteria: "tests pass",
    });

    expect(goalRuns.start).toHaveBeenCalledWith({
      organizationId: "default",
      scopeType: "project",
      scopeId: "proj-x",
      projectKey: "proj-x",
      goal: "ship phase 1",
      terminationCriteria: "tests pass",
    });
  });

  it("start_goal_run resolves user scope with a null projectKey", async () => {
    const goalRuns = goalRunServicesStub();
    const registry = registryWith(goalRuns);

    await registry.start_goal_run({
      organizationId: "org-a",
      scope: "user",
      userScopeId: "alice",
      goal: "learn rust",
    });

    expect(goalRuns.start).toHaveBeenCalledWith({
      organizationId: "org-a",
      scopeType: "user",
      scopeId: "alice",
      projectKey: null,
      goal: "learn rust",
      terminationCriteria: null,
    });
  });

  it("record_iteration forwards outcome, memory links, and org default", async () => {
    const goalRuns = goalRunServicesStub();
    const registry = registryWith(goalRuns);

    await registry.record_iteration({
      goalRunId: 7,
      attempt: "try A",
      outcome: "failure",
      error: "boom",
      memoryIds: [11, 12],
    });

    expect(goalRuns.recordIteration).toHaveBeenCalledWith({
      organizationId: "default",
      goalRunId: 7,
      attempt: "try A",
      outcome: "failure",
      summary: null,
      error: "boom",
      memoryIds: [11, 12],
    });
  });

  it("complete_goal_run maps resolution to the close note", async () => {
    const goalRuns = goalRunServicesStub();
    const registry = registryWith(goalRuns);

    await registry.complete_goal_run({ goalRunId: 7, resolution: "done" });

    expect(goalRuns.complete).toHaveBeenCalledWith({
      organizationId: "default",
      goalRunId: 7,
      note: "done",
    });
  });

  it("abandon_goal_run maps reason to the close note", async () => {
    const goalRuns = goalRunServicesStub();
    const registry = registryWith(goalRuns);

    await registry.abandon_goal_run({ goalRunId: 7, reason: "stuck" });

    expect(goalRuns.abandon).toHaveBeenCalledWith({
      organizationId: "default",
      goalRunId: 7,
      note: "stuck",
    });
  });

  it("build_goal_context returns found:false for a missing run", async () => {
    const goalRuns = goalRunServicesStub();
    goalRuns.get.mockResolvedValue(null);
    const listMemory = vi.fn().mockResolvedValue([]);
    const registry = createToolRegistry({
      withCanonicalServices: (async (cb: (s: CanonicalServices) => Promise<unknown>) =>
        cb({ goalRuns, repository: { listMemory } } as unknown as CanonicalServices)) as never,
    });

    const result = await registry.build_goal_context({ goalRunId: 99 });

    expect(result).toEqual({
      ok: true,
      found: false,
      goalRunId: 99,
      packMarkdown: "",
    });
    expect(listMemory).not.toHaveBeenCalled();
  });

  it("build_goal_context loads scope memories and renders a pack for an existing run", async () => {
    const goalRuns = goalRunServicesStub();
    goalRuns.get.mockResolvedValue({
      id: 7,
      organizationId: "default",
      scopeType: "project",
      scopeId: "proj-x",
      projectKey: "proj-x",
      goal: "ship phase 2",
      terminationCriteria: null,
      status: "active",
      iterationCount: 0,
      createdAt: "2026-06-27T00:00:00.000Z",
      updatedAt: "2026-06-27T00:00:00.000Z",
      closedAt: null,
      iterations: [],
    });
    const listMemory = vi.fn().mockResolvedValue([]);
    const registry = createToolRegistry({
      withCanonicalServices: (async (cb: (s: CanonicalServices) => Promise<unknown>) =>
        cb({ goalRuns, repository: { listMemory } } as unknown as CanonicalServices)) as never,
    });

    const result = await registry.build_goal_context({ goalRunId: 7 });

    expect(result.found).toBe(true);
    expect(result.goalRunId).toBe(7);
    expect(result.packMarkdown).toContain("## Goal");
    expect(listMemory).toHaveBeenCalledWith(
      { scopeType: "project", scopeId: "proj-x" },
      expect.objectContaining({ organizationId: "default" }),
    );
  });
});
