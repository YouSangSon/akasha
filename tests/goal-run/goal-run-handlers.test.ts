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

  it("start_goal_run resolves default user scope when userScopeId is omitted", async () => {
    const goalRuns = goalRunServicesStub();
    const registry = createToolRegistry({
      defaultUserScopeId: "resolved-user",
      withCanonicalServices: (async (cb: (s: CanonicalServices) => Promise<unknown>) =>
        cb({ goalRuns } as unknown as CanonicalServices)) as never,
    });

    await registry.start_goal_run({
      organizationId: "org-a",
      scope: "user",
      goal: "learn rust",
    });

    expect(goalRuns.start).toHaveBeenCalledWith({
      organizationId: "org-a",
      scopeType: "user",
      scopeId: "resolved-user",
      projectKey: null,
      goal: "learn rust",
      terminationCriteria: null,
    });
  });

  it("rejects whitespace-only goal text before starting a run", async () => {
    const goalRuns = goalRunServicesStub();
    const registry = registryWith(goalRuns);

    await expect(
      registry.start_goal_run({
        projectKey: "proj-x",
        goal: " \n\t ",
      }),
    ).rejects.toThrow(/non-whitespace text/);
    expect(goalRuns.start).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only goal-run scope identifiers before service dispatch", async () => {
    const goalRuns = goalRunServicesStub();
    const registry = registryWith(goalRuns);

    await expect(
      registry.start_goal_run({
        projectKey: " \n\t ",
        goal: "ship phase 1",
      }),
    ).rejects.toThrow(/non-whitespace text/);
    await expect(
      registry.list_goal_runs({
        scope: "user",
        userScopeId: " \n\t ",
      }),
    ).rejects.toThrow(/non-whitespace text/);
    await expect(
      registry.start_goal_run({
        projectKey: "proj-x",
        userScopeId: " \n\t ",
        goal: "ship phase 1",
      }),
    ).rejects.toThrow(/non-whitespace text/);

    expect(goalRuns.start).not.toHaveBeenCalled();
    expect(goalRuns.list).not.toHaveBeenCalled();
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

  it("rejects whitespace-only iteration attempts before recording", async () => {
    const goalRuns = goalRunServicesStub();
    const registry = registryWith(goalRuns);

    await expect(
      registry.record_iteration({
        goalRunId: 7,
        attempt: " \n\t ",
        outcome: "failure",
      }),
    ).rejects.toThrow(/non-whitespace text/);
    expect(goalRuns.recordIteration).not.toHaveBeenCalled();
  });

  it("rejects invalid iteration memory links before recording", async () => {
    const goalRuns = goalRunServicesStub();
    const registry = registryWith(goalRuns);

    for (const memoryIds of [
      [0],
      [-1],
      [1.5],
      [Number.NaN],
      [Number.MAX_SAFE_INTEGER + 1],
    ]) {
      await expect(
        registry.record_iteration({
          goalRunId: 7,
          attempt: "try A",
          outcome: "failure",
          memoryIds,
        }),
      ).rejects.toThrow(/memoryIds/);
    }

    expect(goalRuns.recordIteration).not.toHaveBeenCalled();
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

  it("normalizes blank optional goal-run notes to null", async () => {
    const goalRuns = goalRunServicesStub();
    const registry = registryWith(goalRuns);

    await registry.start_goal_run({
      projectKey: "proj-x",
      goal: "ship phase 1",
      terminationCriteria: " \n\t ",
    });
    await registry.record_iteration({
      goalRunId: 7,
      attempt: "try A",
      outcome: "failure",
      summary: " \n\t ",
      error: "",
    });
    await registry.complete_goal_run({ goalRunId: 7, resolution: " \n\t " });
    await registry.abandon_goal_run({ goalRunId: 8, reason: "" });

    expect(goalRuns.start).toHaveBeenCalledWith(
      expect.objectContaining({ terminationCriteria: null }),
    );
    expect(goalRuns.recordIteration).toHaveBeenCalledWith(
      expect.objectContaining({ summary: null, error: null }),
    );
    expect(goalRuns.complete).toHaveBeenCalledWith(
      expect.objectContaining({ note: null }),
    );
    expect(goalRuns.abandon).toHaveBeenCalledWith(
      expect.objectContaining({ note: null }),
    );
  });

  it("list_goal_runs resolves default user scope when userScopeId is omitted", async () => {
    const goalRuns = goalRunServicesStub();
    const registry = createToolRegistry({
      defaultUserScopeId: "resolved-user",
      withCanonicalServices: (async (cb: (s: CanonicalServices) => Promise<unknown>) =>
        cb({ goalRuns } as unknown as CanonicalServices)) as never,
    });

    await registry.list_goal_runs({
      organizationId: "org-a",
      scope: "user",
      status: "active",
    });

    expect(goalRuns.list).toHaveBeenCalledWith({
      organizationId: "org-a",
      scopeType: "user",
      scopeId: "resolved-user",
      status: "active",
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
      closeNote: null,
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

  it("check_repeat_attempt flags a candidate matching a prior failed attempt", async () => {
    const goalRuns = goalRunServicesStub();
    goalRuns.get.mockResolvedValue({
      id: 7,
      organizationId: "default",
      scopeType: "project",
      scopeId: "proj-x",
      projectKey: "proj-x",
      goal: "g",
      terminationCriteria: null,
      status: "active",
      iterationCount: 3,
      createdAt: "t",
      updatedAt: "t",
      closedAt: null,
      closeNote: null,
      iterations: [
        { id: 1, goalRunId: 7, organizationId: "default", iterationIndex: 1, attempt: "use regex", outcome: "failure", summary: null, error: "nope", createdAt: "t" },
        { id: 2, goalRunId: 7, organizationId: "default", iterationIndex: 2, attempt: "succeeded", outcome: "success", summary: null, error: null, createdAt: "t" },
        { id: 3, goalRunId: 7, organizationId: "default", iterationIndex: 3, attempt: "call api", outcome: "failure", summary: null, error: "nope2", createdAt: "t" },
      ],
    });
    // candidate vs [failure#1, failure#3]: matches failure#1 only.
    const embedBatch = vi
      .fn()
      .mockResolvedValue([[1, 0, 0], [1, 0, 0], [0, 1, 0]]);
    const registry = createToolRegistry({
      withCanonicalServices: (async (cb: (s: CanonicalServices) => Promise<unknown>) =>
        cb({ goalRuns, embeddings: { embedBatch } } as unknown as CanonicalServices)) as never,
    });

    const result = await registry.check_repeat_attempt({
      goalRunId: 7,
      attempt: "use a regular expression",
    });

    // Only the two FAILED attempts are embedded (plus the candidate).
    expect(embedBatch).toHaveBeenCalledWith([
      "use a regular expression",
      "use regex",
      "call api",
    ]);
    expect(result.repeat).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.iterationIndex).toBe(1);
  });

  it("rejects whitespace-only repeat-check attempts before loading the run", async () => {
    const goalRuns = goalRunServicesStub();
    const embedBatch = vi.fn();
    const registry = createToolRegistry({
      withCanonicalServices: (async (cb: (s: CanonicalServices) => Promise<unknown>) =>
        cb({ goalRuns, embeddings: { embedBatch } } as unknown as CanonicalServices)) as never,
    });

    await expect(
      registry.check_repeat_attempt({ goalRunId: 7, attempt: " \n\t " }),
    ).rejects.toThrow(/non-whitespace text/);
    expect(goalRuns.get).not.toHaveBeenCalled();
    expect(embedBatch).not.toHaveBeenCalled();
  });

  it("rejects invalid repeat-check thresholds before loading the run", async () => {
    const goalRuns = goalRunServicesStub();
    const embedBatch = vi.fn();
    const registry = createToolRegistry({
      withCanonicalServices: (async (cb: (s: CanonicalServices) => Promise<unknown>) =>
        cb({ goalRuns, embeddings: { embedBatch } } as unknown as CanonicalServices)) as never,
    });

    for (const threshold of [Number.NaN, 0, 1.01]) {
      await expect(
        registry.check_repeat_attempt({
          goalRunId: 7,
          attempt: "try a new API path",
          threshold,
        }),
      ).rejects.toThrow(/threshold/);
    }

    expect(goalRuns.get).not.toHaveBeenCalled();
    expect(embedBatch).not.toHaveBeenCalled();
  });

  it("check_repeat_attempt returns found:false for a missing run without embedding", async () => {
    const goalRuns = goalRunServicesStub();
    goalRuns.get.mockResolvedValue(null);
    const embedBatch = vi.fn();
    const registry = createToolRegistry({
      withCanonicalServices: (async (cb: (s: CanonicalServices) => Promise<unknown>) =>
        cb({ goalRuns, embeddings: { embedBatch } } as unknown as CanonicalServices)) as never,
    });

    const result = await registry.check_repeat_attempt({ goalRunId: 99, attempt: "x" });

    expect(result).toEqual({
      ok: true,
      found: false,
      repeat: false,
      threshold: 0.85,
      matches: [],
    });
    expect(embedBatch).not.toHaveBeenCalled();
  });
});
