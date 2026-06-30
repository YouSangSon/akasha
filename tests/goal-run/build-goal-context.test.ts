import { describe, expect, it } from "vitest";
import {
  buildGoalContextPack,
  type BuildGoalContextPackInput,
} from "../../src/goal-run/build-goal-context.js";
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
    closeNote: null,
    iterations,
    ...overrides,
  };
}

const callBuildGoalContextPack = (input: unknown) => () =>
  buildGoalContextPack(input as BuildGoalContextPackInput);

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

  it.each([undefined, null, "input", 12, true, []])(
    "rejects non-object direct input",
    (input) => {
      expect(callBuildGoalContextPack(input)).toThrow(
        "buildGoalContextPack input must be an object",
      );
    },
  );

  it("rejects invalid top-level goal context input fields", () => {
    expect(
      callBuildGoalContextPack({ goalRun: null, records: [] }),
    ).toThrow("goalRun must be an object");

    expect(
      callBuildGoalContextPack({ goalRun: goalRun([]), records: {} }),
    ).toThrow("records must be an array");
  });

  it.each([
    ["id", { id: 0 }, "goalRun.id must be a positive safe integer"],
    ["goal", { goal: null }, "goalRun.goal must be a string"],
    ["status", { status: 12 }, "goalRun.status must be a string"],
    [
      "iterationCount",
      { iterationCount: -1 },
      "goalRun.iterationCount must be a non-negative safe integer",
    ],
    [
      "terminationCriteria",
      { terminationCriteria: 12 },
      "goalRun.terminationCriteria must be a string or null",
    ],
    [
      "iterations",
      { iterations: null },
      "goalRun.iterations must be an array",
    ],
  ])("rejects invalid goalRun field: %s", (_label, overrides, message) => {
    expect(
      callBuildGoalContextPack({
        goalRun: goalRun([], overrides as Partial<GoalRunWithIterations>),
        records: [],
      }),
    ).toThrow(message);
  });

  it.each([
    [null, "goalRun.iterations[0] must be an object"],
    [
      { iterationIndex: 0, outcome: "success", attempt: "done" },
      "goalRun.iterations[0].iterationIndex must be a positive safe integer",
    ],
    [
      { iterationIndex: 1, outcome: "success", attempt: 12 },
      "goalRun.iterations[0].attempt must be a string",
    ],
    [
      { iterationIndex: 1, outcome: null, attempt: "done" },
      "goalRun.iterations[0].outcome must be a string",
    ],
    [
      { iterationIndex: 1, outcome: "success", attempt: "done" },
      "goalRun.iterations[0].summary must be a string or null",
    ],
    [
      {
        iterationIndex: 1,
        outcome: "success",
        attempt: "done",
        summary: null,
      },
      "goalRun.iterations[0].error must be a string or null",
    ],
  ])("rejects invalid iteration render fields", (badIteration, message) => {
    expect(
      callBuildGoalContextPack({
        goalRun: goalRun([badIteration as GoalRunIteration]),
        records: [],
      }),
    ).toThrow(message);
  });
});
