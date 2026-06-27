import { describe, expect, it } from "vitest";
import { buildGoalContextPack } from "../../src/goal-run/build-goal-context.js";
import type { GoalRunIteration, GoalRunWithIterations } from "../../src/types.js";

function iteration(
  overrides: Partial<GoalRunIteration> & Pick<GoalRunIteration, "iterationIndex" | "outcome">,
): GoalRunIteration {
  return {
    id: overrides.iterationIndex,
    goalRunId: 7,
    organizationId: "org-a",
    attempt: `attempt ${overrides.iterationIndex}`,
    summary: null,
    error: null,
    createdAt: "2026-06-27T00:00:00.000Z",
    ...overrides,
  };
}

function goalRun(
  iterations: GoalRunIteration[],
  overrides: Partial<GoalRunWithIterations> = {},
): GoalRunWithIterations {
  return {
    id: 7,
    organizationId: "org-a",
    scopeType: "project",
    scopeId: "proj-x",
    projectKey: "proj-x",
    goal: "ship phase 2",
    terminationCriteria: "build_goal_context returns a pack",
    status: "active",
    iterationCount: iterations.length,
    createdAt: "2026-06-27T00:00:00.000Z",
    updatedAt: "2026-06-27T00:00:00.000Z",
    closedAt: null,
    iterations,
    ...overrides,
  };
}

describe("buildGoalContextPack", () => {
  it("renders goal header, termination criteria, and reused context-pack sections", () => {
    const pack = buildGoalContextPack({ goalRun: goalRun([]), records: [] });

    expect(pack.goalRunId).toBe(7);
    expect(pack.markdown).toContain("## Goal");
    expect(pack.markdown).toContain("ship phase 2 (status: active; iterations: 0)");
    expect(pack.markdown).toContain("## Termination Criteria");
    expect(pack.markdown).toContain("## Recent Iterations\n- None yet.");
    // Reused context-pack contributes its standard sections.
    expect(pack.markdown).toContain("## Constraints");
  });

  it("omits termination criteria when absent", () => {
    const pack = buildGoalContextPack({
      goalRun: goalRun([], { terminationCriteria: null }),
      records: [],
    });
    expect(pack.markdown).not.toContain("## Termination Criteria");
  });

  it("shows the most recent iterations first, capped at five", () => {
    const iterations = Array.from({ length: 7 }, (_, i) =>
      iteration({ iterationIndex: i + 1, outcome: "partial" }),
    );
    const pack = buildGoalContextPack({ goalRun: goalRun(iterations), records: [] });

    // Most recent (#7) appears, oldest beyond the cap (#1, #2) do not.
    expect(pack.markdown).toContain("- #7 partial:");
    expect(pack.markdown).not.toContain("- #1 partial:");
    const firstIterationLine = pack.markdown
      .split("## Recent Iterations\n")[1]
      ?.split("\n")[0];
    expect(firstIterationLine).toContain("#7");
  });

  it("surfaces the most recent failure with an error as Last Error", () => {
    const iterations = [
      iteration({ iterationIndex: 1, outcome: "failure", error: "first boom" }),
      iteration({ iterationIndex: 2, outcome: "success" }),
      iteration({ iterationIndex: 3, outcome: "failure", error: "latest boom" }),
    ];
    const pack = buildGoalContextPack({ goalRun: goalRun(iterations), records: [] });

    expect(pack.markdown).toContain("## Last Error");
    const lastErrorBlock = pack.markdown
      .split("## Last Error\n")[1]
      ?.split("\n\n")[0];
    expect(lastErrorBlock).toContain("- #3: latest boom");
    expect(lastErrorBlock).not.toContain("first boom");
  });

  it("omits Last Error when no failure carries an error", () => {
    const iterations = [iteration({ iterationIndex: 1, outcome: "success" })];
    const pack = buildGoalContextPack({ goalRun: goalRun(iterations), records: [] });
    expect(pack.markdown).not.toContain("## Last Error");
  });
});
