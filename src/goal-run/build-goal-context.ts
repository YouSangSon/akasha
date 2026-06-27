import { buildContextPack } from "../context-pack/build-context-pack.js";
import type { GoalRunWithIterations, SearchMemoryResult } from "../types.js";

// How many of the most recent iterations to surface. Loop context cares most
// about what was just tried, not the full history.
const MAX_ITERATIONS_SHOWN = 5;

export type GoalContextPack = {
  goalRunId: number;
  markdown: string;
};

// Pure composition: a goal-oriented pack = goal header + termination criteria +
// recent iteration outcomes + last error, followed by the standard
// context-pack sections (constraints, open questions, relevant notes) built
// from the run's scope memories. No I/O — the handler fetches the run and
// records and passes them in.
export function buildGoalContextPack(input: {
  goalRun: GoalRunWithIterations;
  records: readonly SearchMemoryResult[];
}): GoalContextPack {
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
