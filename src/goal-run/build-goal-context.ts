import { buildContextPack } from "../context-pack/build-context-pack.js";
import type { GoalRunWithIterations, SearchMemoryResult } from "../types.js";

// How many of the most recent iterations to surface. Loop context cares most
// about what was just tried, not the full history.
const MAX_ITERATIONS_SHOWN = 5;

export type GoalContextPack = {
  goalRunId: number;
  markdown: string;
};

export type BuildGoalContextPackInput = {
  goalRun: GoalRunWithIterations;
  records: readonly SearchMemoryResult[];
};

// Pure composition: a goal-oriented pack = goal header + termination criteria +
// recent iteration outcomes + last error, followed by the standard
// context-pack sections (constraints, open questions, relevant notes) built
// from the run's scope memories. No I/O — the handler fetches the run and
// records and passes them in.
export function buildGoalContextPack(
  input: BuildGoalContextPackInput,
): GoalContextPack {
  assertBuildGoalContextPackInput(input);

  const { goalRun, records } = input;
  const contextPack = buildContextPack({ records });

  const blocks = [
    renderGoalHeader(goalRun),
    renderTermination(goalRun),
    renderRecentIterations(goalRun.iterations),
    renderLastError(goalRun.iterations),
    contextPack.markdown,
  ].filter((block): block is string => block.length > 0);

  return { goalRunId: goalRun.id, markdown: blocks.join("\n\n") };
}

function assertBuildGoalContextPackInput(
  input: unknown,
): asserts input is BuildGoalContextPackInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("buildGoalContextPack input must be an object");
  }

  const candidate = input as Record<string, unknown>;
  assertGoalRun(candidate.goalRun);

  if (!Array.isArray(candidate.records)) {
    throw new Error("records must be an array");
  }
}

function assertGoalRun(value: unknown): asserts value is GoalRunWithIterations {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("goalRun must be an object");
  }

  const goalRun = value as Record<string, unknown>;
  assertPositiveSafeInteger(goalRun.id, "goalRun.id");
  assertStringField(goalRun.goal, "goalRun.goal");
  assertStringField(goalRun.status, "goalRun.status");
  assertNonNegativeSafeInteger(
    goalRun.iterationCount,
    "goalRun.iterationCount",
  );
  assertOptionalStringOrNullField(
    goalRun.terminationCriteria,
    "goalRun.terminationCriteria",
  );

  if (!Array.isArray(goalRun.iterations)) {
    throw new Error("goalRun.iterations must be an array");
  }

  for (const [index, iteration] of goalRun.iterations.entries()) {
    assertGoalRunIteration(iteration, index);
  }
}

function assertGoalRunIteration(iteration: unknown, index: number): void {
  const prefix = `goalRun.iterations[${index}]`;

  if (
    typeof iteration !== "object" ||
    iteration === null ||
    Array.isArray(iteration)
  ) {
    throw new Error(`${prefix} must be an object`);
  }

  const candidate = iteration as Record<string, unknown>;
  assertPositiveSafeInteger(
    candidate.iterationIndex,
    `${prefix}.iterationIndex`,
  );
  assertStringField(candidate.attempt, `${prefix}.attempt`);
  assertStringField(candidate.outcome, `${prefix}.outcome`);
  assertStringOrNullField(candidate.summary, `${prefix}.summary`);
  assertStringOrNullField(candidate.error, `${prefix}.error`);
}

function assertPositiveSafeInteger(value: unknown, fieldName: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive safe integer`);
  }
}

function assertNonNegativeSafeInteger(value: unknown, fieldName: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative safe integer`);
  }
}

function assertStringField(value: unknown, fieldName: string): void {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
}

function assertStringOrNullField(value: unknown, fieldName: string): void {
  if (typeof value !== "string" && value !== null) {
    throw new Error(`${fieldName} must be a string or null`);
  }
}

function assertOptionalStringOrNullField(
  value: unknown,
  fieldName: string,
): void {
  if (value !== undefined) {
    assertStringOrNullField(value, fieldName);
  }
}

function renderGoalHeader(goalRun: GoalRunWithIterations): string {
  return `## Goal\n- ${toSingleLine(goalRun.goal)} (status: ${goalRun.status}; iterations: ${goalRun.iterationCount})`;
}

function renderTermination(goalRun: GoalRunWithIterations): string {
  if (!goalRun.terminationCriteria) {
    return "";
  }
  return `## Termination Criteria\n- ${toSingleLine(goalRun.terminationCriteria)}`;
}

function renderRecentIterations(
  iterations: GoalRunWithIterations["iterations"],
): string {
  if (iterations.length === 0) {
    return "## Recent Iterations\n- None yet.";
  }

  // Most recent first, capped.
  const recent = [...iterations]
    .sort((a, b) => b.iterationIndex - a.iterationIndex)
    .slice(0, MAX_ITERATIONS_SHOWN);

  const lines = recent.map((iteration) => {
    const detail = iteration.summary ?? iteration.attempt;
    const errorSuffix = iteration.error
      ? `; error: ${toSingleLine(iteration.error)}`
      : "";
    return `- #${iteration.iterationIndex} ${iteration.outcome}: ${toSingleLine(detail)}${errorSuffix}`;
  });

  return `## Recent Iterations\n${lines.join("\n")}`;
}

function renderLastError(
  iterations: GoalRunWithIterations["iterations"],
): string {
  const lastFailure = [...iterations]
    .sort((a, b) => b.iterationIndex - a.iterationIndex)
    .find((iteration) => iteration.outcome === "failure" && iteration.error);

  if (!lastFailure || !lastFailure.error) {
    return "";
  }

  return `## Last Error\n- #${lastFailure.iterationIndex}: ${toSingleLine(lastFailure.error)}`;
}

function toSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
