import type { SearchMemoryResult } from "../types.js";

const SECTION_LIMITS = {
  project_summary: 2,
  recent_decisions: 5,
  constraints: 5,
  open_questions: 5,
  relevant_notes: 5,
} as const;

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
  records: readonly SearchMemoryResult[];
};

export function buildContextPack(
  input: BuildContextPackInput,
): ContextPack {
  const sections: ContextPackSections = {
    project_summary: [],
    recent_decisions: [],
    constraints: [],
    open_questions: [],
    relevant_notes: [],
  };

  for (const record of input.records) {
    if (isOpenQuestion(record)) {
      pushIfWithinLimit(sections.open_questions, record, SECTION_LIMITS.open_questions);
      continue;
    }

    if (isConstraint(record)) {
      pushIfWithinLimit(sections.constraints, record, SECTION_LIMITS.constraints);
      continue;
    }

    if (isDecision(record)) {
      pushIfWithinLimit(
        sections.recent_decisions,
        record,
        SECTION_LIMITS.recent_decisions,
      );
      continue;
    }

    if (isProjectSummary(record)) {
      pushIfWithinLimit(
        sections.project_summary,
        record,
        SECTION_LIMITS.project_summary,
      );
      continue;
    }

    pushIfWithinLimit(
      sections.relevant_notes,
      record,
      SECTION_LIMITS.relevant_notes,
    );
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

  // Within a section, project-scope records come before user-scope records.
  // Project scope changes less often than user scope, so this ordering keeps
  // the more stable lines at the section prefix and helps Claude prompt cache.
  // Array.sort is stable in ES2019+, so rank order within same scope is preserved.
  const sorted = [...records].sort((a, b) => scopeRank(a) - scopeRank(b));

  const lines = sorted.map((record) => {
    const sourceLabel = record.source.title ?? record.source.externalId;
    return `- ${toSingleLineExcerpt(record.content)} (${record.scopeType} scope; source: ${sourceLabel})`;
  });

  return `## ${title}\n${lines.join("\n")}`;
}

function scopeRank(record: SearchMemoryResult): number {
  return record.scopeType === "project" ? 0 : 1;
}

function pushIfWithinLimit(
  section: SearchMemoryResult[],
  record: SearchMemoryResult,
  limit: number,
): void {
  if (section.length < limit) {
    section.push(record);
  }
}

function toSingleLineExcerpt(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}
