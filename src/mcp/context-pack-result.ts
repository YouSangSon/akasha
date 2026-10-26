import {
  buildContextPack,
  renderContextPackSections,
  type ContextPack,
  type ContextPackSections,
} from "../context-pack/build-context-pack.js";
import type { SearchMemoryResult } from "../types.js";
import type { BuildContextPackToolResult } from "./types.js";

export class ContextPackBudgetError extends Error {
  constructor(maxOutputBytes: number, requiredBytes: number) {
    super(`maxOutputBytes ${maxOutputBytes} cannot retain context scaffold and selected decisions and constraints; at least ${requiredBytes} bytes required`);
    this.name = "ContextPackBudgetError";
  }
}

export function buildContextPackResult(input: {
  projectKey: string;
  task: string;
  records: readonly SearchMemoryResult[];
  maxOutputBytes?: number;
}): BuildContextPackToolResult {
  const pack = buildContextPack({ records: input.records });
  const compose = (selected: ReadonlySet<number>): BuildContextPackToolResult => {
    const sections: ContextPackSections = {
      project_summary: [], recent_decisions: [], constraints: [], open_questions: [], relevant_notes: [],
    };
    const rationale = pack.selectionRationale.filter((entry) => selected.has(entry.inputRank));
    for (const entry of rationale) sections[entry.section].push(input.records[entry.inputRank - 1]!);
    return toResult(input.projectKey, input.task, {
      sections, selectionRationale: rationale, markdown: renderContextPackSections(sections),
    }, input.maxOutputBytes === undefined ? undefined : {
      maxOutputBytes: input.maxOutputBytes,
      omittedCount: pack.selectionRationale.length - rationale.length,
    });
  };
  if (input.maxOutputBytes === undefined) return toResult(input.projectKey, input.task, pack);

  const selected = new Set(pack.selectionRationale.map((entry) => entry.inputRank));
  const full = compose(selected);
  if (byteSize(full) <= input.maxOutputBytes) return full;

  selected.clear();
  for (const entry of pack.selectionRationale) {
    if (entry.section === "recent_decisions" || entry.section === "constraints") selected.add(entry.inputRank);
  }
  let result = compose(selected);
  if (byteSize(result) > input.maxOutputBytes) throw new ContextPackBudgetError(input.maxOutputBytes, byteSize(result));
  for (const entry of pack.selectionRationale) {
    if (selected.has(entry.inputRank)) continue;
    selected.add(entry.inputRank);
    const candidate = compose(selected);
    if (byteSize(candidate) <= input.maxOutputBytes) result = candidate;
    else selected.delete(entry.inputRank);
  }
  return result;
}

function byteSize(value: BuildContextPackToolResult): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function toResult(
  projectKey: string,
  task: string,
  pack: ContextPack,
  budget?: BuildContextPackToolResult["budget"],
): BuildContextPackToolResult {
  return {
    ok: true,
    projectKey,
    // Keep the stable memory body before the volatile task for prefix caching.
    packMarkdown: ["# Context Pack", "", pack.markdown, "", "---", `Task: ${task}`].join("\n"),
    selectedMemoryIds: pack.selectionRationale.map((entry) => entry.memoryId),
    sections: pack.sections,
    selectionRationale: pack.selectionRationale,
    ...(budget === undefined ? {} : { budget }),
  };
}
