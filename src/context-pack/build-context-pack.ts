import { rankResults } from "../search/rank-results.js";
import type { SearchMemoryResult } from "../types.js";

export type ContextPackSections = {
  project_summary: SearchMemoryResult[];
  recent_decisions: SearchMemoryResult[];
  constraints: SearchMemoryResult[];
  open_questions: SearchMemoryResult[];
  relevant_notes: SearchMemoryResult[];
};

export type ContextPack = {
  sections: ContextPackSections;
  markdown: string;
};

export type BuildContextPackInput = {
  records: SearchMemoryResult[];
};

export function buildContextPack(
  input: BuildContextPackInput,
): ContextPack {
  const rankedRecords = rankResults(input.records);
  const sections: ContextPackSections = {
    project_summary: [],
    recent_decisions: [],
    constraints: [],
    open_questions: [],
    relevant_notes: [],
  };

  for (const record of rankedRecords) {
    if (isOpenQuestion(record)) {
      sections.open_questions.push(record);
      continue;
    }

    if (isConstraint(record)) {
      sections.constraints.push(record);
      continue;
    }

    if (isDecision(record)) {
      sections.recent_decisions.push(record);
      continue;
    }

    if (isProjectSummary(record)) {
      sections.project_summary.push(record);
      continue;
    }

    sections.relevant_notes.push(record);
  }

  return {
    sections,
    markdown: renderMarkdown(sections),
  };
}

function isDecision(record: SearchMemoryResult): boolean {
  return (
    record.memoryType === "decision" || record.source.sourceType === "decision"
  );
}

function isConstraint(record: SearchMemoryResult): boolean {
  return /^\s*constraint:/i.test(record.content);
}

function isOpenQuestion(record: SearchMemoryResult): boolean {
  return /^\s*open question:/i.test(record.content);
}

function isProjectSummary(record: SearchMemoryResult): boolean {
  return (
    record.scopeType === "project" &&
    record.memoryType === "summary" &&
    !isConstraint(record) &&
    !isOpenQuestion(record)
  );
}

function renderMarkdown(sections: ContextPackSections): string {
  const blocks = [
    renderSection("Project Summary", sections.project_summary),
    renderSection("Recent Decisions", sections.recent_decisions),
    renderSection("Constraints", sections.constraints),
    renderSection("Open Questions", sections.open_questions),
    renderSection("Relevant Notes", sections.relevant_notes),
  ].filter(Boolean);

  return blocks.join("\n\n");
}

function renderSection(
  title: string,
  records: SearchMemoryResult[],
): string {
  if (records.length === 0) {
    return `## ${title}\n- None captured yet.`;
  }

  const lines = records.map((record) => {
    const sourceLabel = record.source.title ?? record.source.externalId;
    return `- ${record.content} (${record.scopeType} scope; source: ${sourceLabel})`;
  });

  return `## ${title}\n${lines.join("\n")}`;
}
