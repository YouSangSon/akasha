import { vi } from "vitest";

// Shared stubs so existing registry / canonical-services mocks satisfy the
// goal-run additions to ToolRegistry and CanonicalServices without each test
// re-declaring six functions.

const goalRun = {
  id: 1,
  organizationId: "default",
  scopeType: "project" as const,
  scopeId: "p",
  projectKey: "p",
  goal: "g",
  terminationCriteria: null,
  status: "active" as const,
  iterationCount: 0,
  createdAt: "2026-06-27T00:00:00.000Z",
  updatedAt: "2026-06-27T00:00:00.000Z",
  closedAt: null,
  closeNote: null,
};

const iteration = {
  id: 1,
  goalRunId: 1,
  organizationId: "default",
  iterationIndex: 1,
  attempt: "a",
  outcome: "success" as const,
  summary: null,
  error: null,
  createdAt: "2026-06-27T00:00:00.000Z",
};

export function goalRunRegistryStubs() {
  return {
    start_goal_run: vi.fn().mockResolvedValue({ ok: true, goalRun }),
    record_iteration: vi.fn().mockResolvedValue({ ok: true, iteration }),
    get_goal_run: vi
      .fn()
      .mockResolvedValue({ ok: true, goalRun: { ...goalRun, iterations: [] } }),
    list_goal_runs: vi.fn().mockResolvedValue({ ok: true, goalRuns: [] }),
    complete_goal_run: vi
      .fn()
      .mockResolvedValue({ ok: true, goalRun: { ...goalRun, status: "completed" } }),
    abandon_goal_run: vi
      .fn()
      .mockResolvedValue({ ok: true, goalRun: { ...goalRun, status: "abandoned" } }),
    build_goal_context: vi.fn().mockResolvedValue({
      ok: true,
      found: true,
      goalRunId: 1,
      packMarkdown: "## Goal\n- g (status: active; iterations: 0)",
    }),
    check_repeat_attempt: vi.fn().mockResolvedValue({
      ok: true,
      found: true,
      repeat: false,
      threshold: 0.85,
      matches: [],
    }),
  };
}

export function goalRunServicesStub() {
  return {
    start: vi.fn().mockResolvedValue(goalRun),
    recordIteration: vi.fn().mockResolvedValue(iteration),
    get: vi.fn().mockResolvedValue({ ...goalRun, iterations: [] }),
    list: vi.fn().mockResolvedValue([]),
    complete: vi.fn().mockResolvedValue({ ...goalRun, status: "completed" }),
    abandon: vi.fn().mockResolvedValue({ ...goalRun, status: "abandoned" }),
  };
}
